import { type BeatFragment, type Song, type StringAddress, copyBeats, deleteBeatsFlowing, pasteBeats } from '@gp-editor/core';
import { adjacentBeat, clampCursor, cursorInTrack } from '../lib/navigation';
import { t } from '../lib/i18n/i18n';
import type { BeatPosition, BeatRange } from '../score/selection-tint';
import type { EditorAction, EditorState } from './editor';
import type { LoopRange } from './practice';
import { beatAddress } from './song-edits';

/** What the selection helpers read of the editor state. */
type SelectionState = Pick<EditorState, 'document' | 'cursor' | 'selectionAnchor'>;

/** A song after a cut or paste, with where the cursor goes and what the hint strip says. */
export interface ClipboardEdit {
  readonly song: Song;
  readonly cursor: StringAddress;
  readonly hint?: string;
}

function isBefore(a: BeatPosition, b: BeatPosition): boolean {
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

/**
 * True when a voice of a beat is selected: on a beat from the selection's first to its last, in the selection's track and
 * voice (the cursor's). Nothing is, without a selection.
 */
export function isInSelection(state: SelectionState, at: Omit<StringAddress, 'string'>): boolean {
  const range = selectionRange(state);
  const { cursor } = state;
  if (range === undefined || cursor === undefined || at.trackIndex !== cursor.trackIndex || at.voiceIndex !== cursor.voiceIndex) {
    return false;
  }
  return !isBefore(at, range.first) && !isBefore(range.last, at);
}

/** Where playing a selection starts: its first beat's bar and song tick (a bar without beats: its start); undefined without a selection. */
export function selectionStart(state: SelectionState): { readonly measureIndex: number; readonly tick: number } | undefined {
  const first = selectionRange(state)?.first;
  const { cursor, document } = state;
  const measure = first === undefined || cursor === undefined ? undefined : document?.song.tracks[cursor.trackIndex]?.measures[first.measureIndex];
  if (first === undefined || measure === undefined) {
    return undefined;
  }
  const tick = measure.beats.length === 0 ? document?.song.measureHeaders[first.measureIndex]?.start : measure.beats[first.beatIndex]?.start;
  return tick === undefined ? undefined : { measureIndex: first.measureIndex, tick };
}

/** The bars a selection spans, first to last: what the loop plays; undefined without a selection. */
export function selectionBars(state: SelectionState): LoopRange | undefined {
  const range = selectionRange(state);
  return range === undefined ? undefined : { fromMeasureIndex: range.first.measureIndex, toMeasureIndex: range.last.measureIndex };
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
  const count = fragment.items.length;
  return first === last ? t('palette.selection.oneBar', { count, bar: first }) : t('palette.selection.bars', { count, first, last });
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
 * A mouse drag, or a shift-click: the cursor on `target`, the selection anchored where it started (the cursor before
 * the first such move). Back on the anchor's beat nothing is selected. A target on another track (a shift-click in the
 * multitrack view) selects to the beat of the cursor's track at that moment: a selection stays on one track.
 */
export function selectTo(state: EditorState, target: StringAddress): EditorState {
  const song = state.document?.song;
  const { cursor } = state;
  if (song === undefined || cursor === undefined) {
    return state;
  }
  const onTrack = target.trackIndex === cursor.trackIndex ? target : cursorInTrack(song, target, cursor.trackIndex, cursor.string);
  const moved = (onTrack === undefined ? undefined : clampCursor(song, onTrack)) ?? cursor;
  const anchor = state.selectionAnchor ?? cursor;
  const isAnchorBeat = moved.measureIndex === anchor.measureIndex && moved.beatIndex === anchor.beatIndex;
  return { ...state, cursor: moved, selectionAnchor: isAnchorBeat ? undefined : anchor };
}

/**
 * The beats from `anchor` to `cursor` (in the cursor's track and voice) selected as given — on one beat too, which a drag
 * back onto its beat does not select —, the cursor on `cursor`; both kept inside the song. The same state without a song.
 */
export function selectBeats(state: EditorState, anchor: StringAddress, cursor: StringAddress): EditorState {
  const song = state.document?.song;
  const moved = song === undefined ? undefined : clampCursor(song, cursor);
  const from = song === undefined ? undefined : clampCursor(song, { ...anchor, trackIndex: cursor.trackIndex, voiceIndex: cursor.voiceIndex });
  return moved === undefined || from === undefined ? state : { ...state, cursor: moved, selectionAnchor: from };
}

/**
 * The state after `action`, without the selection when the action moved the cursor some other way than extending it,
 * changed the song (but for a transposition or a semitone step) or showed another track (a plain cursor move, a click,
 * an edit, undo).
 */
export function settleSelection(before: EditorState, after: EditorState, action: EditorAction): EditorState {
  // A transposition, a semitone up or down (or AI Edit's exact edit) changes no beat, so the selection stays for another one.
  const keepsBeats = action.type === 'transpose' || action.type === 'shiftPitch' || (action.type === 'applyAiEdit' && action.keepsBeats);
  if (after.selectionAnchor === undefined || action.type === 'extendSelection' || action.type === 'selectTo' || action.type === 'selectBeats' || keepsBeats) {
    return after;
  }
  return isScoreUntouched(before, after) ? after : { ...after, selectionAnchor: undefined };
}

/** True when an action left the song, the cursor and the shown track as they were (a hint, a view change). */
export function isScoreUntouched(before: EditorState, after: EditorState): boolean {
  return after.cursor === before.cursor && after.document?.song === before.document?.song && after.trackIndex === before.trackIndex;
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
  return t(fragment.isPercussion ? 'palette.hint.pasteDrumsOnly' : 'palette.hint.pasteIntoDrums');
}

/**
 * ⌘V: Guitar Pro 8's paste (gp-core pasteBeats) — up to a bar written over the voice from the cursor, longer into whole
 * bars added before the cursor's bar (or into the empty bars there); the cursor on the first pasted beat, and the hint
 * says when bars were added, which moves every track.
 */
export function pasteBeatsAt(song: Song, cursor: StringAddress, fragment: BeatFragment): ClipboardEdit {
  const pasted = pasteBeats(song, beatAddress(cursor), fragment);
  const first = { ...cursor, measureIndex: pasted.at.measureIndex, beatIndex: pasted.at.beatIndex };
  const hint = pasted.addedBars > 0 ? t('palette.hint.pasteAddedBars', { count: pasted.addedBars }) : undefined;
  return { song: pasted.song, cursor: clampCursor(pasted.song, first) ?? cursor, hint };
}
