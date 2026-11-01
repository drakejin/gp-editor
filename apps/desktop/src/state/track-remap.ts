import { type Song, type TrackIndexMap, isIdentityTrackMap, matchTrackIndexes, remapTrackIndex } from '@gp-editor/core';
import { clampCursor, firstCursor } from '../lib/navigation';
import type { EditorState } from './editor';
import { DRUM_TRACK_MODE, followDrumChanges, remapTrackDisplay, setTrackMode } from './track-display';

/** The shown track after a track edit: where it went; when it was deleted, the track now at its place (else the last). */
function followShownTrack(map: TrackIndexMap, trackIndex: number, song: Song): number {
  return remapTrackIndex(map, trackIndex) ?? Math.max(0, Math.min(trackIndex, song.tracks.length - 1));
}

/**
 * The editor state after its song's tracks were added, deleted, duplicated or moved as `map` says (the document already
 * holds the new song): every track index it keeps follows its track — the shown track, the cursor, the selection's start.
 * The one place that remaps an editor's track indexes; a track view of the state (shown tracks) belongs here too.
 */
export function remapEditorTracks(state: EditorState, map: TrackIndexMap): EditorState {
  const song = state.document?.song;
  if (song === undefined) {
    return state;
  }
  const trackIndex = followShownTrack(map, state.trackIndex, song);
  const { cursor: before, selectionAnchor: anchor } = state;
  const cursor = before === undefined ? firstCursor(song, trackIndex) : clampCursor(song, { ...before, trackIndex: remapTrackIndex(map, before.trackIndex) ?? trackIndex });
  const anchorTrackIndex = anchor === undefined ? undefined : remapTrackIndex(map, anchor.trackIndex);
  const selectionAnchor = anchor === undefined || anchorTrackIndex === undefined ? undefined : { ...anchor, trackIndex: anchorTrackIndex };
  const trackDisplay = remapTrackDisplay(state.trackDisplay, (index) => remapTrackIndex(map, index));
  return { ...state, trackIndex, cursor, selectionAnchor, trackDisplay };
}

/** The tracks of `after` that no track of `before` became: added, or back on an undo. */
function newTrackIndexes(map: TrackIndexMap, after: Song): readonly number[] {
  const followed = new Set(map.filter((trackIndex): trackIndex is number => trackIndex !== undefined));
  return after.tracks.flatMap((_, trackIndex) => (followed.has(trackIndex) ? [] : [trackIndex]));
}

/**
 * After an undo or a redo from `before` to `after` (or an edit that adds tracks): when the tracks themselves changed,
 * the state follows them, and a drum track that comes (back) without a view of its own is shown as notation; a track
 * that turned drums or pitched (an instrument chosen, undone or redone) gets the view it would have (followDrumChanges).
 */
export function followTrackChanges(state: EditorState, before: Song, after: Song): EditorState {
  const map = matchTrackIndexes(before, after);
  const followed = isIdentityTrackMap(map, after.tracks.length) ? state : remapEditorTracks(state, map);
  const drums = newTrackIndexes(map, after).filter((trackIndex) => after.tracks[trackIndex]?.isPercussion === true && followed.trackDisplay.trackModes[trackIndex] === undefined);
  const withDrums = drums.reduce((display, trackIndex) => setTrackMode(display, trackIndex, DRUM_TRACK_MODE), followed.trackDisplay);
  const trackDisplay = followDrumChanges(withDrums, before, after, map);
  return trackDisplay === followed.trackDisplay ? followed : { ...followed, trackDisplay };
}
