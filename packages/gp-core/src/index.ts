export * from './model/song';
// plainDuration is reader-internal and stays out of the public API.
export {
  DEFAULT_CHANNEL,
  DEFAULT_PERCUSSION_BANK,
  DEFAULT_PERCUSSION_CHANNEL,
  EMPTY_NOTE_EFFECT,
  EMPTY_SONG_INFO,
  EMPTY_VOICE,
  MAX_VOICES,
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
  isPedalDownBefore,
  isSameTuplet,
  measureTicks,
  roundTempo,
  toNoteValue,
  tupletOf,
  vibratoOf,
} from './model/defaults';
export { DYNAMICS, type DynamicName, dynamicOf } from './formats/common/velocity';
export { type SongFile, readSong, readSongFile } from './read-song';
export { type WritableFormat, type WriteOptions, writeSong } from './write';
export { type AsciiTabOptions, DEFAULT_ASCII_LINE_WIDTH, writeAsciiTab } from './write/ascii/ascii-tab-writer';
export { writeMusicXml } from './write/musicxml/musicxml-writer';
export { encodeMusicXml, writeMusicXmlArchive } from './write/musicxml/musicxml-archive';
export { detectFormat, type DetectedFormat } from './formats/detect';
export type { ReadOptions } from './formats/options';
export type { Charset } from './io/text';
export { CompositionError, GpFormatError, TranscriptionError, UnexpectedEndOfFileError, UnsupportedFormatError } from './errors';
export { MAX_DRUM_KEY, MAX_FRET, NECK_FRETS, type StringAddress, deleteNote, findNote, setNoteFret, setNoteString, setNoteVelocity } from './edit/edit-song';
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
export { type Transposition, type TranspositionMode, type TranspositionOptions, type TranspositionScope, transpose } from './edit/transpose';
export {
  DEFAULT_GATE_DB,
  DEFAULT_MAX_FREQUENCY,
  DEFAULT_MIN_FREQUENCY,
  MAX_FRAME_LENGTH,
  MIN_FRAME_LENGTH,
  type PitchDetection,
  type PitchDetectorOptions,
  SILENCE_DB,
  detectPitch,
} from './tuner/pitch-detector';
export {
  DEFAULT_REFERENCE_A4,
  MAX_REFERENCE_A4,
  MIN_REFERENCE_A4,
  type NotePitch,
  type StringPitch,
  type TunerReading,
  clampReferenceA4,
  frequencyFromNote,
  nearestNote,
  nearestString,
  pitchFromFrequency,
  toTunerReading,
} from './tuner/notes';
export { type QueuedFrequency, TUNER_QUEUE_SIZE, pushFrequency, stableFrequency } from './tuner/tuner-queue';
export { TunerError } from './errors';
export { type BeatAddress, deleteBeat, deleteBeatNotes, insertBeat, setBeatDuration } from './edit/beats';
export { deleteRunNotes } from './edit/run-notes';
export { findVoice, isVoiceIndex, voiceOf } from './edit/addresses';
export { moveBeatsToVoice, moveNotesToVoice } from './edit/voice-moves';
export { setBeatPickStroke, setBeatStroke, setBeatText } from './edit/beat-attributes';
export { setBeatRasgueado, toggleBeatPedal, toggleDirection, toggleHairpin } from './edit/marks';
export { setMeasureClef, setOttava } from './edit/staff-signs';
export { OTTAVAS, isOttava, ottavaOctaves } from './model/defaults';
export { type KeyMode, type KeyTonic, keySignatureOf, keyTonic } from './edit/key-spelling';
export { DIRECTION_JUMPS, DIRECTION_TARGETS, MUSICAL_DIRECTIONS, isDirectionTarget } from './formats/common/directions';
export { RASGUEADO_PATTERNS, type RasgueadoInfo, rasgueadoInfo } from './formats/common/rasgueado';
export { setBeatChord, setBeatChordNotes } from './edit/beat-chord';
export { CHORD_TYPES, type ChordType, type ChordTypeName } from './chords/database';
export {
  CHORD_EXTENSIONS,
  type ChordExtension,
  type ChordSpec,
  type ChordSpecOptions,
  DEGREE_SHIFTS,
  type DegreeShift,
  buildChordSpec,
  chordSpecPitchClasses,
} from './chords/spec';
export { type NoteSpelling, chordName, noteName } from './chords/naming';
export { parseChordName } from './chords/parse';
export { MAX_FRET_SPAN, type VoicingOptions, buildChordVoicings } from './chords/creator';
export type { VoicingStyle } from './chords/grades';
export { type ChordProposal, type RecognizeOptions, recognizeChord } from './chords/recognizer';
export { DIAGRAM_FRETS, chordFirstFret, chordLabel, hasChordDiagram, isSameChord } from './chords/shape';
export { songChords } from './chords/song-chords';
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
export {
  CURVE_VALUE_RANGES,
  type CurveEffect,
  type CurveValueRange,
  addCurvePoint,
  curveFromPoints,
  moveCurvePoint,
  normalizeCurvePoints,
  removeCurvePoint,
} from './edit/curve-points';
export { canGpifHoldCurve, toGpifCurve } from './write/gpif/gpif-curves';
export { setNoteGrace, setNoteTremoloPicking, setNoteTrill } from './edit/ornaments';
export { setNoteAudio } from './edit/note-audio';
export { DEFAULT_NOTE_AUDIO, NOTE_AUDIO_LIMITS, toNoteAudio } from './model/defaults';
export { deleteMeasure, deleteMeasures, fillEmptyMeasure, insertMeasure } from './edit/measures';
export { NEW_SONG_MEASURES, buildNewSong } from './edit/new-song';
export { setTrackBalance, setTrackMute, setTrackProgram, setTrackSolo, setTrackVolume } from './edit/track-sound';
export {
  MAX_CAPO,
  abbreviateTrackName,
  instrumentIconId,
  setTrackCapo,
  setTrackColor,
  setTrackIcon,
  setTrackName,
  setTrackShortName,
  trackIconId,
  trackShortName,
} from './edit/track-properties';
export { MAX_TRACK_ICON_ID, TRACK_COLORS, TRACK_ICON_IDS, type TrackIconName, isTrackIconId, trackIconName } from './formats/common/track-icons';
export { MAX_NEW_TRACK_STRINGS, type NewTrack, addTrack, deleteTrack, duplicateTrack, hasTrackNotes, moveTrack } from './edit/tracks';
export { TRACK_KINDS, type TrackKind, type TrackKindSpec, type TrackTuningChoice, trackKindSpec, trackTuningChoices } from './edit/track-kinds';
export { type TrackIndexMap, isIdentityTrackMap, matchTrackIndexes, remapTrackIndex, remapTrackIndexes } from './edit/track-index-map';
export { setMasterMix, setTrackEffects } from './edit/track-effects';
export {
  CABINET_MODELS,
  DRIVE_MODES,
  EFFECT_NAMES,
  EFFECT_PARAMS,
  type EffectParamSpec,
  type EffectParamUnit,
  MASTER_EFFECT_TYPES,
  MAX_TRACK_EFFECTS,
  REVERB_ROOMS,
  TRACK_EFFECT_TYPES,
  buildEffect,
  clampEffectParam,
  effectParamSpec,
} from './effects/effect-params';
export { CHAIN_PRESETS, type ChainPreset, EFFECT_PRESETS, type EffectPreset } from './effects/effect-presets';
export {
  DEFAULT_MASTER,
  MASTER_GAIN,
  applyChainPreset,
  applyEffectPreset,
  deleteEffect,
  insertEffect,
  isDefaultMaster,
  isSameChain,
  isSameEffect,
  isSameMaster,
  matchingEffectPreset,
  moveEffect,
  setEffectParam,
  setMasterGain,
  toggleEffect,
} from './effects/effect-chain';
export { parseEffectChain, parseMasterMix } from './effects/effects-json';
export { readSongEffects, songEffectsToJson } from './effects/song-effects';
export * from './model/stylesheet';
export { isDefaultStylesheet, millimetresToPoints, pageSize, setStylesheet, stylesheetOf } from './edit/stylesheet';
export { clearBarDesign, hasBarDesign, setBarWidthScale, setBeatOffset, setSystemBars } from './edit/bar-design';
export { BAR_DESIGN_LIMITS, isSameJson, parseBarDesign, parseStylesheet } from './stylesheet/stylesheet-json';
export { readSongDesign, readSongStylesheet, songDesignToJson, songStylesheetToJson } from './stylesheet/song-stylesheet';
export {
  AUDIO_TRACK_NAME,
  type AudioTrackFields,
  DEFAULT_AUDIO_VOLUME,
  MAX_DETUNE_CENTS,
  buildAudioTrack,
  fileExtensionOf,
  normalizeFileExtension,
} from './audio-track/audio-track';
export {
  type PlayedBar,
  type PlayedPosition,
  type SyncAnchor,
  type SyncMap,
  audioSecondsAt,
  buildSyncMap,
  playedBarIndex,
  playedPositionAt,
  scoreSecondsAt,
  syncPointTick,
  tickAtAudioSeconds,
} from './audio-track/sync-map';
export {
  type AudioTrackMix,
  type SecondsRange,
  canSetAudioSyncPoint,
  deleteAudioSyncPoint,
  moveAudioSyncPoint,
  setAudioSyncPoint,
  setAudioTrack,
  setAudioTrackMix,
  syncPointSecondsRange,
} from './edit/audio-track';
export { setSongInfo } from './edit/song-info';
export { GM_BANJO_PROGRAM, GM_DRUM_KEYS, GM_INSTRUMENT_FAMILIES, GM_INSTRUMENT_NAMES, gmFamilyIndex, gmPercussionName } from './formats/common/channels';
export { BANJO_DRONE_FRET, fretFromTab, isFiveStringBanjo, stringStartFret, tabFret } from './edit/banjo';
export { toggleDrumNote } from './edit/drum-notes';
export {
  DRUM_KIT_NOTATIONS,
  type DrumNotation,
  type DrumNotehead,
  type DrumNoteheads,
  type DrumTechnique,
  type DrumTechniquePlacement,
  type DrumTechniqueSymbol,
  drumNotation,
} from './formats/common/drum-notation';
export { type PitchEntry, type PlayedNote, enterPlayedNotes, handFretBefore } from './edit/pitch-entry';
export {
  MAX_TEMPO,
  MIN_TEMPO,
  type RepeatChange,
  setKeySignature,
  setMeasureMarker,
  setRepeat,
  setTempo,
  setTimeSignature,
  setTripletFeel,
} from './edit/measure-headers';
export { CLICK_KEYS, type ClickOptions, type MeterBeats, meterBeats } from './midi/index';
export {
  ACCIDENTAL_DISPLAYS,
  BEAM_LINKS,
  type Hand,
  setBeamGrouping,
  setNoteAccidentalDisplay,
  setNoteFinger,
  setTrackSlashNotation,
  setVoiceBeamToNext,
  setVoiceSlashed,
} from './edit/notation-marks';
export {
  BEAM_GROUPING_PRESETS,
  type BeamGroupingPreset,
  beamGroupBounds,
  defaultBeamGrouping,
  effectiveBeamGrouping,
  isSameBeamGrouping,
  presetBeamGrouping,
} from './model/beaming';
export { FINGERS } from './formats/common/fingering';
export {
  type AudioRun,
  type ChannelRoute,
  type MidiOptions,
  type MidiRender,
  type ScorePosition,
  type TimelineEntry,
  type TimelineTempo,
  UNROUTED,
  buildChannelRoutes,
  entrySecondsAt,
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
export { lyricsSyllables, separateCjkSyllables, setTrackLyrics } from './edit/lyrics';
export { ANNOTATION_PLACEMENTS, MAX_ANNOTATION_LENGTH, MAX_ANNOTATION_LINES, isAnnotationPlacement, isSameAnnotation, normalizeAnnotationText, toAnnotation } from './annotations/annotation-text';
export { readSongAnnotations, songAnnotationsToJson } from './annotations/song-annotations';
export { type PlacedAnnotation, hasAnnotations, moveBeatAnnotation, setBeatAnnotation, songAnnotations, withoutAnnotations } from './edit/annotations';
export { SCALES, type ScaleDefinition } from './scales/table';
export {
  type Alteration,
  SCALE_ROOTS,
  type ScaleChoice,
  type ScaleRoot,
  isScalePitch,
  scaleIndexNamed,
  scalePitchClasses,
  scaleTitle,
  searchScales,
} from './scales/notes';
export { preferredScaleChoice, scaleKeySignature, scaleNoteNames } from './scales/spelling';
export { MAX_SCALE_MATCHES, type ScaleMatch, findScales, trackPitches } from './scales/finder';
export {
  MAX_SCALE_STRINGS,
  MIN_SCALE_STRINGS,
  SCALE_BOX_FRETS,
  type ScaleBox,
  type ScalePosition,
  scaleBoxes,
  scaleFretPositions,
} from './scales/positions';
