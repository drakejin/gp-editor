import { type Dispatch, type RefObject, useCallback, useRef } from 'react';
import type { DragEvent, KeyEvent, View } from 'react-native';
import type { ToolbarCommand } from '../components/Toolbar';
import type { DigitEntry } from '../lib/fret-input';
import { type KeyCommand, keyCommand } from '../lib/key-commands';
import { focusView } from '../native/focus-view';
import type { ScoreMode } from '../score/geometry';
import type { RowHit } from '../score/hit-test';
import type { EditorAction, EditorState } from '../state/editor';
import type { Playback } from './use-playback';

export interface EditorCommands {
  readonly runCommand: (command: ToolbarCommand | KeyCommand) => void;
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
  readonly openPath: (pathOrUrl: string) => void;
  readonly save: (saveAs: boolean) => void;
  /** The view that receives keyboard events; focused again after clicks on the score. */
  readonly keyboardView: RefObject<View | null>;
}

/** Toolbar buttons, keys, score clicks and file drops, turned into editor actions and playback controls. */
export function useEditorCommands(sources: EditorCommandSources): EditorCommands {
  const { dispatch, playback, create, openDialog, openPath, save, keyboardView } = sources;
  const { cursor, trackIndex, mode } = sources.state;
  const lastDigit = useRef<DigitEntry | undefined>(undefined);
  const { isPlaying, start, stop } = playback;

  const runCommand = useCallback(
    (command: ToolbarCommand | KeyCommand) => {
      if (command.type === 'newFile') {
        create(mode);
      } else if (command.type === 'openFile') {
        openDialog();
      } else if (command.type === 'saveFile') {
        save(false);
      } else if (command.type === 'togglePlayback') {
        isPlaying ? stop() : start(cursor?.measureIndex ?? 0);
      } else if (command.type === 'stopPlayback') {
        stop();
      } else {
        dispatch(command);
      }
    },
    [create, mode, openDialog, save, isPlaying, stop, start, cursor?.measureIndex, dispatch],
  );

  const onPressBeat = useCallback(
    (hit: RowHit) => {
      const string = hit.string ?? cursor?.string ?? 1;
      dispatch({ type: 'placeCursor', cursor: { trackIndex, measureIndex: hit.measureIndex, beatIndex: hit.beatIndex, voiceIndex: 0, string } });
      focusView(keyboardView.current);
    },
    [trackIndex, cursor?.string, dispatch, keyboardView],
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
