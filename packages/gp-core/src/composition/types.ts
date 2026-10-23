import type { TimeSignature } from '../model/song';
import type { TranscribedTrack } from '../transcription/types';

/**
 * The song writer's plan: what a model answers to PLAN_SONG_TOOL before it writes the music section by section with
 * WRITE_SECTION_TOOL (whose measures are the transcription contract's). parseSongPlan checks it field by field.
 */

export const MAX_PLAN_TRACKS = 4;
export const MAX_PLAN_SECTIONS = 16;
/** A section is written in one answer: a long one would not fit. */
export const MAX_SECTION_BARS = 32;
/** About five minutes at a brisk tempo. */
export const MAX_PLAN_BARS = 160;
export const MIN_PLAN_TEMPO = 40;
export const MAX_PLAN_TEMPO = 240;
export const DEFAULT_PLAN_TEMPO = 100;
export const MAX_PLAN_NAME_LENGTH = 64;
/** A section's chords, lyrics or idea. */
export const MAX_PLAN_TEXT_LENGTH = 2000;

export interface PlannedSection {
  /** "Intro", "Verse 1", "Chorus" … shown as the section's marker. */
  readonly name: string;
  readonly bars: number;
  /** The chord progression, e.g. "Dm | Bb | F | C". */
  readonly chords: string;
  /** The lines sung in it; "" for an instrumental section. */
  readonly lyrics: string;
  /** What happens musically: feel, dynamics, which instrument leads. */
  readonly idea: string;
}

export interface SongPlan {
  readonly title: string;
  /** Quarter-note BPM. */
  readonly tempo: number;
  readonly timeSignature: TimeSignature;
  /** Sharps (> 0) or flats (< 0). */
  readonly keySignature: number;
  readonly tracks: readonly TranscribedTrack[];
  /** The track that carries the melody and the lyrics. */
  readonly lyricsTrack: number;
  readonly sections: readonly PlannedSection[];
  /** What the check changed or left out, for the user. */
  readonly warnings: readonly string[];
}
