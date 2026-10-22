export * from './model/song';
// plainDuration is reader-internal and stays out of the public API.
export {
  DEFAULT_CHANNEL,
  DEFAULT_PERCUSSION_BANK,
  DEFAULT_PERCUSSION_CHANNEL,
  EMPTY_NOTE_EFFECT,
  EMPTY_SONG_INFO,
  NORMAL_TUPLET,
  NO_STROKE,
  QUARTER,
  RED,
  NOTE_VALUES,
  STANDARD_TUNING,
  durationFromTicks,
  durationTicks,
  isMeasureOverfull,
  isNoteValue,
  measureTicks,
  toNoteValue,
} from './model/defaults';
export { readSong } from './read-song';
export { type WritableFormat, writeSong } from './write';
export { detectFormat, type DetectedFormat } from './formats/detect';
export type { ReadOptions } from './formats/options';
export type { Charset } from './io/text';
export { GpFormatError, UnexpectedEndOfFileError, UnsupportedFormatError } from './errors';
export { MAX_FRET, type StringAddress, deleteNote, findNote, setNoteFret, setNoteString } from './edit/edit-song';
export { type BeatAddress, deleteBeat, insertBeat, setBeatDuration } from './edit/beats';
export {
  BEND_PRESETS,
  type ToggleableEffect,
  setNoteBend,
  setNoteHarmonic,
  setNoteSlides,
  setNoteTied,
  toggleNoteEffect,
} from './edit/effects';
export { deleteMeasure, insertMeasure } from './edit/measures';
export { NEW_SONG_MEASURES, buildNewSong } from './edit/new-song';
export { type RepeatChange, setKeySignature, setRepeat, setTempo, setTimeSignature } from './edit/measure-headers';
export { type MidiOptions, type MidiRender, type ScorePosition, type TimelineEntry, positionAt, renderMidi } from './midi/index';
