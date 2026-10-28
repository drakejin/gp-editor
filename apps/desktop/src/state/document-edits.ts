import { type TranspositionOptions, type TranspositionScope, setTrackTuning, transpose } from '@gp-editor/core';
import { clampCursor, firstCursor } from '../lib/navigation';
import { retuneNotice } from '../lib/tuning-hint';
import type { ScoreMode } from '../score/geometry';
import { type AudioTrackAction, applyAudioTrackAction } from './audio-track-edits';
import type { EditorState } from './editor';
import { recordSong } from './editor-history';
import { type LayoutAction, applyLayoutAction } from './layout-edits';
import { type SongAction, applySongAction } from './song-actions';
import { setTrackMode } from './track-display';
import { type TrackAction, applyTrackAction } from './track-edits';
import { followTrackChanges } from './track-remap';
import { transpositionHint } from './transposition';

// The editor's edits of the whole song or of a track, not at the cursor (editor.ts routes the actions here): one undo
// step each.

/** A new drum track's staves: standard notation only, as Guitar Pro adds one (no tab of drum key numbers). */
const DRUM_TRACK_MODE: ScoreMode = 'notation';

export function selectTrack(state: EditorState, trackIndex: number): EditorState {
  const song = state.document?.song;
  if (song === undefined || trackIndex < 0 || trackIndex >= song.tracks.length) {
    return state;
  }
  // Keep the place in the song when switching tracks.
  const cursor = state.cursor === undefined ? firstCursor(song, trackIndex) : clampCursor(song, { ...state.cursor, trackIndex });
  return { ...state, trackIndex, cursor };
}

/** A track's or the song's own edit (name, sound, effects, lyrics, information …). */
export function editSong(state: EditorState, action: SongAction): EditorState {
  return state.document === undefined ? state : recordSong(state, state.document, applySongAction(state.document.song, action));
}

/** The stylesheet or Design Mode's positions. */
export function editLayout(state: EditorState, action: LayoutAction): EditorState {
  return state.document === undefined ? state : recordSong(state, state.document, applyLayoutAction(state.document.song, action));
}

/** An audio track edit, and its hint when it says why nothing changed or what did. */
export function editAudioTrack(state: EditorState, action: AudioTrackAction): EditorState {
  const { document } = state;
  if (document === undefined) {
    return state;
  }
  const result = applyAudioTrackAction(document.song, action);
  const recorded = recordSong(state, document, result.song);
  return result.hint === undefined ? recorded : { ...recorded, hint: result.hint };
}

/** A track added, copied, deleted or moved: the shown track, cursor and selection follow their tracks. */
export function editTracks(state: EditorState, action: TrackAction): EditorState {
  const { document } = state;
  if (document === undefined) {
    return state;
  }
  const result = applyTrackAction(document.song, action);
  const recorded = recordSong(state, document, result.song);
  if (recorded === state) {
    return result.hint === undefined || result.hint === state.hint ? state : { ...state, hint: result.hint };
  }
  const followed = followTrackChanges({ ...recorded, hint: undefined }, document.song, result.song);
  const shown = result.shownTrackIndex === undefined ? followed : selectTrack(followed, result.shownTrackIndex);
  return action.type === 'addTrack' && action.track.kind === 'drums' && result.shownTrackIndex !== undefined
    ? { ...shown, trackDisplay: setTrackMode(shown.trackDisplay, result.shownTrackIndex, DRUM_TRACK_MODE) }
    : shown;
}

/** Tools ▸ Transpose…; the hint strip says what moved, also when nothing could. */
export function transposeSong(state: EditorState, scope: TranspositionScope, options: TranspositionOptions): EditorState {
  const { document } = state;
  if (document === undefined) {
    return state;
  }
  const result = transpose(document.song, scope, options);
  return { ...recordSong(state, document, result.song), hint: transpositionHint(result, options) };
}

/** Retunes a track; the cursor stays on the track's strings and the notice tells what moved. */
export function retune(state: EditorState, trackIndex: number, tuning: readonly number[]): EditorState {
  const { document } = state;
  if (document === undefined) {
    return state;
  }
  const change = setTrackTuning(document.song, trackIndex, tuning);
  const recorded = recordSong(state, document, change.song);
  if (recorded === state) {
    return state;
  }
  const cursor = state.cursor === undefined ? undefined : clampCursor(change.song, state.cursor);
  return { ...recorded, cursor, notice: retuneNotice(change) };
}
