import { type BeatFragment, type Song, type StringAddress, copyBeats, deleteBeatsFlowing, insertBeatsFlowing } from '@gp-editor/core';
import { adjacentBeat, clampCursor } from '../lib/navigation';
import { plural } from '../lib/wording';
import type { BeatRange } from '../score/selection-tint';
import type { EditorAction, EditorState } from './editor';
import { beatAddress } from './song-edits';

/** What the selection helpers read of the editor state. */
type SelectionState = Pick<EditorState, 'document' | 'cursor' | 'selectionAnchor'>;

/** A song after a cut or paste, with where the cursor goes. */
export interface ClipboardEdit {
  readonly song: Song;
  readonly cursor: StringAddress;
}

function isBefore(a: StringAddress, b: StringAddress): boolean {
  return a.measureIndex < b.measureIndex || (a.measureIndex === b.measureIndex && a.beatIndex < b.beatIndex);
}

/** The selection's first and last beat; undefined without a selection. */
export function selectionRange(state: SelectionState): BeatRange | undefined {
  const { cursor, selectionAnchor: anchor } = state;
  if (cursor === undefined || anchor === undefined) {
    return undefined;
  }
  const [first, last] = isBefore(cursor, anchor) ? [cursor, anchor] : [anchor, cursor];
  return { first: { measureIndex: first.measureIndex, beatIndex: first.beatIndex }, last: { measureIndex: last.measureIndex, beatIndex: last.beatIndex } };
}

/** The selected beats in the cursor's voice — the cursor's beat when nothing is selected; undefined when there are none. */
export function selectedFragment(state: SelectionState): BeatFragment | undefined {
  const { document, cursor } = state;
  if (document === undefined || cursor === undefined) {
    return undefined;
  }
  const fragment = copyBeats(document.song, beatAddress(state.selectionAnchor ?? cursor), beatAddress(cursor));
  return fragment.items.length === 0 ? undefined : fragment;
}

/** "4 beats from bars 3–4", "1 beat from bar 2": the plain text put on the clipboard with copied beats. */
export function selectionSummary(state: SelectionState, fragment: BeatFragment): string {
  const cursorBar = (state.cursor?.measureIndex ?? 0) + 1;
  const anchorBar = state.selectionAnchor === undefined ? cursorBar : state.selectionAnchor.measureIndex + 1;
  const first = Math.min(cursorBar, anchorBar);
  const last = Math.max(cursorBar, anchorBar);
  return `${plural(fragment.items.length, 'beat')} from ${first === last ? `bar ${first}` : `bars ${first}–${last}`}`;
}

/** Shift-←/→: the cursor a beat further (as moveCursorBeat), the selection anchored where it started. */
export function extendSelection(state: EditorState, step: -1 | 1): EditorState {
  const song = state.document?.song;
  const { cursor } = state;
  if (song === undefined || cursor === undefined) {
    return state;
  }
  const moved = clampCursor(song, adjacentBeat(song, cursor, step)) ?? cursor;
  return { ...state, cursor: moved, selectionAnchor: state.selectionAnchor ?? cursor };
}

/**
 * The state after `action`, without the selection when the action moved the cursor some other way than extending it,
 * changed the song or showed another track (a plain cursor move, a click, an edit, undo).
 */
export function settleSelection(before: EditorState, after: EditorState, action: EditorAction): EditorState {
  if (after.selectionAnchor === undefined || action.type === 'extendSelection') {
    return after;
  }
  const isKept = after.cursor === before.cursor && after.document?.song === before.document?.song && after.trackIndex === before.trackIndex;
  return isKept ? after : { ...after, selectionAnchor: undefined };
}

/** The cursor on the beat of its bar that starts at `start` (where the edit put the first moved beat), inside the song. */
function cursorAt(song: Song, cursor: StringAddress, start: number | undefined): StringAddress {
  const beats = song.tracks[cursor.trackIndex]?.measures[cursor.measureIndex]?.beats ?? [];
  const beatIndex = beats.findIndex((beat) => beat.start === start);
  return clampCursor(song, beatIndex < 0 ? cursor : { ...cursor, beatIndex }) ?? cursor;
}

function beatStart(song: Song, at: StringAddress): number | undefined {
  return song.tracks[at.trackIndex]?.measures[at.measureIndex]?.beats[at.beatIndex]?.start;
}

/** ⌘X: the selected beats (or the cursor's beat) deleted, what follows moved up; the cursor on the first removed place. */
export function cutSelectionAt(song: Song, cursor: StringAddress, anchor: StringAddress | undefined): ClipboardEdit {
  const from = anchor ?? cursor;
  const first = isBefore(cursor, from) ? cursor : from;
  const next = deleteBeatsFlowing(song, beatAddress(from), beatAddress(cursor));
  return { song: next, cursor: cursorAt(next, { ...cursor, measureIndex: first.measureIndex, beatIndex: first.beatIndex }, beatStart(song, first)) };
}

/** Why beats did not paste at the cursor (drum beats and others do not mix); undefined when there is nothing to explain. */
export function pasteRefusal(song: Song, cursor: StringAddress, fragment: BeatFragment): string | undefined {
  const track = song.tracks[cursor.trackIndex];
  if (track === undefined || track.isPercussion === fragment.isPercussion) {
    return undefined;
  }
  return fragment.isPercussion ? 'Beats copied from a drum track paste into drum tracks only.' : 'Only beats copied from a drum track paste into a drum track.';
}

/** ⌘V: the beats inserted at the cursor, what follows moved on; the cursor on the first pasted beat. */
export function pasteBeatsAt(song: Song, cursor: StringAddress, fragment: BeatFragment): ClipboardEdit {
  const next = insertBeatsFlowing(song, beatAddress(cursor), fragment);
  return { song: next, cursor: cursorAt(next, cursor, beatStart(song, cursor)) };
}
