import { useCallback, useEffect, useMemo } from 'react';
import { type Note, type PlayedNote, findNote } from '@gp-editor/core';
import type { NotePanel } from '../lib/key-commands';
import type { BeatRange } from '../score/selection-tint';
import { noNoteHint } from '../state/edit-hints';
import type { EditorAction } from '../state/editor';
import { selectionRange } from '../state/selection';
import type { SongEdit } from '../state/song-edits';
import { type AudioTrackLaneCommands, useAudioTrack } from './use-audio-track';
import { type MidiInput, useMidiInput } from './use-midi-input';
import type { WindowBase, WindowMedia } from './use-window';

/** What edits at the cursor from outside the score's keys: the palette, the note and chord panels, the drum kit, MIDI. */
export interface CursorTools {
  /** The tinted beats; the same object while the cursor and the anchor stay, so rows outside it are not redrawn. */
  readonly selection?: BeatRange;
  /** The note at the cursor; none on an empty string or a rest. */
  readonly cursorNote?: Note;
  /** B / C and the palette's vibrato, bend and W.bar: the panel for the note at the cursor (a hint on an empty string). */
  readonly openNotePanel: (panel: NotePanel) => void;
  /** K and the palette's Chord tool: the chord panel for the cursor's beat (none without a cursor). */
  readonly openChordPanel: () => void;
  /** The chord panel closes back to the score; Apply and Remove are one undo step each. */
  readonly leaveChordPanel: (edit?: SongEdit) => void;
  /** Palette buttons edit at the cursor, then hand the keyboard back to the score (to type the next fret). */
  readonly editAtCursor: (edit: SongEdit) => void;
  readonly actAtCursor: (action: EditorAction) => void;
  /** A drum kit click enters that drum at the cursor (or takes it out of the beat). */
  readonly hitDrum: (key: number) => void;
  /** MIDI step entry: a struck chord becomes the cursor's beat; not while a panel or menu is over the score. */
  readonly midiInput: MidiInput;
  /** The audio track's lane, Track ▸ Add Audio Track… and Y (the cursor's bar starts at this moment of the recording). */
  readonly audioLane: AudioTrackLaneCommands;
}

/** The note and chord panels follow the cursor: an empty string closes the note panel, no cursor the chord panel. */
function usePanelsAtCursor({ dispatch, state, chrome, focusScore }: WindowBase, cursorNote: Note | undefined) {
  const hasCursorNote = cursorNote !== undefined;
  const stringAtCursor = state.cursor?.string;
  const hasCursor = state.cursor !== undefined;
  const { openNotePanel: showNotePanel, closeNotePanel, openChordPanel: showChordPanel, closeChordPanel } = chrome;
  const openNotePanel = useCallback(
    (panel: NotePanel) => {
      if (hasCursorNote) {
        showNotePanel(panel);
      } else if (stringAtCursor !== undefined) {
        dispatch({ type: 'showHint', hint: noNoteHint(stringAtCursor) });
      }
      focusScore();
    },
    [hasCursorNote, stringAtCursor, showNotePanel, dispatch, focusScore],
  );
  const openChordPanel = useCallback(() => {
    if (hasCursor) {
      showChordPanel();
    }
  }, [hasCursor, showChordPanel]);
  useEffect(() => {
    if (!hasCursor) {
      closeChordPanel();
    }
  }, [hasCursor, closeChordPanel]);
  useEffect(() => {
    if (!hasCursorNote) {
      closeNotePanel();
    }
  }, [hasCursorNote, closeNotePanel]);
  return { openNotePanel, openChordPanel };
}

/** Edits from the palette, the chord panel and the drum kit; the keyboard goes back to the score after each. */
function useEditsAtCursor({ dispatch, chrome, focusScore }: WindowBase) {
  const { closeChordPanel } = chrome;
  const editAtCursor = useCallback(
    (edit: SongEdit) => {
      dispatch({ type: 'edit', edit });
      focusScore();
    },
    [dispatch, focusScore],
  );
  const actAtCursor = useCallback(
    (action: EditorAction) => {
      dispatch(action);
      focusScore();
    },
    [dispatch, focusScore],
  );
  const hitDrum = useCallback((key: number) => actAtCursor({ type: 'toggleDrumNote', key }), [actAtCursor]);
  const leaveChordPanel = useCallback(
    (edit?: SongEdit) => {
      closeChordPanel();
      if (edit !== undefined) {
        dispatch({ type: 'edit', edit });
      }
      focusScore();
    },
    [closeChordPanel, dispatch, focusScore],
  );
  return { editAtCursor, actAtCursor, hitDrum, leaveChordPanel };
}

export function useCursorTools(base: WindowBase, { playback }: WindowMedia, isOverlayOpen: boolean): CursorTools {
  const { dispatch, state } = base;
  const { document, cursor, selectionAnchor } = state;
  const song = document?.song;
  const selection = useMemo(() => selectionRange({ cursor, selectionAnchor }), [cursor, selectionAnchor]);
  const cursorNote = song === undefined || cursor === undefined ? undefined : findNote(song, cursor);
  const panels = usePanelsAtCursor(base, cursorNote);
  const audioLane = useAudioTrack({ song, cursor, dispatch, audioSecondsNow: playback.audioSecondsNow });
  const edits = useEditsAtCursor(base);
  const enterPlayed = useCallback(
    (notes: readonly PlayedNote[]) => {
      if (!isOverlayOpen) {
        dispatch({ type: 'enterPlayedNotes', notes });
      }
    },
    [isOverlayOpen, dispatch],
  );
  const midiInput = useMidiInput(enterPlayed);
  return { selection, cursorNote, ...panels, ...edits, midiInput, audioLane };
}
