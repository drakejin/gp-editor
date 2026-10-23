/**
 * Format-independent song model. Every reader (gp1 … gp8) produces this shape.
 *
 * The layout follows Guitar Pro itself (and TuxGuitar's TGSong): measure headers
 * ("master bars") are shared by all tracks, and each track has exactly one
 * measure per header. Positions are in ticks, QUARTER_TIME ticks per quarter note.
 *
 * Strings are numbered from 1 = highest-pitched string, as in Guitar Pro.
 */

/** Ticks per quarter note: 960 × 135135, so every duration Guitar Pro writes is a whole number of ticks (see defaults.ts). */
export const QUARTER_TIME = 129_729_600;

export type FileFormat = 'gp1' | 'gp2' | 'gp3' | 'gp4' | 'gp5' | 'gpx' | 'gp7' | 'ptb' | 'tef' | 'midi';

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
  readonly channelId: number;
  readonly strings: readonly GuitarString[];
  readonly color: Rgb;
  /** Capo fret. */
  readonly offset: number;
  readonly isPercussion: boolean;
  readonly solo: boolean;
  readonly mute: boolean;
  readonly lyrics?: Lyrics;
  /** One measure per song measure header, in order. */
  readonly measures: readonly Measure[];
}

export type Clef = 'treble' | 'bass' | 'tenor' | 'alto' | 'neutral';

export interface Measure {
  /** Index into Song.measureHeaders. */
  readonly headerIndex: number;
  readonly clef: Clef;
  /** -7 (7 flats) … 7 (7 sharps). */
  readonly keySignature: number;
  readonly beats: readonly Beat[];
}

export interface Chord {
  readonly name: string;
  readonly firstFret: number;
  /** Fret per string (index 0 = string 1); -1 = not played. */
  readonly frets: readonly number[];
}

export type StrokeDirection = 'none' | 'up' | 'down';

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
}

export interface Note {
  /** Fret number (for percussion tracks: the MIDI percussion pitch). */
  readonly fret: number;
  /** MIDI velocity 0–127. */
  readonly velocity: number;
  /** 1 = highest string. */
  readonly string: number;
  readonly isTied: boolean;
  readonly effect: NoteEffect;
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
  readonly letRing: boolean;
}
