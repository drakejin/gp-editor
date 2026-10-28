import { type Dispatch, type RefObject, useCallback, useRef } from 'react';
import type { DragEvent, KeyEvent, View } from 'react-native';
import type { DigitEntry } from '../lib/fret-input';
import { type KeyCommand, type NotePanel, keyCommand } from '../lib/key-commands';
import type { ScoreZoom } from '../lib/score-zoom';
import { focusView } from '../native/focus-view';
import type { ScoreMode } from '../score/geometry';
import type { RowHit } from '../score/hit-test';
import { type AppCommand, type BarJump, jumpTarget } from '../state/app-command';
import { type PracticeAction, playbackStartTempo } from '../state/practice';
import { selectionBars, selectionStart } from '../state/selection';
import type { EditorAction, EditorState } from '../state/editor';
import type { Playback } from './use-playback';
import { useStableCallback } from './use-stable-callback';
import { isOfTypes } from '../lib/type-guards';

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
  /** ⌘0: a zoom of its own (100 %). */
  readonly onZoomTo: (zoom: ScoreZoom) => void;
  /** B / C: the vibrato or bend panel for the note at the cursor. */
  readonly onNotePanel: (panel: NotePanel) => void;
  /** K: the chord diagram panel for the beat at the cursor. */
  readonly onChordPanel?: () => void;
  /** J, Edit ▸ Annotation…: the annotation panel for the beat at the cursor. */
  readonly onAnnotationPanel?: () => void;
  /** Edit ▸ Lyrics…, the palette's Lyrics: the lyrics panel. */
  readonly onLyricsPanel?: () => void;
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

/** The transport's bar buttons: the cursor moves to the bar's first beat; playback follows when playing. */
function goToBar(sources: EditorCommandSources, jump: BarJump): void {
  const { state, dispatch, playback } = sources;
  const { cursor, trackIndex } = state;
  const measureIndex = jumpTarget(jump, cursor?.measureIndex ?? 0, state.document?.song.measureHeaders.length ?? 0);
  dispatch({ type: 'placeCursor', cursor: { trackIndex, measureIndex, beatIndex: 0, voiceIndex: cursor?.voiceIndex ?? 0, string: cursor?.string ?? 1 } });
  if (playback.isPlaying) {
    playback.start(measureIndex);
  }
}

/**
 * ] / [ : the playback tempo of the bar playback starts from, 5 BPM a press; ⌥= / ⌥- its speed, 5% a press; ⌥M ⌥C ⌥L
 * the metronome, count-in and tempo lock (the song is not edited).
 */
function runPractice(sources: EditorCommandSources, command: PracticeKeyCommand): void {
  const { state, playback } = sources;
  const song = state.document?.song;
  if (song !== undefined) {
    playback.changePractice(practiceAction(command, playbackStartTempo(song, playback.practice, state.cursor?.measureIndex ?? 0)));
  }
}

/**
 * A selection plays from its first beat (wherever the drag ended) and, while the loop is on, becomes the loop (Guitar
 * Pro 8 loops the selection); with none, playback starts at the cursor's bar.
 */
function startPlayback(sources: EditorCommandSources): void {
  const { state, playback } = sources;
  const { document, cursor, selectionAnchor } = state;
  const bars = selectionBars({ document, cursor, selectionAnchor });
  if (playback.practice.isLooping && bars !== undefined) {
    playback.changePractice({ type: 'setLoop', range: bars, measureCount: document?.song.measureHeaders.length ?? 0 });
  }
  const playFrom = selectionStart({ document, cursor, selectionAnchor });
  if (playFrom === undefined) {
    playback.start(cursor?.measureIndex ?? 0);
  } else {
    playback.start(playFrom.measureIndex, playFrom.tick);
  }
}

/** The commands that are not editor actions: files, panels, the clipboard, practice and playback. */
type WindowCommand = Exclude<AppCommand | KeyCommand, EditorAction>;

const isWindowCommand = isOfTypes<WindowCommand>({
  newFile: true, openFile: true, importPdf: true, saveFile: true, exportPdf: true, togglePlayback: true, stopPlayback: true, goToBar: true,
  shiftPlaybackTempo: true, shiftPlaybackSpeed: true, togglePractice: true, zoom: true, zoomTo: true, openNotePanel: true, openChordPanel: true,
  openAnnotationPanel: true, openLyricsPanel: true, markSyncPoint: true, copy: true, cut: true, paste: true,
});

function runWindowCommand(sources: EditorCommandSources, command: WindowCommand): void {
  switch (command.type) {
    case 'newFile':
      return sources.create(command.mode ?? sources.state.mode);
    case 'goToBar':
      return goToBar(sources, command.jump);
    case 'zoom':
      return sources.onZoom(command.direction);
    case 'zoomTo':
      return sources.onZoomTo(command.zoom);
    case 'openNotePanel':
      return sources.onNotePanel(command.panel);
    case 'openChordPanel':
      return sources.onChordPanel?.();
    case 'openAnnotationPanel':
      return sources.onAnnotationPanel?.();
    case 'openLyricsPanel':
      return sources.onLyricsPanel?.();
    case 'markSyncPoint':
      return sources.onMarkSyncPoint?.();
    case 'shiftPlaybackTempo':
    case 'shiftPlaybackSpeed':
    case 'togglePractice':
      return runPractice(sources, command);
    case 'copy':
    case 'cut':
    case 'paste':
      return sources.clipboard[command.type]();
    default:
      return runFileOrPlaybackCommand(sources, command);
  }
}

function runFileOrPlaybackCommand(sources: EditorCommandSources, command: Extract<WindowCommand, { readonly type: 'openFile' | 'importPdf' | 'saveFile' | 'exportPdf' | 'togglePlayback' | 'stopPlayback' }>): void {
  switch (command.type) {
    case 'openFile':
      return sources.openDialog();
    case 'importPdf':
      return sources.importPdf();
    case 'saveFile':
      return sources.save(false);
    case 'exportPdf':
      return sources.exportPdf();
    case 'togglePlayback':
      return sources.playback.isPlaying ? sources.playback.stop() : startPlayback(sources);
    case 'stopPlayback':
      // Esc closes an open panel or menu first; with none open it stops playback.
      return sources.closeOverlay() ? undefined : sources.playback.stop();
  }
}

/**
 * Toolbar buttons, keys, score clicks and file drops, turned into editor actions and playback controls. The handlers
 * keep their identity from render to render (they read the latest state when called): memoised parts of the window
 * and the menus' native listeners do not follow every cursor move.
 */
export function useEditorCommands(sources: EditorCommandSources): EditorCommands {
  const { dispatch, openPath, keyboardView } = sources;
  const lastDigit = useRef<DigitEntry | undefined>(undefined);
  const runCommand = useStableCallback((command: AppCommand | KeyCommand) => (isWindowCommand(command) ? runWindowCommand(sources, command) : dispatch(command)));
  const onPressBeat = useStableCallback((hit: RowHit, isExtending: boolean) => {
    const { cursor, trackIndex } = sources.state;
    // A staff of another track (the multitrack view): the cursor goes there and that track is selected.
    const at = { trackIndex: hit.trackIndex ?? trackIndex, measureIndex: hit.measureIndex, beatIndex: hit.beatIndex, voiceIndex: cursor?.voiceIndex ?? 0, string: hit.string ?? cursor?.string ?? 1 };
    dispatch(isExtending ? { type: 'selectTo', cursor: at } : { type: 'placeCursor', cursor: at });
    focusView(keyboardView.current);
  });
  const onDragBeat = useCallback((hit: RowHit) => onPressBeat(hit, true), [onPressBeat]);
  const onKeyDown = useStableCallback((event: KeyEvent) => {
    const { key, metaKey, shiftKey, altKey } = event.nativeEvent;
    if (sources.isOverlayOpen === true && key !== 'Escape') {
      return;
    }
    const command = keyCommand({ key, metaKey, shiftKey, altKey }, lastDigit, Date.now());
    if (command !== undefined) {
      runCommand(command);
    }
  });
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
