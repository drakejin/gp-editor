import type { StringAddress } from '@gp-editor/core';
import { adjacentString, clampCursor, cursorInTrack, firstCursor } from '../lib/navigation';
import type { ScoreMode } from '../score/geometry';
import type { EditorState } from './editor';
import {
  adjacentTrackIndex,
  selectedTrackShownHint,
  setTrackMode,
  shownTrackIndexes,
  toggleMultitrack,
  toggleTrackShown,
} from './track-display';

/** The tracks the score shows (view settings of the document's tab, never undo steps) and the cursor between them. */
export type TrackDisplayAction =
  /** View ▸ Multitrack (F3): every track not hidden, or the selected one only. */
  | { readonly type: 'toggleMultitrack' }
  /** A track's eye in the tracks panel. */
  | { readonly type: 'toggleTrackShown'; readonly trackIndex: number }
  /** ⌘↑ / ⌘↓ (View ▸ Previous Track / Next Track): the cursor on the previous or next (shown) track, at the same moment. */
  | { readonly type: 'moveCursorTrack'; readonly step: -1 | 1 };

export function reduceTrackDisplay(state: EditorState, action: TrackDisplayAction): EditorState {
  switch (action.type) {
    case 'toggleMultitrack':
      return { ...state, trackDisplay: toggleMultitrack(state.trackDisplay) };
    case 'toggleTrackShown':
      return toggleShown(state, action.trackIndex);
    case 'moveCursorTrack':
      return moveCursorTrack(state, action.step);
  }
}

function toggleShown(state: EditorState, trackIndex: number): EditorState {
  const trackCount = state.document?.song.tracks.length ?? 0;
  if (trackIndex === state.trackIndex) {
    const hint = selectedTrackShownHint();
    return state.hint === hint ? state : { ...state, hint };
  }
  const trackDisplay = toggleTrackShown(state.trackDisplay, trackCount, state.trackIndex, trackIndex);
  return trackDisplay === state.trackDisplay ? state : { ...state, trackDisplay };
}

/** The cursor, else the selected track's first beat. */
function currentCursor(state: EditorState): StringAddress | undefined {
  const song = state.document?.song;
  return state.cursor ?? (song === undefined ? undefined : firstCursor(song, state.trackIndex));
}

/** The cursor and the selected track on another track, at the cursor's moment, on `string`. */
function onTrack(state: EditorState, cursor: StringAddress, trackIndex: number, string: number): EditorState {
  const song = state.document?.song;
  return song === undefined ? state : { ...state, trackIndex, cursor: cursorInTrack(song, cursor, trackIndex, string) };
}

function moveCursorTrack(state: EditorState, step: -1 | 1): EditorState {
  const cursor = currentCursor(state);
  const next = adjacentTrackIndex(state.trackDisplay, state.document?.song.tracks.length ?? 0, state.trackIndex, step);
  return cursor === undefined || next === undefined ? state : onTrack(state, cursor, next, cursor.string);
}

/**
 * ↑ / ↓: the cursor a string up or down; in the multitrack view, past the first or last string onto the previous shown
 * track's last string or the next one's first.
 */
export function moveCursorString(state: EditorState, delta: number): EditorState {
  const song = state.document?.song;
  const cursor = currentCursor(state);
  if (song === undefined || cursor === undefined) {
    return state;
  }
  const stringCount = song.tracks[cursor.trackIndex]?.strings.length ?? 1;
  const string = cursor.string + delta;
  const shown = shownTrackIndexes(state.trackDisplay, song.tracks.length, state.trackIndex);
  const next = string < 1 || string > stringCount ? shown[shown.indexOf(state.trackIndex) + Math.sign(delta)] : undefined;
  if (next === undefined) {
    return { ...state, cursor: clampCursor(song, adjacentString(song, cursor, delta)) };
  }
  return onTrack(state, cursor, next, delta < 0 ? song.tracks[next]?.strings.length ?? 1 : 1);
}

/** A click on a staff (or a bar picked in the bar map): the cursor there, and its track selected. */
export function placeCursor(state: EditorState, cursor: StringAddress): EditorState {
  const song = state.document?.song;
  if (song === undefined) {
    return state;
  }
  const isOtherTrack = cursor.trackIndex !== state.trackIndex && cursor.trackIndex >= 0 && cursor.trackIndex < song.tracks.length;
  return { ...state, trackIndex: isOtherTrack ? cursor.trackIndex : state.trackIndex, cursor: clampCursor(song, cursor) };
}

/**
 * The Track inspector's notation (and View ▸ Show …): the selected track's own staves in the multitrack view or when it
 * has some (a new drum track), else the score's.
 */
export function setScoreMode(state: EditorState, mode: ScoreMode): EditorState {
  const hasOwnStaves = state.trackDisplay.trackModes[state.trackIndex] !== undefined;
  if (!state.trackDisplay.isMultitrack && !hasOwnStaves) {
    return { ...state, mode };
  }
  return { ...state, trackDisplay: setTrackMode(state.trackDisplay, state.trackIndex, mode) };
}
