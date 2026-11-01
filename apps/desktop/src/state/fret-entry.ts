import { MAX_DRUM_KEY, MAX_FRET, type Song, type StringAddress } from '@gp-editor/core';
import { type DigitPress, type FretEntry, nextFretEntry } from '../lib/fret-input';
import { typeFret } from './cursor-edits';
import type { EditorState } from './editor';
import { isScoreUntouched } from './selection';

// Frets typed digit by digit on the score (Guitar Pro's "short delay allows entering two-digit fret numbers"): the
// digits of one fret are typed at one note, one key press after the other; anything else ends the fret.

/** The editor before the fret's first digit: the whole number is typed from here, as one edit (one undo step). */
interface FretStart {
  readonly song: Song;
  readonly past: readonly Song[];
  readonly cursor?: StringAddress;
}

/** The fret being typed at the cursor's note (EditorState.typedFret). */
export interface TypedFret extends FretEntry {
  readonly start: FretStart;
}

/** The most a typed number may be at the cursor: a drum track's General MIDI key, else a fret. */
function highestTyped(state: EditorState): number {
  const { cursor, document } = state;
  const track = cursor === undefined ? undefined : document?.song.tracks[cursor.trackIndex];
  return track?.isPercussion === true ? MAX_DRUM_KEY : MAX_FRET;
}

/** The editor as it was before the fret's first digit (nothing else happened since: any other action ends the fret). */
function rewound(state: EditorState, start: FretStart): EditorState {
  return state.document === undefined ? state : { ...state, document: { ...state.document, song: start.song }, past: start.past, cursor: start.cursor };
}

/**
 * A digit typed on the score: with the digits typed just before at the same note, one fret (1 then 2 → 12, written as
 * one edit from where the first digit found the note); else a fret of its own.
 */
export function typeFretDigit(state: EditorState, press: DigitPress): EditorState {
  const { document, typedFret } = state;
  if (document === undefined) {
    return state;
  }
  const entry = nextFretEntry(typedFret, press, highestTyped(state));
  // The number grew from the digits before (a leading 0 adds nothing to it).
  const isContinued = typedFret !== undefined && entry.fret !== press.digit;
  const start: FretStart = isContinued ? typedFret.start : { song: document.song, past: state.past, cursor: state.cursor };
  const typed = typeFret(isContinued ? rewound(state, start) : state, entry.fret);
  return { ...typed, typedFret: { ...entry, start } };
}

/** After any other action: the fret being typed ends unless the action left the song, the cursor and the track as they were. */
export function settleTypedFret(before: EditorState, after: EditorState): EditorState {
  return after.typedFret === undefined || isScoreUntouched(before, after) ? after : { ...after, typedFret: undefined };
}
