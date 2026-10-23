// Port of TuxGuitar app.tuxguitar.song.managers.TGSongManager / TGTrackManager / TGMeasureManager (LGPL-2.1): the parts
// the Power Tab and TablEdit readers build their song with, on drafts that change while the reader runs and become a Song once.
import { GpFormatError } from '../../errors';
import { NO_STROKE, QUARTER, RED, measureTicks } from '../../model/defaults';
import {
  type Beat,
  type Channel,
  type Chord,
  type Clef,
  type Duration,
  type GuitarString,
  type Lyrics,
  type Measure,
  type MeasureHeader,
  type Note,
  QUARTER_TIME,
  type Song,
  type SongInfo,
  type SourceInfo,
  type Stroke,
  type TimeSignature,
  type Track,
  type TripletFeel,
  type Voice,
} from '../../model/song';
import { createChannelName } from './channels';

/** Measures a reader may create; a corrupt count, rest or position must not make it allocate without end. */
export const MAX_DRAFT_MEASURES = 4096;

/** TGTempo's default. */
const DEFAULT_TEMPO = 120;
const FOUR_FOUR: TimeSignature = { numerator: 4, denominator: 4 };

/** A measure header while the reader still sets its tempo, repeats and triplet feel. */
export interface DraftHeader {
  readonly number: number;
  readonly start: number;
  timeSignature: TimeSignature;
  tempo: number;
  tripletFeel: TripletFeel;
  repeatOpen: boolean;
  repeatClose: number;
  repeatAlternative: number;
}

export interface DraftVoice {
  duration: Duration;
  readonly notes: Note[];
  isEmpty: boolean;
}

/** A beat with TGBeat's two voices. */
export interface DraftBeat {
  readonly start: number;
  readonly voices: readonly [DraftVoice, DraftVoice];
  stroke: Stroke;
  chord?: Chord;
  text?: string;
}

export interface DraftMeasure {
  readonly header: DraftHeader;
  readonly clef: Clef;
  keySignature: number;
  readonly beats: DraftBeat[];
}

export interface DraftTrack {
  readonly number: number;
  readonly name: string;
  readonly channelId: number;
  readonly strings: readonly GuitarString[];
  readonly offset: number;
  readonly clef: Clef;
  readonly lyrics?: Lyrics;
  readonly measures: DraftMeasure[];
}

/** What a new track starts with; its measures follow the song's headers. */
export type TrackSetup = Omit<DraftTrack, 'number' | 'measures'>;

/** The channel a reader adds, before the song names it (TGSongManager.createChannelNameFromProgram) and numbers it. */
export type ChannelSetup = Omit<Channel, 'id' | 'name'>;

/** A voice no beat uses yet (TGVoice: a quarter, empty). */
export function emptyDraftVoice(): DraftVoice {
  return { duration: QUARTER, notes: [], isEmpty: true };
}

/** A song under construction: measure headers shared by every track, each track one measure per header. */
export class SongDraft {
  readonly headers: DraftHeader[] = [];
  readonly tracks: DraftTrack[] = [];
  readonly channels: Channel[] = [];

  /**
   * TGSongManager.addNewMeasureBeforeEnd: a header after the last one, with its tempo and triplet feel, and a measure in
   * every track (with the clef and key of the track's last measure). The first header is fillSong's: 4/4 at QUARTER_TIME.
   * `timeSignature` replaces the copied one.
   */
  addHeader(timeSignature?: TimeSignature): DraftHeader {
    if (this.headers.length >= MAX_DRAFT_MEASURES) {
      throw new GpFormatError(`The song is longer than ${MAX_DRAFT_MEASURES} measures`);
    }
    const last = this.headers[this.headers.length - 1];
    const header: DraftHeader = {
      number: this.headers.length + 1,
      start: last === undefined ? QUARTER_TIME : last.start + headerLength(last),
      timeSignature: timeSignature ?? last?.timeSignature ?? FOUR_FOUR,
      tempo: last?.tempo ?? DEFAULT_TEMPO,
      tripletFeel: last?.tripletFeel ?? 'none',
      repeatOpen: false,
      repeatClose: 0,
      repeatAlternative: 0,
    };
    this.headers.push(header);
    for (const track of this.tracks) {
      const previous = track.measures[track.measures.length - 1];
      track.measures.push(newMeasure(header, previous?.clef ?? track.clef, previous?.keySignature ?? 0));
    }
    return header;
  }

  /**
   * Gives the last header another time signature while it starts at `start` and no track has a beat in it yet (its length
   * moves no other header). Not in TuxGuitar.
   */
  retimeOpenHeader(start: number, timeSignature: TimeSignature): void {
    const header = this.headers[this.headers.length - 1];
    const isOpen = this.tracks.every((track) => (track.measures[track.measures.length - 1]?.beats.length ?? 0) === 0);
    if (header !== undefined && header.start === start && isOpen) {
      header.timeSignature = timeSignature;
    }
  }

  /** TGSongManager.addChannel: the next free id, named after its program. */
  addChannel(setup: ChannelSetup): Channel {
    const id = this.channels.reduce((max, channel) => Math.max(max, channel.id), 0) + 1;
    const channel: Channel = { ...setup, id, name: createChannelName(this.channels, setup.program, setup.isPercussion) };
    this.channels.push(channel);
    return channel;
  }

  /** TGSongManager.addTrack: numbered after the last track, one empty measure per header. */
  addTrack(setup: TrackSetup): DraftTrack {
    const measures = this.headers.map((header) => newMeasure(header, setup.clef, 0));
    const track: DraftTrack = { ...setup, number: this.tracks.length + 1, measures };
    this.tracks.push(track);
    return track;
  }

  /** TGTrackManager.getMeasureAt: the measure whose span holds `start`. */
  measureAt(track: DraftTrack, start: number): DraftMeasure | undefined {
    const index = this.headerIndexAt(start);
    return index === undefined ? undefined : track.measures[index];
  }

  /** PTSongParser.getMeasure: adds headers (`timeSignature`, else the last one's) until one holds `start`. */
  ensureMeasureAt(track: DraftTrack, start: number, timeSignature?: TimeSignature): DraftMeasure {
    if (start < QUARTER_TIME) {
      throw new GpFormatError(`No measure can start at tick ${start}`);
    }
    for (;;) {
      const measure = this.measureAt(track, start);
      if (measure !== undefined) {
        return measure;
      }
      this.addHeader(timeSignature);
    }
  }

  /** TGMeasureManager.getBeat, else a new beat at `start`. */
  beatAt(measure: DraftMeasure, start: number): DraftBeat {
    const found = measure.beats.find((beat) => beat.start === start);
    if (found !== undefined) {
      return found;
    }
    const beat: DraftBeat = { start, voices: [emptyDraftVoice(), emptyDraftVoice()], stroke: NO_STROKE };
    measure.beats.push(beat);
    return beat;
  }

  /** The finished song; beats are ordered by start (TGSongManager.orderBeats). */
  toSong(source: SourceInfo, info: SongInfo): Song {
    const percussion = new Set(this.channels.filter((channel) => channel.isPercussion).map((channel) => channel.id));
    return {
      source,
      info,
      channels: [...this.channels],
      measureHeaders: this.headers.map(toMeasureHeader),
      tracks: this.tracks.map((track) => toTrack(track, percussion.has(track.channelId))),
    };
  }

  /** Headers are contiguous and in order, so a binary search finds the one holding `start`. */
  private headerIndexAt(start: number): number | undefined {
    let low = 0;
    let high = this.headers.length - 1;
    while (low <= high) {
      const middle = (low + high) >> 1;
      const header = this.headers[middle];
      if (header === undefined) {
        return undefined;
      }
      if (start < header.start) {
        high = middle - 1;
      } else if (start >= header.start + headerLength(header)) {
        low = middle + 1;
      } else {
        return middle;
      }
    }
    return undefined;
  }
}

export function headerLength(header: Pick<MeasureHeader, 'timeSignature'>): number {
  return measureTicks(header.timeSignature.numerator, header.timeSignature.denominator);
}

function newMeasure(header: DraftHeader, clef: Clef, keySignature: number): DraftMeasure {
  return { header, clef, keySignature, beats: [] };
}

function toMeasureHeader(header: DraftHeader): MeasureHeader {
  return {
    number: header.number,
    start: header.start,
    timeSignature: header.timeSignature,
    tempo: header.tempo,
    repeatOpen: header.repeatOpen,
    repeatClose: header.repeatClose,
    repeatAlternative: header.repeatAlternative,
    tripletFeel: header.tripletFeel,
  };
}

function toTrack(track: DraftTrack, isPercussion: boolean): Track {
  return {
    number: track.number,
    name: track.name,
    channelId: track.channelId,
    strings: track.strings,
    color: RED,
    offset: track.offset,
    isPercussion,
    solo: false,
    mute: false,
    ...(track.lyrics !== undefined ? { lyrics: track.lyrics } : {}),
    measures: track.measures.map((measure, index) => toMeasure(measure, index, isPercussion)),
  };
}

function toMeasure(measure: DraftMeasure, headerIndex: number, isPercussion: boolean): Measure {
  // Stable, as Collections.sort in TGMeasureManager.orderBeats.
  const beats = [...measure.beats].sort((a, b) => a.start - b.start).map(toBeat);
  return { headerIndex, clef: measure.clef, keySignature: isPercussion ? 0 : measure.keySignature, beats };
}

function toBeat(beat: DraftBeat): Beat {
  return {
    start: beat.start,
    voices: beat.voices.map(toVoice),
    stroke: beat.stroke,
    pickStroke: 'none',
    ...(beat.chord !== undefined ? { chord: beat.chord } : {}),
    ...(beat.text !== undefined ? { text: beat.text } : {}),
  };
}

function toVoice(voice: DraftVoice): Voice {
  return { duration: voice.duration, notes: [...voice.notes], isEmpty: voice.isEmpty, direction: 'none' };
}
