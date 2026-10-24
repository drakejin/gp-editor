import { type Dispatch, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { type NewTrack, type Song, type Track, type TrackIndexMap, hasTrackNotes } from '@gp-editor/core';
import { type TrackMenuCommand, subscribeTrackMenuCommands } from '../native/track-menu';
import type { EditorAction } from '../state/editor';
import { trackStepAction } from '../state/track-edits';
import { useTrackRemaps } from './use-track-remaps';

/** A track with notes, waiting for the answer to "Delete it?". */
export interface PendingDelete {
  readonly track: Track;
  readonly trackIndex: number;
}

/** What the tracks panel's buttons and drags call. */
export interface TrackPanelActions {
  /** Opens the Add Track panel. */
  readonly onAddTrack: () => void;
  readonly onDuplicateTrack: (trackIndex: number) => void;
  /** Deletes the track; one with notes asks first. */
  readonly onDeleteTrack: (trackIndex: number) => void;
  readonly onMoveTrack: (fromIndex: number, toIndex: number) => void;
}

/** Track ▸ Add Track…, Duplicate Track, Delete Track, Move Track Up / Down, and the same from the tracks panel. */
export interface TrackManager {
  readonly isAddPanelOpen: boolean;
  /** Adds the track the Add Track panel describes (one undo step) and closes the panel. */
  readonly addTrack: (track: NewTrack) => void;
  readonly pendingDelete?: PendingDelete;
  /** "Delete": the asked-about track goes (one undo step), when the song still has it. */
  readonly confirmDelete: () => void;
  readonly panelActions: TrackPanelActions;
  /** A Track menu or command palette command, on the shown track. */
  readonly runTrackCommand: (command: TrackMenuCommand) => void;
  /** The Add Track panel or the delete question is over the window. */
  readonly isOpen: boolean;
  /** Esc, Cancel, a click outside: closes the panel or the question; false when neither was open. */
  readonly close: () => boolean;
}

export interface TrackManagerSources {
  readonly song?: Song;
  /** The track shown in the score: what the Track menu acts on. */
  readonly shownTrackIndex: number;
  readonly tabId?: string;
  readonly dispatch: Dispatch<EditorAction>;
  /** The panel or the question went: the keyboard goes back to the score. */
  readonly onClosed: () => void;
  /** The shown song's tracks were added, deleted or moved (an edit, undo or redo): what the window keeps by index follows. */
  readonly onTracksRemapped: (map: TrackIndexMap) => void;
}

interface Latest {
  readonly song?: Song;
  readonly shownTrackIndex: number;
}

/**
 * The track commands of the shown tab: each edit is one editor action (one undo step); deleting a track with notes asks
 * first.
 */
export function useTrackManager({ song, shownTrackIndex, tabId, dispatch, onClosed, onTracksRemapped }: TrackManagerSources): TrackManager {
  const [isAddPanelOpen, setIsAddPanelOpen] = useState(false);
  const [pendingDelete, setPendingDelete] = useState<PendingDelete | undefined>(undefined);
  const latest = useRef<Latest>({ song, shownTrackIndex });
  latest.current = { song, shownTrackIndex };
  const hasSong = song !== undefined;

  const panelActions = useMemo<TrackPanelActions>(
    () => ({
      onAddTrack: () => setIsAddPanelOpen(latest.current.song !== undefined),
      onDuplicateTrack: (trackIndex) => dispatch({ type: 'duplicateTrack', trackIndex }),
      onDeleteTrack: (trackIndex) => {
        const track = latest.current.song?.tracks[trackIndex];
        const isAsked = track !== undefined && (latest.current.song?.tracks.length ?? 0) > 1 && hasTrackNotes(track);
        if (isAsked) {
          setPendingDelete({ track, trackIndex });
        } else {
          dispatch({ type: 'deleteTrack', trackIndex });
        }
      },
      onMoveTrack: (fromIndex, toIndex) => dispatch({ type: 'moveTrack', fromIndex, toIndex }),
    }),
    [dispatch],
  );

  const runTrackCommand = useCallback(
    (command: TrackMenuCommand) => {
      const { song: shown, shownTrackIndex: index } = latest.current;
      if (shown === undefined) {
        return;
      }
      const step = command === 'moveUp' ? -1 : command === 'moveDown' ? 1 : undefined;
      if (step !== undefined) {
        const action = trackStepAction(shown, index, step);
        if (action !== undefined) {
          dispatch(action);
        }
      } else if (command === 'add') {
        panelActions.onAddTrack();
      } else if (command === 'duplicate') {
        panelActions.onDuplicateTrack(index);
      } else {
        panelActions.onDeleteTrack(index);
      }
    },
    [dispatch, panelActions],
  );
  useEffect(() => subscribeTrackMenuCommands(runTrackCommand), [runTrackCommand]);
  useTrackRemaps(song, tabId, onTracksRemapped);

  const addTrack = useCallback(
    (track: NewTrack) => {
      dispatch({ type: 'addTrack', track });
      setIsAddPanelOpen(false);
      onClosed();
    },
    [dispatch, onClosed],
  );
  const confirmDelete = useCallback(() => {
    // Found by its measures, which a move or renumbering keeps (matchTrackIndexes' rule).
    const trackIndex = pendingDelete === undefined ? -1 : (latest.current.song?.tracks.findIndex((track) => track.measures === pendingDelete.track.measures) ?? -1);
    if (trackIndex >= 0) {
      dispatch({ type: 'deleteTrack', trackIndex });
    }
    setPendingDelete(undefined);
    onClosed();
  }, [dispatch, pendingDelete, onClosed]);
  const isOpen = (isAddPanelOpen && hasSong) || pendingDelete !== undefined;
  const close = useCallback(() => {
    if (!isAddPanelOpen && pendingDelete === undefined) {
      return false;
    }
    setIsAddPanelOpen(false);
    setPendingDelete(undefined);
    onClosed();
    return true;
  }, [isAddPanelOpen, pendingDelete, onClosed]);
  return { isAddPanelOpen: isAddPanelOpen && hasSong, addTrack, pendingDelete, confirmDelete, panelActions, runTrackCommand, isOpen, close };
}
