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
  STANDARD_BASS_TUNING,
  STANDARD_TUNING,
  TUPLET_SIZES,
  durationFromTicks,
  durationTicks,
  isMeasureOverfull,
  isNoteValue,
  isSameTuplet,
  measureTicks,
  toNoteValue,
  tupletOf,
  vibratoOf,
} from './model/defaults';
export { DYNAMICS, type DynamicName, dynamicOf } from './formats/common/velocity';
export { readSong } from './read-song';
export { type WritableFormat, writeSong } from './write';
export { type AsciiTabOptions, DEFAULT_ASCII_LINE_WIDTH, writeAsciiTab } from './write/ascii/ascii-tab-writer';
export { writeMusicXml } from './write/musicxml/musicxml-writer';
export { encodeMusicXml, writeMusicXmlArchive } from './write/musicxml/musicxml-archive';
export { detectFormat, type DetectedFormat } from './formats/detect';
export type { ReadOptions } from './formats/options';
export type { Charset } from './io/text';
export { CompositionError, GpFormatError, TranscriptionError, UnexpectedEndOfFileError, UnsupportedFormatError } from './errors';
export { MAX_FRET, NECK_FRETS, type StringAddress, deleteNote, findNote, setNoteFret, setNoteString, setNoteVelocity } from './edit/edit-song';
export {
  type Instrument,
  type NeckInstrument,
  TUNING_PRESETS,
  type TuningPreset,
  findTuningPreset,
  resolveInstrument,
  resolveTrackInstrument,
  trackTuning,
  tuningPresetsFor,
} from './edit/tuning-presets';
export {
  type PitchRange,
  type PresetFit,
  type TuningAdvice,
  canPlayOnTuning,
  countUnplayableNotes,
  suggestTrackTunings,
  suggestTunings,
  trackPitchRange,
} from './edit/tuning-fit';
export { type TuningChange, setTrackTuning } from './edit/retune';
export { type BeatAddress, deleteBeat, deleteBeatNotes, insertBeat, setBeatDuration } from './edit/beats';
export { setBeatPickStroke, setBeatStroke, setBeatText } from './edit/beat-attributes';
export type { BeatFragment, BeatFragmentItem } from './edit/beat-fragment';
export { copyBeats, deleteBeatsFlowing, insertBeatsFlowing } from './edit/beat-ranges';
export { MAX_FRAGMENT_ITEMS, parseBeatFragment, serializeBeatFragment } from './edit/fragment-json';
export {
  BEND_PRESETS,
  type BendPresetName,
  TREMOLO_BAR_PRESETS,
  type ToggleableEffect,
  type TremoloBarPresetName,
  buildHarmonic,
  setNoteBend,
  setNoteHarmonic,
  setNoteSlides,
  setNoteTied,
  setNoteTremoloBar,
  setNoteVibrato,
  toggleNoteEffect,
} from './edit/effects';
export {
  BEND_SHAPES,
  type BendShape,
  MAX_BEND_AMOUNT,
  MIN_BEND_AMOUNT,
  type ShapedBend,
  bendShapeOf,
  buildBend,
} from './edit/bend-shapes';
export { setNoteGrace, setNoteTremoloPicking, setNoteTrill } from './edit/ornaments';
export { deleteMeasure, insertMeasure } from './edit/measures';
export { NEW_SONG_MEASURES, buildNewSong } from './edit/new-song';
export { setTrackBalance, setTrackMute, setTrackProgram, setTrackSolo, setTrackVolume } from './edit/track-sound';
export { MAX_CAPO, setTrackCapo, setTrackName } from './edit/track-properties';
export { setSongInfo } from './edit/song-info';
export { GM_INSTRUMENT_FAMILIES, GM_INSTRUMENT_NAMES, gmFamilyIndex } from './formats/common/channels';
export {
  type RepeatChange,
  setKeySignature,
  setMeasureMarker,
  setRepeat,
  setTempo,
  setTimeSignature,
  setTripletFeel,
} from './edit/measure-headers';
export {
  type ChannelRoute,
  type MidiOptions,
  type MidiRender,
  type ScorePosition,
  type TimelineEntry,
  UNROUTED,
  buildChannelRoutes,
  positionAt,
  renderMidi,
  timelineIndexAt,
} from './midi/index';
export type {
  TranscribedBeat,
  TranscribedDuration,
  TranscribedEffect,
  TranscribedInstrument,
  TranscribedMeasure,
  TranscribedNote,
  TranscribedPart,
  TranscribedSongInfo,
  TranscribedTrack,
  TranscriptionPage,
} from './transcription/types';
export { TRANSCRIPTION_TOOL } from './transcription/tool';
export { parseTranscriptionPage } from './transcription/parse-page';
export { type TranscribedSong, type TranscriptionOptions, buildSongFromTranscription } from './transcription/build-song';
export {
  DEFAULT_PLAN_TEMPO,
  MAX_PLAN_BARS,
  MAX_PLAN_SECTIONS,
  MAX_PLAN_TEMPO,
  MAX_PLAN_TRACKS,
  MAX_SECTION_BARS,
  MIN_PLAN_TEMPO,
  type PlannedSection,
  type SongPlan,
} from './composition/types';
export { PLAN_SONG_TOOL, WRITE_SECTION_TOOL } from './composition/tool';
export { parseSongPlan } from './composition/parse-plan';
export { SONG_WRITER_CREDIT, type SongDetails, buildComposedSong } from './composition/build';
