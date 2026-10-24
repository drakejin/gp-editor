import { type NewTrack, type Song, addTrack, deleteTrack, duplicateTrack, moveTrack } from '@gp-editor/core';
import { t } from '../lib/i18n/i18n';

/**
 * Track ▸ Add Track…, Duplicate Track, Delete Track, Move Track Up / Down and the tracks panel's buttons, drags and menu;
 * each is one undo step, and the shown track, the cursor and the selection follow (track-remap.ts).
 */
export type TrackAction =
  | { readonly type: 'addTrack'; readonly track: NewTrack }
  | { readonly type: 'duplicateTrack'; readonly trackIndex: number }
  | { readonly type: 'deleteTrack'; readonly trackIndex: number }
  /** The track at `fromIndex` to `toIndex`, its index afterwards (a drag in the tracks panel, Move Up / Down). */
  | { readonly type: 'moveTrack'; readonly fromIndex: number; readonly toIndex: number };

export interface TrackEditResult {
  readonly song: Song;
  /** The track to show afterwards (an added or a copied one); absent: the shown track goes where the edit moves it. */
  readonly shownTrackIndex?: number;
  /** Why nothing changed, for the hint strip. */
  readonly hint?: string;
}

export function lastTrackHint(): string {
  return t('palette.hint.lastTrack');
}

function addTrackFailedHint(): string {
  return t('palette.hint.addTrackFailed');
}

function withShown(song: Song, next: Song, shownTrackIndex: number): TrackEditResult {
  return next === song ? { song } : { song: next, shownTrackIndex };
}

/** The song after a track action, and which track to show. */
export function applyTrackAction(song: Song, action: TrackAction): TrackEditResult {
  switch (action.type) {
    case 'addTrack': {
      const added = addTrack(song, action.track);
      return added === song ? { song, hint: addTrackFailedHint() } : withShown(song, added, added.tracks.length - 1);
    }
    case 'duplicateTrack':
      return withShown(song, duplicateTrack(song, action.trackIndex), action.trackIndex + 1);
    case 'deleteTrack':
      return song.tracks.length <= 1 ? { song, hint: lastTrackHint() } : { song: deleteTrack(song, action.trackIndex) };
    case 'moveTrack':
      return { song: moveTrack(song, action.fromIndex, action.toIndex) };
  }
}

/** Move Track Up (-1) / Down (+1): the action moving the track one place; undefined for the first / last track. */
export function trackStepAction(song: Song, trackIndex: number, step: -1 | 1): TrackAction | undefined {
  const toIndex = trackIndex + step;
  return trackIndex < 0 || trackIndex >= song.tracks.length || toIndex < 0 || toIndex >= song.tracks.length ? undefined : { type: 'moveTrack', fromIndex: trackIndex, toIndex };
}
