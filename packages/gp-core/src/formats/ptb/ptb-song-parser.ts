// Port of TuxGuitar app.tuxguitar.io.ptb.PTSongParser (LGPL-2.1): the played-out Power Tab scores become a Song.
import { GpFormatError } from '../../errors';
import { DEFAULT_CHANNEL, EMPTY_NOTE_EFFECT, EMPTY_SONG_INFO, NORMAL_TUPLET, STANDARD_TUNING, durationTicks, isNoteValue } from '../../model/defaults';
import {
  type Bend,
  type Duration,
  type GuitarString,
  type Note,
  QUARTER_TIME,
  type Song,
  type SongInfo,
  type SourceInfo,
  type TimeSignature,
} from '../../model/song';
import { type DraftTrack, SongDraft } from '../common/song-draft';
import { DEFAULT_VELOCITY } from '../common/velocity';
import { clefFromTuning } from '../gtp/shared';
import {
  type PtBar,
  type PtBeat,
  type PtComponent,
  type PtGuitarIn,
  type PtNote,
  type PtSong,
  type PtSongInfo,
  type PtTempo,
  type PtTrack,
  type PtTrackInfo,
  defaultTrackInfo,
  findTrackInfo,
} from './ptb-model';
import { synchronizeSong } from './ptb-synchronizer';
import { TrackInfoHelper } from './track-info-helper';
import { TrackStartHelper } from './track-start-helper';

const MAX_MIDI_VALUE = 127;
/** More strings than any Power Tab instrument (3–7) has. */
const MAX_STRINGS = 12;
/** An arpeggio becomes a stroke this fast. */
const ARPEGGIO_STROKE_VALUE = 16;
/** TGEffectBend.SEMITONE_LENGTH * 4: a full bend. */
const FULL_BEND = 4;
const SHIFT_SLIDE = ['shift'] as const;

/** The guitar of a score that names none (TuxGuitar fails on such a file). */
const FALLBACK_TRACK_INFO: PtTrackInfo = {
  number: 0,
  name: '',
  instrument: DEFAULT_CHANNEL.program,
  volume: DEFAULT_CHANNEL.volume,
  balance: DEFAULT_CHANNEL.balance,
  strings: STANDARD_TUNING,
};

/** makeBend: the curve of each Power Tab bend type, as [position, value] points. */
const BEND_SHAPES: ReadonlyMap<number, readonly (readonly [number, number])[]> = new Map([
  [1, [[0, 0], [6, FULL_BEND], [12, FULL_BEND]]],
  [2, [[0, 0], [3, FULL_BEND], [6, FULL_BEND], [9, 0], [12, 0]]],
  [3, [[0, 0], [6, FULL_BEND], [12, FULL_BEND]]],
  [4, [[0, FULL_BEND], [12, FULL_BEND]]],
  [5, [[0, FULL_BEND], [4, FULL_BEND], [8, 0], [12, 0]]],
  [6, [[0, 8], [12, 8]]],
  [7, [[0, FULL_BEND], [4, FULL_BEND], [8, 0], [12, 0]]],
  [8, [[0, FULL_BEND], [4, FULL_BEND], [8, 0], [12, 0]]],
]);

/** PTSongParser.parseSong: both scores share one timeline from QUARTER_TIME; each staff of a score gets a track. */
export function parsePtSong(song: PtSong, source: SourceInfo): Song {
  return new PtSongParser().parseSong(song, source);
}

class PtSongParser {
  private readonly draft = new SongDraft();
  private readonly infoHelper = new TrackInfoHelper();
  private readonly startHelper = new TrackStartHelper();
  /**
   * The time signature of the bar being read, given to the measures it creates. TuxGuitar leaves every measure in 4/4 and
   * lays the beats along it; here the measures follow the Power Tab bars.
   */
  private timeSignature: TimeSignature | undefined;

  parseSong(song: PtSong, source: SourceInfo): Song {
    const played = synchronizeSong(song);
    this.parseTrack(played.track1);
    this.parseTrack(played.track2);
    // TuxGuitar's song gets its first measure with its first track; a score without beats or guitars still needs both.
    if (this.draft.tracks.length === 0) {
      this.createTrack(defaultTrackInfo(played.track1) ?? FALLBACK_TRACK_INFO);
    }
    if (this.draft.headers.length === 0) {
      this.draft.addHeader();
    }
    return this.draft.toSong(source, toSongInfo(song.info));
  }

  private parseTrack(track: PtTrack): void {
    this.infoHelper.reset(defaultTrackInfo(track));
    this.timeSignature = undefined;
    let start = QUARTER_TIME;
    for (const section of track.sections) {
      this.startHelper.init(section.staffs);
      this.startHelper.initVoices(start);
      for (const position of section.positions) {
        position.components.forEach((component) => this.parseComponent(track, component));
      }
      start = this.startHelper.getMaxStart();
    }
  }

  private parseComponent(track: PtTrack, component: PtComponent): void {
    switch (component.kind) {
      case 'bar':
        this.parseBar(component);
        break;
      case 'guitarIn':
        this.parseGuitarIn(track, component);
        break;
      case 'tempo':
        this.parseTempo(component);
        break;
      case 'beat':
        this.parseBeat(component);
        break;
      default:
        break;
    }
  }

  /** A bar line: every voice moves on to the latest one; a time signature starts a bar of that length. */
  private parseBar(bar: PtBar): void {
    const helper = this.startHelper;
    helper.initVoices(helper.getMaxStart());
    if (bar.numerator > 0 && bar.denominator > 0) {
      helper.barStart = helper.getMaxStart();
      helper.barLength = Math.trunc(bar.numerator * (QUARTER_TIME * (4 / bar.denominator)));
      if (isNoteValue(bar.denominator)) {
        this.timeSignature = { numerator: bar.numerator, denominator: bar.denominator };
        // A measure a tempo marker made just before the bar line takes the bar's time signature too.
        this.draft.retimeOpenHeader(helper.barStart, this.timeSignature);
      }
    }
  }

  /** From here on the staff is played by the named guitar: an unused track with the same settings, else a new one. */
  private parseGuitarIn(track: PtTrack, guitarIn: PtGuitarIn): void {
    const info = findTrackInfo(track, guitarIn.trackInfo);
    if (info === undefined) {
      return;
    }
    while (this.infoHelper.countStaffTracks() > guitarIn.staff) {
      this.infoHelper.removeStaffTrack(this.infoHelper.countStaffTracks() - 1);
    }
    const reusable = this.draft.tracks.find((existing) => this.hasSameInfo(existing, info) && !this.infoHelper.hasStaffTrack(existing));
    if (reusable !== undefined) {
      this.infoHelper.addStaffTrack(reusable);
      return;
    }
    this.createTrack(info);
  }

  /** The tempo (and triplet feel) of the measure the score has reached, in the first track. */
  private parseTempo(tempo: PtTempo): void {
    const track = this.draft.tracks[0] ?? this.createTrack(this.defaultInfo());
    const header = this.draft.ensureMeasureAt(track, this.startHelper.getMaxStart(), this.timeSignature).header;
    header.tempo = tempo.tempo;
    header.tripletFeel = tempo.tripletFeel;
  }

  private parseBeat(beat: PtBeat): void {
    const helper = this.startHelper;
    if (beat.grace) {
      return; // TuxGuitar leaves grace notes out
    }
    if (beat.multiBarRest > 1) {
      helper.setVoiceStart(beat.staff, beat.voice, helper.barStart + beat.multiBarRest * helper.barLength);
      return;
    }
    const start = helper.getVoiceStart(beat.staff, beat.voice);
    const track = this.infoHelper.getStaffTrack(beat.staff) ?? this.createTrack(this.defaultInfo());
    const draftBeat = this.draft.beatAt(this.draft.ensureMeasureAt(track, start, this.timeSignature), start);
    const voice = draftBeat.voices[beat.voice === 0 ? 0 : 1];
    voice.isEmpty = false;
    voice.duration = durationOf(beat);
    voice.notes.push(...beat.notes.filter((note) => note.string <= track.strings.length).map((note) => toNote(note, beat)));
    if (beat.arpeggioUp || beat.arpeggioDown) {
      draftBeat.stroke = { direction: beat.arpeggioUp ? 'down' : 'up', value: ARPEGGIO_STROKE_VALUE };
    }
    const isRest = voice.notes.length === 0;
    helper.checkBeat(isRest);
    // A rest that starts a bar lasts at most the bar.
    const length = durationTicks(voice.duration);
    const isWholeBarRest = isRest && draftBeat.start === helper.barStart && length > helper.barLength;
    helper.setVoiceStart(beat.staff, beat.voice, draftBeat.start + (isWholeBarRest ? helper.barLength : length));
  }

  private defaultInfo(): PtTrackInfo {
    return this.infoHelper.getDefaultInfo() ?? FALLBACK_TRACK_INFO;
  }

  /** createTrack + setTrackInfo: a track and its own channel, given to the next staff. */
  private createTrack(info: PtTrackInfo): DraftTrack {
    const strings = toStrings(info);
    const channel = this.draft.addChannel({ ...DEFAULT_CHANNEL, ...channelValues(info) });
    const track = this.draft.addTrack({ name: info.name, channelId: channel.id, strings, offset: 0, clef: clefFromTuning(strings, false) });
    this.infoHelper.addStaffTrack(track);
    return track;
  }

  private hasSameInfo(track: DraftTrack, info: PtTrackInfo): boolean {
    const channel = this.draft.channels.find((candidate) => candidate.id === track.channelId);
    if (channel === undefined || info.name !== track.name) {
      return false;
    }
    const values = channelValues(info);
    const isSameSound = values.program === channel.program && values.volume === channel.volume && values.balance === channel.balance;
    const strings = toStrings(info);
    return isSameSound && strings.length === track.strings.length && strings.every((s, i) => s.tuning === track.strings[i]?.tuning);
  }
}

/** A guitar's MIDI values, kept in 0…127 (a Power Tab byte can hold more). */
function channelValues(info: PtTrackInfo): { readonly program: number; readonly volume: number; readonly balance: number } {
  const clamp = (value: number): number => Math.min(MAX_MIDI_VALUE, value);
  return { program: clamp(info.instrument), volume: clamp(info.volume), balance: clamp(info.balance) };
}

function toStrings(info: PtTrackInfo): readonly GuitarString[] {
  if (info.strings.length === 0 || info.strings.length > MAX_STRINGS) {
    throw new GpFormatError(`Power Tab guitar "${info.name}" has ${info.strings.length} strings`);
  }
  return info.strings.map((tuning, i) => ({ number: i + 1, tuning: Math.min(MAX_MIDI_VALUE, tuning) }));
}

function durationOf(beat: PtBeat): Duration {
  if (!isNoteValue(beat.duration)) {
    throw new GpFormatError(`Unsupported Power Tab duration ${beat.duration}`);
  }
  const isNormal = beat.enters === 1 && beat.times === 1;
  return {
    value: beat.duration,
    dotted: beat.dotted,
    doubleDotted: beat.doubleDotted,
    tuplet: isNormal ? NORMAL_TUPLET : { enters: beat.enters, times: beat.times },
  };
}

function toNote(note: PtNote, beat: PtBeat): Note {
  const bend = toBend(note.bend);
  return {
    fret: note.value,
    velocity: DEFAULT_VELOCITY,
    string: note.string,
    isTied: note.tied,
    effect: {
      ...EMPTY_NOTE_EFFECT,
      vibrato: beat.vibrato,
      deadNote: note.dead,
      slides: note.slide ? SHIFT_SLIDE : [],
      ...(bend !== undefined ? { bend } : {}),
    },
  };
}

function toBend(type: number): Bend | undefined {
  const shape = BEND_SHAPES.get(type);
  return shape === undefined ? undefined : { points: shape.map(([position, value]) => ({ position, value })) };
}

/**
 * parseProperties. Unlike TuxGuitar, the artist (Power Tab's "interpret") and lyricist are kept, the composer is the
 * music, the arranger stands in when there is no transcriber, and the instructions keep a line break between the
 * guitar and bass parts.
 */
function toSongInfo(info: PtSongInfo): SongInfo {
  const transcribers = [info.guitarTranscriber, info.bassTranscriber].filter((name) => name !== '').join(' - ');
  const instructions = [info.instructions, info.guitarInstructions, info.bassInstructions].filter((text) => text !== '');
  return {
    ...EMPTY_SONG_INFO,
    title: info.name,
    artist: info.interpret,
    album: info.album,
    words: info.lyricist,
    music: info.author,
    copyright: info.copyright,
    transcriber: transcribers !== '' ? transcribers : info.arranger,
    instructions: instructions.join('\n'),
  };
}
