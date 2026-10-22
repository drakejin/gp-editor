import { type Dispatch, type RefObject, useCallback, useRef } from 'react';
import type { DragEvent, KeyEvent, View } from 'react-native';
import type { DigitEntry } from '../lib/fret-input';
import { type KeyCommand, type NotePanel, keyCommand } from '../lib/key-commands';
import { focusView } from '../native/focus-view';
import type { ScoreMode } from '../score/geometry';
import type { RowHit } from '../score/hit-test';
import { type AppCommand, type BarJump, jumpTarget } from '../state/app-command';
import { playbackStartTempo } from '../state/practice';
import type { EditorAction, EditorState } from '../state/editor';
import type { Playback } from './use-playback';

export interface EditorCommands {
  readonly runCommand: (command: AppCommand | KeyCommand) => void;
  readonly onPressBeat: (hit: RowHit) => void;
  readonly onKeyDown: (event: KeyEvent) => void;
  readonly onDrop: (event: DragEvent) => void;
}

interface EditorCommandSources {
  readonly state: EditorState;
  readonly dispatch: Dispatch<EditorAction>;
  readonly playback: Playback;
  readonly create: (mode: ScoreMode) => void;
  readonly openDialog: () => void;
  readonly importPdf: () => void;
  /** Opens the export panel (Export… button). */
  readonly exportPdf: () => void;
  readonly openPath: (pathOrUrl: string) => void;
  readonly save: (saveAs: boolean) => void;
  /** ⌘- / ⌘=: one zoom level down or up. */
  readonly onZoom: (direction: 1 | -1) => void;
  /** B / C: the vibrato or bend panel for the note at the cursor. */
  readonly onNotePanel: (panel: NotePanel) => void;
  /** Esc closes an open panel or menu first (true when one was open); with none open it stops playback. */
  readonly closeOverlay: () => boolean;
  /** ⌘C / ⌘X / ⌘V on the score. */
  readonly clipboard: { readonly copy: () => void; readonly cut: () => void; readonly paste: () => void };
  /** The view that receives keyboard events; focused again after clicks on the score. */
  readonly keyboardView: RefObject<View | null>;
}

/** Toolbar buttons, keys, score clicks and file drops, turned into editor actions and playback controls. */
export function useEditorCommands(sources: EditorCommandSources): EditorCommands {
  const { dispatch, playback, create, openDialog, importPdf, exportPdf, openPath, save, onZoom, onNotePanel, closeOverlay, clipboard, keyboardView } = sources;
  const { cursor, trackIndex, mode } = sources.state;
  const lastDigit = useRef<DigitEntry | undefined>(undefined);
  const { isPlaying, start, stop } = playback;

  const measureCount = sources.state.document?.song.measureHeaders.length ?? 0;
  // The transport's bar buttons: the cursor moves to the bar's first beat; playback follows when playing.
  const goToBar = useCallback(
    (jump: BarJump) => {
      const measureIndex = jumpTarget(jump, cursor?.measureIndex ?? 0, measureCount);
      dispatch({ type: 'placeCursor', cursor: { trackIndex, measureIndex, beatIndex: 0, voiceIndex: cursor?.voiceIndex ?? 0, string: cursor?.string ?? 1 } });
      if (isPlaying) {
        start(measureIndex);
      }
    },
    [cursor?.measureIndex, cursor?.voiceIndex, cursor?.string, measureCount, trackIndex, isPlaying, start, dispatch],
  );

  const song = sources.state.document?.song;
  const { practice, changePractice } = playback;
  // ] / [ : the playback tempo of the bar playback starts from, 5 BPM a press (the song is not edited).
  const shiftPlaybackTempo = useCallback(
    (delta: number) => {
      if (song !== undefined) {
        changePractice({ type: 'shiftTempo', delta, writtenTempo: playbackStartTempo(song, practice, cursor?.measureIndex ?? 0) });
      }
    },
    [song, practice, changePractice, cursor?.measureIndex],
  );

  const runCommand = useCallback(
    (command: AppCommand | KeyCommand) => {
      if (command.type === 'newFile') {
        create(command.mode ?? mode);
      } else if (command.type === 'goToBar') {
        goToBar(command.jump);
      } else if (command.type === 'zoom') {
        onZoom(command.direction);
      } else if (command.type === 'openNotePanel') {
        onNotePanel(command.panel);
      } else if (command.type === 'shiftPlaybackTempo') {
        shiftPlaybackTempo(command.delta);
      } else if (command.type === 'copy' || command.type === 'cut' || command.type === 'paste') {
        clipboard[command.type]();
      } else if (command.type === 'openFile') {
        openDialog();
      } else if (command.type === 'importPdf') {
        importPdf();
      } else if (command.type === 'saveFile') {
        save(false);
      } else if (command.type === 'exportPdf') {
        exportPdf();
      } else if (command.type === 'togglePlayback') {
        if (isPlaying) {
          stop();
        } else {
          start(cursor?.measureIndex ?? 0);
        }
      } else if (command.type === 'stopPlayback') {
        if (!closeOverlay()) {
          stop();
        }
      } else {
        dispatch(command);
      }
    },
    [create, mode, goToBar, onZoom, onNotePanel, closeOverlay, shiftPlaybackTempo, clipboard, openDialog, importPdf, exportPdf, save, isPlaying, stop, start, cursor?.measureIndex, dispatch],
  );

  const onPressBeat = useCallback(
    (hit: RowHit) => {
      const string = hit.string ?? cursor?.string ?? 1;
      dispatch({ type: 'placeCursor', cursor: { trackIndex, measureIndex: hit.measureIndex, beatIndex: hit.beatIndex, voiceIndex: cursor?.voiceIndex ?? 0, string } });
      focusView(keyboardView.current);
    },
    [trackIndex, cursor?.string, cursor?.voiceIndex, dispatch, keyboardView],
  );

  const onKeyDown = useCallback(
    (event: KeyEvent) => {
      const { key, metaKey, shiftKey, altKey } = event.nativeEvent;
      const command = keyCommand({ key, metaKey, shiftKey, altKey }, lastDigit, Date.now());
      if (command !== undefined) {
        runCommand(command);
      }
    },
    [runCommand],
  );

  const onDrop = useCallback(
    (event: DragEvent) => {
      const uri = event.nativeEvent.dataTransfer?.files[0]?.uri;
      if (uri !== undefined) {
        openPath(uri);
      }
    },
    [openPath],
  );

  return { runCommand, onPressBeat, onKeyDown, onDrop };
}
