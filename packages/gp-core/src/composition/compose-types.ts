import type { Song } from '../model/song';
import type { TranscribedMeasure, TranscribedTrack } from '../transcription/types';

/**
 * Compose from Here (Edit ▸ AI Wizard): a model writes the bars of the open score from a start bar with WRITE_BARS_TOOL —
 * each bar's parts as the PDF import's measures (any staff, drums by name), and the tracks it adds. parseComposedBars
 * checks the answer against what the user allowed (ComposeScope); applyComposedBars writes it into the song.
 */

/** Bars one answer may write: a dense band writes ~12 bars in the PDF import's 64,000-token answer, one track many more. */
export const MAX_COMPOSED_BARS = 64;
/** Tracks one answer may add (the contract's track indexes also stop at MAX_TRANSCRIBED_TRACKS). */
export const MAX_COMPOSED_NEW_TRACKS = 4;

/** What an answer may write: which of the song's tracks, whether it may add tracks, and how many bars. */
export interface ComposeScope {
  /** The song's tracks: a new track's index is this plus its place among the new tracks. */
  readonly trackCount: number;
  /** The song's track names, by index, to name a track in a warning. */
  readonly trackNames: readonly string[];
  /** Indexes of the song's tracks the answer may write. */
  readonly writableTracks: readonly number[];
  readonly allowsNewTracks: boolean;
  /** At most this many bars are kept (and never more than MAX_COMPOSED_BARS). */
  readonly maxBars: number;
}

/** A checked answer: the bars from the start bar on (meter, tempo, key and parts only), the tracks to add, warnings. */
export interface ComposedBars {
  readonly bars: readonly TranscribedMeasure[];
  /** Track index `trackCount + i` in the bars' parts. */
  readonly newTracks: readonly TranscribedTrack[];
  /** The model's, then what the check left out. */
  readonly warnings: readonly string[];
}

/** The song with the bars written, and what changed, for the result summary. */
export interface ComposeOutcome {
  readonly song: Song;
  readonly barsWritten: number;
  /** Bars added past the song's end (in every track). */
  readonly barsAdded: number;
  readonly tracksAdded: number;
  /** Notes in the bars written. */
  readonly notes: number;
  /** Indexes (in the new song) of the tracks the bars were written into. */
  readonly writtenTracks: readonly number[];
  readonly warnings: readonly string[];
}
