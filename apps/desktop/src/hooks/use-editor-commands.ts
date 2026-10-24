import { type Dispatch, type RefObject, useCallback, useMemo, useRef } from 'react';
import type { DragEvent, KeyEvent, View } from 'react-native';
import type { DigitEntry } from '../lib/fret-input';
import { type KeyCommand, type NotePanel, keyCommand } from '../lib/key-commands';
import { focusView } from '../native/focus-view';
import type { ScoreMode } from '../score/geometry';
import type { RowHit } from '../score/hit-test';
import { type AppCommand, type BarJump, jumpTarget } from '../state/app-command';
import { type PracticeAction, playbackStartTempo } from '../state/practice';
import { selectionBars, selectionStart } from '../state/selection';
import type { EditorAction, EditorState } from '../state/editor';
import type { Playback } from './use-playback';

export interface EditorCommands {
  readonly runCommand: (command: AppCommand | KeyCommand) => void;
  /** The mouse went down on a beat: the cursor goes there, or (shift) the selection grows to it. */
  readonly onPressBeat: (hit: RowHit, isExtending: boolean) => void;
  /** A drag reached a beat: the beats from where it began to here are selected. */
  readonly onDragBeat: (hit: RowHit) => void;
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
  /** K: the chord diagram panel for the beat at the cursor. */
  readonly onChordPanel?: () => void;
  /** Y: while the audio track plays, the cursor's bar starts at the moment heard now. */
  readonly onMarkSyncPoint?: () => void;
  /** A popup or menu is over the score: keys do nothing to the score then, except Esc, which closes it. */
  readonly isOverlayOpen?: boolean;
  /** Esc closes an open panel or menu first (true when one was open); with none open it stops playback. */
  readonly closeOverlay: () => boolean;
  /** ⌘C / ⌘X / ⌘V on the score. */
  readonly clipboard: { readonly copy: () => void; readonly cut: () => void; readonly paste: () => void };
  /** The view that receives keyboard events; focused again after clicks on the score. */
  readonly keyboardView: RefObject<View | null>;
}

type PracticeKeyCommand = Extract<KeyCommand, { readonly type: 'shiftPlaybackTempo' | 'shiftPlaybackSpeed' | 'togglePractice' }>;

/** The practice change a key asks for; `writtenTempo` is the tempo of the bar playback starts from (playbackStartTempo). */
function practiceAction(command: PracticeKeyCommand, writtenTempo: number): PracticeAction {
  switch (command.type) {
    case 'shiftPlaybackTempo':
      return { type: 'shiftTempo', delta: command.delta, writtenTempo };
    case 'shiftPlaybackSpeed':
      return { type: 'shiftSpeed', delta: command.delta, writtenTempo };
    case 'togglePractice':
      if (command.practice === 'tempoLock') {
        return { type: 'toggleTempoLock', writtenTempo };
      }
      return { type: command.practice === 'metronome' ? 'toggleMetronome' : 'toggleCountIn' };
  }
}

/** Toolbar buttons, keys, score clicks and file drops, turned into editor actions and playback controls. */
export function useEditorCommands(sources: EditorCommandSources): EditorCommands {
  const { dispatch, playback, create, openDialog, importPdf, exportPdf, openPath, save, onZoom, onNotePanel, onChordPanel, onMarkSyncPoint, closeOverlay, clipboard, keyboardView } = sources;
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
  // ] / [ : the playback tempo of the bar playback starts from, 5 BPM a press; ⌥= / ⌥- its speed, 5% a press; ⌥M ⌥C ⌥L
  // the metronome, count-in and tempo lock (the song is not edited).
  const runPractice = useCallback(
    (command: PracticeKeyCommand) => {
      if (song !== undefined) {
        changePractice(practiceAction(command, playbackStartTempo(song, practice, cursor?.measureIndex ?? 0)));
      }
    },
    [song, practice, changePractice, cursor?.measureIndex],
  );

  const { document, selectionAnchor } = sources.state;
  const playFrom = useMemo(() => selectionStart({ document, cursor, selectionAnchor }), [document, cursor, selectionAnchor]);
  // A selection plays from its first beat (wherever the drag ended) and, while the loop is on, becomes the loop (Guitar
  // Pro 8 loops the selection); with none, playback starts at the cursor's bar.
  const startPlayback = useCallback(() => {
    const bars = selectionBars({ document, cursor, selectionAnchor });
    if (practice.isLooping && bars !== undefined) {
      changePractice({ type: 'setLoop', range: bars, measureCount });
    }
    if (playFrom === undefined) {
      start(cursor?.measureIndex ?? 0);
    } else {
      start(playFrom.measureIndex, playFrom.tick);
    }
  }, [document, cursor, selectionAnchor, practice.isLooping, changePractice, measureCount, playFrom, start]);

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
      } else if (command.type === 'openChordPanel') {
        onChordPanel?.();
      } else if (command.type === 'markSyncPoint') {
        onMarkSyncPoint?.();
      } else if (command.type === 'shiftPlaybackTempo' || command.type === 'shiftPlaybackSpeed' || command.type === 'togglePractice') {
        runPractice(command);
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
          startPlayback();
        }
      } else if (command.type === 'stopPlayback') {
        if (!closeOverlay()) {
          stop();
        }
      } else {
        dispatch(command);
      }
    },
    [create, mode, goToBar, onZoom, onNotePanel, onChordPanel, onMarkSyncPoint, closeOverlay, runPractice, clipboard, openDialog, importPdf, exportPdf, save, isPlaying, stop, startPlayback, dispatch],
  );

  const onPressBeat = useCallback(
    (hit: RowHit, isExtending: boolean) => {
      const string = hit.string ?? cursor?.string ?? 1;
      // A staff of another track (the multitrack view): the cursor goes there and that track is selected.
      const at = { trackIndex: hit.trackIndex ?? trackIndex, measureIndex: hit.measureIndex, beatIndex: hit.beatIndex, voiceIndex: cursor?.voiceIndex ?? 0, string };
      dispatch(isExtending ? { type: 'selectTo', cursor: at } : { type: 'placeCursor', cursor: at });
      focusView(keyboardView.current);
    },
    [trackIndex, cursor?.string, cursor?.voiceIndex, dispatch, keyboardView],
  );
  const onDragBeat = useCallback((hit: RowHit) => onPressBeat(hit, true), [onPressBeat]);

  const isOverlayOpen = sources.isOverlayOpen === true;
  const onKeyDown = useCallback(
    (event: KeyEvent) => {
      const { key, metaKey, shiftKey, altKey } = event.nativeEvent;
      if (isOverlayOpen && key !== 'Escape') {
        return;
      }
      const command = keyCommand({ key, metaKey, shiftKey, altKey }, lastDigit, Date.now());
      if (command !== undefined) {
        runCommand(command);
      }
    },
    [runCommand, isOverlayOpen],
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

  return { runCommand, onPressBeat, onDragBeat, onKeyDown, onDrop };
}
