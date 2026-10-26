/**
 * Format-independent song model. Every reader (gp1 … gp8) produces this shape.
 *
 * The layout follows Guitar Pro itself (and TuxGuitar's TGSong): measure headers
 * ("master bars") are shared by all tracks, and each track has exactly one
 * measure per header. Positions are in ticks, QUARTER_TIME ticks per quarter note.
 *
 * Strings are numbered from 1 = highest-pitched string, as in Guitar Pro.
 */

import type { Stylesheet } from './stylesheet';

/** Ticks per quarter note: 960 × 135135, so every duration Guitar Pro writes is a whole number of ticks (see defaults.ts). */
export const QUARTER_TIME = 129_729_600;

export type FileFormat = 'gp1' | 'gp2' | 'gp3' | 'gp4' | 'gp5' | 'gpx' | 'gp7' | 'ptb' | 'tef' | 'midi' | 'musicxml';

export interface SourceInfo {
  readonly format: FileFormat;
  /** Version string found in the file, e.g. "FICHIER GUITAR PRO v5.10" or "7.6.0". */
  readonly version: string;
}

export interface Song {
  readonly source: SourceInfo;
  readonly info: SongInfo;
  readonly channels: readonly Channel[];
  readonly measureHeaders: readonly MeasureHeader[];
  readonly tracks: readonly Track[];
  /** The app's master effects on the whole mix; absent: the default (only the limiter, at 0 dB). */
  readonly master?: MasterMix;
  /** A recording played with the score (Guitar Pro 7/8's audio track); its audio data lives outside the model. */
  readonly audioTrack?: AudioTrack;
  /** The app's stylesheet (File ▸ Stylesheet…, model/stylesheet.ts); absent: DEFAULT_STYLESHEET. */
  readonly stylesheet?: Stylesheet;
}

/**
 * Where the audio track meets the score: a played bar (repeats and jumps unfolded: `occurrence` 0 is the bar's first
 * time), a place in it, and the moment of the audio heard there. Between two points the audio follows the score's
 * ticks linearly (audio-track/sync-map.ts).
 */
export interface AudioSyncPoint {
  readonly measureIndex: number;
  readonly occurrence: number;
  /** 0 = the bar's start … 1 = its end. */
  readonly position: number;
  /** Seconds from the start of the audio. */
  readonly seconds: number;
}

/** Guitar Pro 7/8's audio track (backing track): one audio file played in sync with the score. */
export interface AudioTrack {
  /**
   * Which audio data the track plays: Guitar Pro's asset name (the file's SHA-1 as a UUID), or the app's. The bytes are
   * not in the model: `readSongFile` returns them and `writeSong` takes them.
   */
  readonly assetId: string;
  /** The audio file's extension, lower case without the dot ("ogg", "mp3", "wav" …); empty when unknown. */
  readonly fileExtension: string;
  /** The file the audio was taken from (Guitar Pro keeps its path). */
  readonly originalFilePath: string;
  readonly name: string;
  /** Fader 0–1 (Guitar Pro's channel strip; 0.8 = its default). */
  readonly volume: number;
  readonly mute: boolean;
  readonly solo: boolean;
  /** Pitch shift in cents, −2400…2400 (Guitar Pro: semitones and cents). */
  readonly detuneCents: number;
  /** Where in the audio (seconds) the score starts while no sync point says otherwise (Guitar Pro's frame padding). */
  readonly startSeconds: number;
  /** In playback order: each point later in the score and in the audio than the one before. */
  readonly syncPoints: readonly AudioSyncPoint[];
}

/**
 * A playback effect of the app (basic effects built into macOS and our own, not Guitar Pro's RSE): a track's sound
 * goes through its effects in order, the mix through the master's. Parameter ids and ranges: `effects/effect-params.ts`.
 */
export type EffectType = 'eq' | 'compressor' | 'drive' | 'chorus' | 'delay' | 'reverb' | 'cabinet' | 'limiter';

export interface Effect {
  readonly type: EffectType;
  readonly isEnabled: boolean;
  /** Every parameter of the type by id, each inside its range. */
  readonly params: Readonly<Record<string, number>>;
}

export interface MasterMix {
  /** EQ, compressor, reverb and limiter, in that order (MASTER_EFFECT_TYPES), each on or off. */
  readonly effects: readonly Effect[];
  /** Output gain in dB (−24…+12); 0 = the level playback always had. */
  readonly gainDb: number;
}

export interface SongInfo {
  readonly title: string;
  readonly subtitle: string;
  readonly artist: string;
  readonly album: string;
  /** Lyricist ("words by"). */
  readonly words: string;
  /** Composer ("music by"). */
  readonly music: string;
  readonly copyright: string;
  /** Tab author / transcriber. */
  readonly transcriber: string;
  readonly instructions: string;
  readonly notice: readonly string[];
}

export interface Channel {
  readonly id: number;
  readonly name: string;
  /** MIDI program 0–127. */
  readonly program: number;
  /** MIDI bank; 128 marks the percussion bank. */
  readonly bank: number;
  /** 0–127 */
  readonly volume: number;
  /** Pan, 0–127 (64 = centre). */
  readonly balance: number;
  readonly chorus: number;
  readonly reverb: number;
  readonly phaser: number;
  readonly tremolo: number;
  readonly isPercussion: boolean;
}

export interface Rgb {
  readonly r: number;
  readonly g: number;
  readonly b: number;
}

export type TripletFeel = 'none' | 'eighth' | 'sixteenth';

export interface TimeSignature {
  readonly numerator: number;
  /** Denominator as a note value: 1, 2, 4, 8, 16, 32, 64. */
  readonly denominator: number;
}

export interface Marker {
  readonly title: string;
  readonly color: Rgb;
}

/** Where a jump goes: Guitar Pro's segno, segno segno, coda, double coda and fine (GPIF `<Target>`). */
export type DirectionTarget = 'segno' | 'segnoSegno' | 'coda' | 'doubleCoda' | 'fine';

/** D.C. / D.S. / D.S.S. (al Coda, al Double Coda, al Fine) and Da Coda / Da Double Coda (GPIF `<Jump>`). */
export type DirectionJump =
  | 'daCapo'
  | 'daCapoAlCoda'
  | 'daCapoAlDoubleCoda'
  | 'daCapoAlFine'
  | 'daSegno'
  | 'daSegnoAlCoda'
  | 'daSegnoAlDoubleCoda'
  | 'daSegnoAlFine'
  | 'daSegnoSegno'
  | 'daSegnoSegnoAlCoda'
  | 'daSegnoSegnoAlDoubleCoda'
  | 'daSegnoSegnoAlFine'
  | 'daCoda'
  | 'daDoubleCoda';

/** A musical direction of a measure: a target or a jump. */
export type MusicalDirection = DirectionTarget | DirectionJump;

export interface MeasureHeader {
  /** 1-based measure number. */
  readonly number: number;
  /** Start position in ticks. */
  readonly start: number;
  readonly timeSignature: TimeSignature;
  /** Quarter notes per minute, up to two decimals (roundTempo); GP3–GP5 files hold whole numbers. */
  readonly tempo: number;
  readonly marker?: Marker;
  readonly repeatOpen: boolean;
  /** Number of repetitions when a repeat closes here; 0 means no repeat close. */
  readonly repeatClose: number;
  /** Bitmask of alternate endings (bit 0 = ending 1). 0 means none. */
  readonly repeatAlternative: number;
  readonly tripletFeel: TripletFeel;
  /** Targets and jumps on the bar, each once, in MUSICAL_DIRECTIONS order; absent when none. */
  readonly directions?: readonly MusicalDirection[];
  /** How the bar's notes are beamed together, set by hand; the time signature's grouping when absent (model/beaming.ts). */
  readonly beamGrouping?: BeamGrouping;
  /** The bar's layout set in Design Mode (the app's own, edit/bar-design.ts); absent while untouched. */
  readonly design?: BarDesign;
}

/** A beat moved sideways in Design Mode: the beats starting `at` ticks after the bar's start, drawn `offset` points away. */
export interface BeatOffset {
  readonly at: number;
  readonly offset: number;
}

/** Design Mode's layout of a bar (no TuxGuitar counterpart; Guitar Pro keeps its own in data nobody documents). */
export interface BarDesign {
  /** A system starts at this bar and holds this many bars (0: as many as fit). */
  readonly systemBars?: number;
  /** The bar's share of its system's width, against its natural width (1: as laid out). */
  readonly widthScale?: number;
  /** Beats moved sideways, in the order of `at`. */
  readonly beatOffsets?: readonly BeatOffset[];
}

/** A bar's beam groups (GP5's "beam eighth notes by", GPIF's master bar beaming). */
export interface BeamGrouping {
  /** The note value the groups count: 8 = eighth notes (Guitar Pro 5 always counts eighths). */
  readonly unit: NoteValue;
  /** Notes of `unit` per beam group, in order, each at least 1. */
  readonly groups: readonly number[];
}

export interface GuitarString {
  /** 1 = highest string. */
  readonly number: number;
  /** Open-string MIDI pitch. */
  readonly tuning: number;
}

export interface Lyrics {
  /** Measure number where the lyrics start (1-based). */
  readonly from: number;
  readonly text: string;
}

export interface Track {
  /** 1-based track number. */
  readonly number: number;
  readonly name: string;
  /**
   * Guitar Pro's abbreviated name ("s.guit.", GPIF `<ShortName>`, MusicXML `<part-abbreviation>`), shown where the
   * stylesheet asks for short names; absent = the name abbreviated (`trackShortName`).
   */
  readonly shortName?: string;
  readonly channelId: number;
  readonly strings: readonly GuitarString[];
  /** The track's colour (Guitar Pro's tracks panel and LCD; GP3–GP5 and GPIF keep it). */
  readonly color: Rgb;
  /**
   * Guitar Pro's track icon (GPIF `<IconId>`, `TRACK_ICON_IDS`), chosen apart from the instrument; absent = the
   * instrument's icon (`trackIconId`).
   */
  readonly iconId?: number;
  /** Capo fret. */
  readonly offset: number;
  readonly isPercussion: boolean;
  readonly solo: boolean;
  readonly mute: boolean;
  readonly lyrics?: Lyrics;
  /** The whole track is written in rhythm slashes (Guitar Pro 6–8's slash notation, the PartConfiguration's flag). */
  readonly hasSlashNotation?: boolean;
  /** The app's effects on the track's sound, in playback order (at most MAX_TRACK_EFFECTS); absent when it has none. */
  readonly effects?: readonly Effect[];
  /** One measure per song measure header, in order. */
  readonly measures: readonly Measure[];
}

export type Clef = 'treble' | 'bass' | 'tenor' | 'alto' | 'neutral';

/**
 * An octave sign over (8va, 15ma) or under (8vb, 15mb) the notation staff: the notes sound one or two octaves above or
 * below where they are written (GPIF's beat `<Ottavia>`). Only the notation changes: a note's pitch stays its fret's.
 */
export type Ottava = '8va' | '8vb' | '15ma' | '15mb';

/** The sustain pedal pressed (Ped.) or released (✱). */
export type PedalAction = 'down' | 'up';

/** A sustain pedal change of a track (GPIF's SustainPedal automation), at a place in the measure. */
export interface PedalMark {
  /** Ticks from the measure's start (0 … the measure's length). */
  readonly offset: number;
  readonly action: PedalAction;
}

export interface Measure {
  /** Index into Song.measureHeaders. */
  readonly headerIndex: number;
  readonly clef: Clef;
  /** -7 (7 flats) … 7 (7 sharps). */
  readonly keySignature: number;
  readonly beats: readonly Beat[];
  /** Sustain pedal changes, by offset (a release before a press at the same offset); absent when none. */
  readonly pedals?: readonly PedalMark[];
}

export interface Chord {
  readonly name: string;
  readonly firstFret: number;
  /** Fret per string (index 0 = string 1); -1 = not played. */
  readonly frets: readonly number[];
}

export type StrokeDirection = 'none' | 'up' | 'down';

/** A crescendo (<) or decrescendo (>) wedge; every beat it spans carries it (GPIF `<Hairpin>`). */
export type Hairpin = 'crescendo' | 'decrescendo';

/**
 * A rasgueado's fingers and rhythm, Guitar Pro's 18 patterns (GPIF `ii_1` … `peami_1`): p thumb, i index, m middle,
 * a ring, e little finger; a triplet plays its strokes evenly, an anapaest short-short-long.
 */
export type RasgueadoPattern =
  | 'ii'
  | 'mi'
  | 'miiTriplet'
  | 'miiAnapaest'
  | 'pmpTriplet'
  | 'pmpAnapaest'
  | 'peiTriplet'
  | 'peiAnapaest'
  | 'paiTriplet'
  | 'paiAnapaest'
  | 'amiTriplet'
  | 'amiAnapaest'
  | 'ppp'
  | 'amii'
  | 'amip'
  | 'eami'
  | 'eamii'
  | 'peami';

export interface Stroke {
  readonly direction: StrokeDirection;
  /** Stroke speed as a note value (4, 8, 16, 32, 64, 128); 0 when no stroke. */
  readonly value: number;
}

export interface Beat {
  /** Start position in ticks. */
  readonly start: number;
  /** Guitar Pro has up to two voices per beat (GP6+: up to four). */
  readonly voices: readonly Voice[];
  readonly stroke: Stroke;
  readonly pickStroke: StrokeDirection;
  readonly chord?: Chord;
  readonly text?: string;
  /** The crescendo or decrescendo the beat is under; absent when none. */
  readonly hairpin?: Hairpin;
  /** The beat is strummed as a rasgueado of this pattern; absent when not. */
  readonly rasgueado?: RasgueadoPattern;
  /** The octave sign the beat is written under; absent when none. */
  readonly ottava?: Ottava;
}

export interface Tuplet {
  /** Notes played … */
  readonly enters: number;
  /** … in the time of. Normal = 1:1, triplet = 3:2. */
  readonly times: number;
}

export type NoteValue = 1 | 2 | 4 | 8 | 16 | 32 | 64;

export interface Duration {
  readonly value: NoteValue;
  readonly dotted: boolean;
  readonly doubleDotted: boolean;
  /** The tuplet the note is in (NORMAL_TUPLET for none); with an inner tuplet, the outer one. */
  readonly tuplet: Tuplet;
  /** A tuplet inside `tuplet` (GP7/GP8's secondary tuplet); set only when both are real tuplets. */
  readonly innerTuplet?: Tuplet;
}

export type VoiceDirection = 'none' | 'up' | 'down';

export interface Voice {
  readonly duration: Duration;
  readonly notes: readonly Note[];
  /** No beat in this voice (as opposed to a rest, which is isEmpty=false with no notes). */
  readonly isEmpty: boolean;
  readonly direction: VoiceDirection;
  /** The beat is written as a rhythm slash on the middle line (GPIF's `<Slashed/>`). */
  readonly isSlashed?: boolean;
  /** How the beam goes on to the voice's next beat, set by hand; by the bar's beam grouping when absent. */
  readonly beamToNext?: BeamLink;
}

/** A beam to the next beat: broken, joined across a group boundary, or with only the eighth (primary) beam. */
export type BeamLink = 'break' | 'join' | 'breakSecondary';

export interface Note {
  /** Fret number (for percussion tracks: the MIDI percussion pitch). */
  readonly fret: number;
  /** MIDI velocity 0–127. */
  readonly velocity: number;
  /** 1 = highest string. */
  readonly string: number;
  readonly isTied: boolean;
  readonly effect: NoteEffect;
  /** Left-hand (fretting) finger: T 1 2 3 4; on a keyboard track the piano fingering 1–5. */
  readonly leftFinger?: Finger;
  /** Right-hand (picking) finger: p i m a c. */
  readonly rightFinger?: Finger;
  /** An accidental shown although the key and the bar do not call for one; no Guitar Pro file holds it. */
  readonly accidentalDisplay?: AccidentalDisplay;
  /** How the note plays back apart from what is written; absent when it plays as written (DEFAULT_NOTE_AUDIO). */
  readonly audio?: NoteAudio;
}

/**
 * Guitar Pro 8's note "Audio" settings: they change playback only, never the notation. GP5 files keep the duration
 * percent (note flag 0x01); GPIF and GP3/GP4 have no place for them, so they live in the model only.
 */
export interface NoteAudio {
  /** Percentage of its length the note sounds, 1–200 (100 = as written). */
  readonly durationPercent: number;
  /** How much later than its beat the note starts, as a percentage of the beat's length, 0–99. */
  readonly offsetPercent: number;
  /** Added to the note's velocity when it plays, −127…127; the result is kept within 1–127. */
  readonly velocityOffset: number;
}

/** A finger as Guitar Pro stores fingering (GPIF P I M A C, GP3–GP5 0–4), thumb first. */
export type Finger = 'thumb' | 'index' | 'middle' | 'annular' | 'little';

/** A reminder accidental in parentheses (cautionary), or the accidental always written (forced). */
export type AccidentalDisplay = 'cautionary' | 'forced';

export interface BendPoint {
  /** 0 … 12 across the note's duration. */
  readonly position: number;
  /** In quarter tones (1 = quarter tone, 4 = whole tone). */
  readonly value: number;
}

export interface Bend {
  readonly points: readonly BendPoint[];
}

export type HarmonicType = 'natural' | 'artificial' | 'tapped' | 'pinch' | 'semi';

export interface Harmonic {
  readonly type: HarmonicType;
  /** Artificial: semitone offset; tapped: fret; others: 0. */
  readonly data: number;
}

export type GraceTransition = 'none' | 'slide' | 'bend' | 'hammer';

export interface Grace {
  readonly fret: number;
  /** 1 = 64th, 2 = 32nd, 3 = 16th (TuxGuitar convention). */
  readonly duration: number;
  readonly velocity: number;
  readonly transition: GraceTransition;
  readonly onBeat: boolean;
  readonly isDead: boolean;
}

export interface Trill {
  readonly fret: number;
  readonly duration: Duration;
}

export interface TremoloPicking {
  readonly duration: Duration;
}

export type SlideType =
  | 'shift'
  | 'legato'
  | 'outDownwards'
  | 'outUpwards'
  | 'intoFromBelow'
  | 'intoFromAbove';

/** A note's vibrato as one value: none, slight (`NoteEffect.vibrato`) or wide (`NoteEffect.wideVibrato`). */
export type VibratoKind = 'none' | 'slight' | 'wide';

export interface NoteEffect {
  readonly bend?: Bend;
  /** Whammy bar; points use the same 0…12 positions, values in quarter tones (may be negative). */
  readonly tremoloBar?: Bend;
  readonly harmonic?: Harmonic;
  readonly grace?: Grace;
  readonly trill?: Trill;
  readonly tremoloPicking?: TremoloPicking;
  /** Empty when the note has no slide. */
  readonly slides: readonly SlideType[];
  /** Slight vibrato; never set together with `wideVibrato`. */
  readonly vibrato: boolean;
  /** Wide vibrato (GP3–GP5's beat wide-vibrato bit, GPIF's Wide strength); never set together with `vibrato`. */
  readonly wideVibrato: boolean;
  readonly deadNote: boolean;
  readonly hammer: boolean;
  readonly ghostNote: boolean;
  readonly accentuatedNote: boolean;
  readonly heavyAccentuatedNote: boolean;
  readonly palmMute: boolean;
  readonly staccato: boolean;
  readonly tapping: boolean;
  readonly slapping: boolean;
  readonly popping: boolean;
  readonly fadeIn: boolean;
  /** Fade out (GPIF FadeOut); never set together with `fadeIn` or `volumeSwell`. */
  readonly fadeOut?: boolean;
  /** Volume swell, louder then softer (GPIF VolumeSwell); never set together with `fadeIn` or `fadeOut`. */
  readonly volumeSwell?: boolean;
  readonly letRing: boolean;
}
