// Port of TuxGuitar app.tuxguitar.io.tef3.TESongParser (LGPL-2.1): a TablEdit song becomes a Song.
import { DEFAULT_CHANNEL, DEFAULT_PERCUSSION_BANK, EMPTY_SONG_INFO, NO_STROKE, durationTicks } from '../../model/defaults';
import type { Clef, GuitarString, Song, SongInfo, SourceInfo } from '../../model/song';
import { type DraftMeasure, type DraftTrack, SongDraft, emptyDraftVoice } from '../common/song-draft';
import { splitPreciseDuration, wholePreciseLength } from '../gtp/legacy-duration';
import { TE_CLEF, TE_PERCUSSION_PROGRAM, type TeSong, type TeTrack, sortComponents } from './tef-model';
import { addComponents } from './tef-components-to-song';
import { adjustMeasures } from './tef-song-adjuster';
import { buildComponentOffsets } from './tef-timeline';

const MAX_MIDI_VALUE = 127;
/** Track volume and pan are 0–15 (the high bits hold something else); volume 0 is the loudest. */
const TE_LEVEL_MASK = 0x0f;
const TE_LEVEL_MAX = 15;
/** Tuning bytes count down from this pitch. */
const TUNING_BASE = 96;
const DEFAULT_TEMPO = 120;
const MIN_KEY = -7;
const MAX_KEY = 7;
const LINE_BREAK = /\r\n|\r|\n/;

const CLEFS: ReadonlyMap<number, Clef> = new Map<number, Clef>([
  [TE_CLEF.TREBLE, 'treble'],
  [TE_CLEF.BASS, 'bass'],
  [TE_CLEF.TENOR, 'tenor'],
  [TE_CLEF.ALTO, 'alto'],
]);

/** TESongParser.parseSong. */
export function parseTeSong(song: TeSong, source: SourceInfo): Song {
  const draft = new SongDraft();
  addMeasureHeaders(draft, song);
  song.tracks.forEach((track, index) => addTrack(draft, song, track, index));
  draft.tracks.forEach((track) => track.measures.forEach(fillWithRests));
  const components = sortComponents(song.components);
  addComponents(draft, song, components, buildComponentOffsets(components));
  draft.tracks.forEach((track) => adjustMeasures(track.measures));
  return draft.toSong(source, toSongInfo(song));
}

/** One header per TablEdit measure (at least one), all at the file's tempo. */
function addMeasureHeaders(draft: SongDraft, song: TeSong): void {
  const tempo = song.fileMetadata.initialBpm > 0 ? song.fileMetadata.initialBpm : DEFAULT_TEMPO;
  const timeSignatures = song.measures.length === 0 ? [undefined] : song.measures.map((measure) => measure.timeSignature);
  for (const timeSignature of timeSignatures) {
    const header = draft.addHeader(timeSignature);
    header.tempo = tempo;
  }
}

/** addTracks: the track, its channel, lyrics, strings, clef and the key signature of each measure. */
function addTrack(draft: SongDraft, song: TeSong, track: TeTrack, index: number): void {
  const isPercussion = track.midiInstrument === TE_PERCUSSION_PROGRAM;
  const channel = draft.addChannel({
    ...DEFAULT_CHANNEL,
    // A drum kit plays program 0 of the percussion bank (TuxGuitar keeps TablEdit's 96 there).
    program: isPercussion ? 0 : Math.min(MAX_MIDI_VALUE, track.midiInstrument),
    bank: isPercussion ? DEFAULT_PERCUSSION_BANK : 0,
    volume: Math.trunc(((TE_LEVEL_MAX - (track.volume & TE_LEVEL_MASK)) * MAX_MIDI_VALUE) / TE_LEVEL_MAX),
    balance: Math.trunc(((track.pan & TE_LEVEL_MASK) * MAX_MIDI_VALUE) / TE_LEVEL_MAX),
    chorus: toneLevel(song.fileMetadata.toneChorus),
    reverb: toneLevel(song.fileMetadata.toneReverb),
    isPercussion,
  });
  const lyrics = [...song.songMetadata.lyrics].reverse().find((candidate) => candidate.trackIndex === index);
  const draftTrack = draft.addTrack({
    name: track.name,
    channelId: channel.id,
    strings: toStrings(track, isPercussion),
    offset: track.capo,
    clef: CLEFS.get(track.clef) ?? 'treble',
    ...(lyrics !== undefined ? { lyrics: { from: 1, text: lyrics.text } } : {}),
  });
  song.measures.forEach((measure, measureIndex) => setKeySignature(draftTrack, measureIndex, measure.keySignature));
}

/** TuxGuitar's (short)(tone << 8), kept in 0…127. */
function toneLevel(tone: number): number {
  return Math.max(0, Math.min(MAX_MIDI_VALUE, ((tone << 8) << 16) >> 16));
}

/**
 * A drum track's strings are tuned to 0. TablEdit stores the sounding pitch, the capo included, and the frets from the
 * capo; the model adds the capo (Track.offset) to the open strings, so it is taken off here (TuxGuitar adds it twice).
 */
function toStrings(track: TeTrack, isPercussion: boolean): readonly GuitarString[] {
  return track.tuning.map((value, i) => ({
    number: i + 1,
    tuning: isPercussion ? 0 : Math.max(0, Math.min(MAX_MIDI_VALUE, TUNING_BASE - value - track.capo)),
  }));
}

function setKeySignature(track: DraftTrack, measureIndex: number, keySignature: number): void {
  const measure = track.measures[measureIndex];
  if (measure !== undefined && keySignature >= MIN_KEY && keySignature <= MAX_KEY) {
    measure.keySignature = keySignature;
  }
}

/** changeTimeSignature's autoCompleteSilences: an empty measure starts as rests filling its first voice. */
function fillWithRests(measure: DraftMeasure): void {
  const length = wholePreciseLength(measure.header.timeSignature);
  let start = measure.header.start;
  for (const duration of splitPreciseDuration(length, length) ?? []) {
    const voice = emptyDraftVoice();
    voice.duration = duration;
    voice.isEmpty = false;
    measure.beats.push({ start, voices: [voice, emptyDraftVoice()], stroke: NO_STROKE });
    start += durationTicks(duration);
  }
}

/** addSongHeader: the author wrote both words and music; the comments become the notice. */
function toSongInfo(song: TeSong): SongInfo {
  const { title, author, comments, copyright } = song.songMetadata;
  return { ...EMPTY_SONG_INFO, title, words: author, music: author, copyright, notice: comments === '' ? [] : comments.split(LINE_BREAK) };
}
