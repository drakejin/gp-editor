/**
 * What a model returns when it transcribes one page of sheet music (standard notation and/or tablature): the
 * contract between the PDF import's LLM request (TRANSCRIPTION_TOOL, its JSON schema) and buildSongFromTranscription.
 * Values arrive from outside, so parseTranscriptionPage checks every field before anything is built from them.
 */

/**
 * More tracks than any score holds; track indexes and track lists beyond it are refused. The builder makes one track
 * per index up to the highest one seen, so an unchecked index from a model's answer would be an allocation size.
 */
export const MAX_TRANSCRIBED_TRACKS = 16;
/** Longer lists than a page of music holds are refused too, so no answer can make the parser allocate without bound. */
export const MAX_TRANSCRIBED_MEASURES = 256;
/** Two voices for every track. */
export const MAX_TRANSCRIBED_PARTS = MAX_TRANSCRIBED_TRACKS * 2;
export const MAX_TRANSCRIBED_BEATS = 128;
export const MAX_TRANSCRIBED_NOTES = 12;
/** A sung syllable longer than this is cut. */
export const MAX_TRANSCRIBED_SYLLABLE_LENGTH = 32;

/** Ranges of the contract: the tool's JSON schema states them and parseTranscriptionPage clamps to them. */
export const MIN_TRANSCRIBED_TEMPO = 10;
export const MAX_TRANSCRIBED_TEMPO = 400;
export const MAX_TRANSCRIBED_KEY_ACCIDENTALS = 7;
export const MAX_TRANSCRIBED_REPEAT_PLAYS = 16;
export const MAX_TRANSCRIBED_ALTERNATE_ENDING = 8;
export const MAX_TRANSCRIBED_DOTS = 2;
export const MAX_TRANSCRIBED_CAPO = 24;
export const MAX_TRANSCRIBED_NUMERATOR = 32;
export const TRANSCRIBED_DENOMINATORS: readonly number[] = [1, 2, 4, 8, 16, 32];

/**
 * Every kind of staff a page holds: fretted instruments read from tab or notation (guitar, bass, ukulele, banjo), a drum
 * staff, a sung melody, a keyboard and any other pitched instrument (strings, winds, brass, synths … by General MIDI program).
 */
export const TRANSCRIBED_INSTRUMENTS = ['guitar', 'bass', 'ukulele', 'banjo', 'drums', 'vocals', 'keys', 'other'] as const;
export type TranscribedInstrument = (typeof TRANSCRIBED_INSTRUMENTS)[number];

/** The clef of a vocal, keyboard or other staff (a fretted instrument's and a drum staff's follow from the instrument). */
export const TRANSCRIBED_CLEFS = ['treble', 'bass'] as const;
export type TranscribedClef = (typeof TRANSCRIBED_CLEFS)[number];

/** General MIDI programs a track may name. */
export const MAX_TRANSCRIBED_PROGRAM = 127;

export type TranscribedDuration = 'whole' | 'half' | 'quarter' | 'eighth' | '16th' | '32nd' | '64th';

export type TranscribedEffect =
  | 'hammer'
  | 'slide'
  | 'bend'
  | 'vibrato'
  | 'palmMute'
  | 'letRing'
  | 'deadNote'
  | 'ghostNote'
  | 'accent'
  | 'harmonic';

export interface TranscribedSongInfo {
  readonly title?: string;
  readonly artist?: string;
  /** Quarter-note BPM at the start. */
  readonly tempo?: number;
  /** Index of the track the lyrics are sung on (the melody); absent: the first vocal track, else track 0. */
  readonly lyricsTrack?: number;
}

export interface TranscribedTrack {
  readonly name: string;
  readonly instrument: TranscribedInstrument;
  /** A fretted instrument's open-string pitches, lowest string first, in scientific pitch notation ("E2", "A2", … "E4"); [] for standard tuning and for the others. */
  readonly tuning: readonly string[];
  /** Capo fret; 0 for none. */
  readonly capo: number;
  /** General MIDI program 0–127 it plays; absent: chosen from the instrument (and a fretted instrument's name). */
  readonly program?: number;
  /** A vocal, keyboard or other staff's clef; absent: treble. */
  readonly clef?: TranscribedClef;
}

/**
 * One note. From a tab staff: `string` (1 = highest, the top tab line) and `fret`. Without a tab staff: `pitch`, the
 * written pitch on the staff ("C#4", "Bb3"); guitars, basses, the banjo and the contrabass sound an octave lower than
 * written, other instruments as written (writtenTransposition). On a drum staff: `drum`, the drum played.
 */
export interface TranscribedNote {
  readonly string?: number;
  readonly fret?: number;
  readonly pitch?: string;
  /** A drum note: the drum's General MIDI percussion name ("Acoustic Snare", "Closed Hi-Hat"), GM_PERCUSSION_NAMES. */
  readonly drum?: string;
  /** Continues the note of the same pitch before it (a tie). */
  readonly tied?: boolean;
  readonly effects?: readonly TranscribedEffect[];
}

export interface TranscribedBeat {
  readonly duration: TranscribedDuration;
  /** 0, 1 or 2. */
  readonly dots?: number;
  /** Notes in the time of 2 (3 = triplet), 0 or absent for none. */
  readonly tuplet?: number;
  /** A rest when true or when there are no notes. */
  readonly rest?: boolean;
  readonly notes?: readonly TranscribedNote[];
}

export interface TranscribedPart {
  /** Index into the tracks. */
  readonly track: number;
  readonly beats: readonly TranscribedBeat[];
}

export interface TranscribedMeasure {
  /** Set where a time signature is printed or changes. */
  readonly timeSignature?: { readonly numerator: number; readonly denominator: number };
  /** Quarter-note BPM, where a tempo is marked. */
  readonly tempo?: number;
  /** Sharps (> 0) or flats (< 0), where a key signature is printed or changes. */
  readonly keySignature?: number;
  readonly repeatOpen?: boolean;
  /** How many times the repeated section plays in all (2 = play twice); 0 or absent for no repeat close. */
  readonly repeatClose?: number;
  /** The volta (1st/2nd ending) number this measure belongs to; 0 or absent for none. */
  readonly alternateEnding?: number;
  readonly parts: readonly TranscribedPart[];
  /**
   * Syllables sung in this measure on the lyrics track: one per beat that has notes (rests take none), in order, ""
   * for a note sung without one. A word over several notes is split ("Hel-", "lo").
   */
  readonly lyrics?: readonly string[];
}

/** One page's transcription. The first page names the song and the tracks; later pages may repeat them or leave them out. */
export interface TranscriptionPage {
  readonly song?: TranscribedSongInfo;
  readonly tracks?: readonly TranscribedTrack[];
  readonly measures: readonly TranscribedMeasure[];
  /** What the model could not read or is unsure of, for the user. */
  readonly warnings?: readonly string[];
}
