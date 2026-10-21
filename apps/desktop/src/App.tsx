import { useCallback, useEffect, useReducer, useRef } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import type { DragEvent, HandledKeyEvent, KeyEvent } from 'react-native';
import { type NoteAddress, findNote, readSong } from '@gp-editor/core';
import { SongHeader } from './components/SongHeader';
import { TabScore } from './components/TabScore';
import { type ToolbarCommand, Toolbar } from './components/Toolbar';
import { TrackList } from './components/TrackList';
import { base64ToBytes } from './lib/base64';
import { type DigitEntry, nextFretEntry } from './lib/fretInput';
import { adjacentNote } from './lib/navigation';
import { focusView } from './native/focusView';
import { type OpenedFile, readFile, setDocumentTitle, showOpenDialog, subscribeFileEvents } from './native/gpFiles';
import { type EditorAction, INITIAL_EDITOR_STATE, editorReducer } from './state/editor';
import { usePalette } from './theme';

const DIGITS = ['0', '1', '2', '3', '4', '5', '6', '7', '8', '9'];

const HANDLED_KEYS: HandledKeyEvent[] = [
  ...DIGITS.map((key) => ({ key })),
  { key: 'Backspace' },
  { key: 'Delete' },
  { key: 'ArrowUp' },
  { key: 'ArrowDown' },
  { key: 'ArrowLeft' },
  { key: 'ArrowRight' },
  { key: '-' },
  { key: '=' },
  { key: 'Escape' },
  { key: 'z', metaKey: true },
  { key: 'z', metaKey: true, shiftKey: true },
];

const TOOLBAR_ACTIONS: Readonly<Record<Exclude<ToolbarCommand, 'open'>, EditorAction>> = {
  undo: { type: 'undo' },
  redo: { type: 'redo' },
  fretDown: { type: 'shiftFret', delta: -1 },
  fretUp: { type: 'shiftFret', delta: 1 },
  stringUp: { type: 'shiftString', delta: -1 },
  stringDown: { type: 'shiftString', delta: 1 },
  delete: { type: 'deleteNote' },
};

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'Unexpected error while opening the file';
}

export default function App() {
  const palette = usePalette();
  const [state, dispatch] = useReducer(editorReducer, INITIAL_EDITOR_STATE);
  const lastDigit = useRef<DigitEntry | undefined>(undefined);
  // Keyboard edits arrive at this view; clicking a fret number does not make it first responder by itself.
  const rootRef = useRef<View>(null);
  const song = state.document?.song;

  const open = useCallback(async (load: () => Promise<OpenedFile | null>) => {
    dispatch({ type: 'loadStarted' });
    try {
      const file = await load();
      if (file === null) {
        dispatch({ type: 'loadCancelled' });
        return;
      }
      const parsed = readSong(base64ToBytes(file.base64));
      dispatch({ type: 'loaded', document: { fileName: file.name, path: file.path, song: parsed } });
    } catch (error: unknown) {
      dispatch({ type: 'loadFailed', message: errorMessage(error) });
    }
  }, []);

  const openDialog = useCallback(() => open(showOpenDialog), [open]);

  useEffect(
    () =>
      subscribeFileEvents({
        onOpenRequested: () => void openDialog(),
        onFileOpened: (path) => void open(() => readFile(path)),
      }),
    [open, openDialog],
  );

  const fileName = state.document?.fileName;
  const isEdited = state.past.length > 0;
  useEffect(() => {
    setDocumentTitle(fileName === undefined ? 'GP Editor' : `${fileName}${isEdited ? ' — Edited' : ''}`);
  }, [fileName, isEdited]);

  useEffect(() => {
    if (fileName !== undefined) {
      focusView(rootRef.current);
    }
  }, [fileName]);

  const onSelectNote = useCallback((address: NoteAddress) => {
    dispatch({ type: 'selectNote', address });
    focusView(rootRef.current);
  }, []);

  const onCommand = useCallback(
    (command: ToolbarCommand) => (command === 'open' ? void openDialog() : dispatch(TOOLBAR_ACTIONS[command])),
    [openDialog],
  );

  const onKeyDown = useCallback(
    (event: KeyEvent) => {
      const { key, metaKey, shiftKey } = event.nativeEvent;
      const action = keyAction(key, metaKey, shiftKey, lastDigit);
      if (action === 'previous' || action === 'next') {
        const address = song === undefined ? undefined : adjacentNote(song, state.trackIndex, state.selection, action === 'next' ? 1 : -1);
        dispatch({ type: 'selectNote', address });
      } else if (action !== undefined) {
        dispatch(action);
      }
    },
    [song, state.trackIndex, state.selection],
  );

  const onDrop = useCallback(
    (event: DragEvent) => {
      const uri = event.nativeEvent.dataTransfer?.files[0]?.uri;
      if (uri !== undefined) {
        void open(() => readFile(uri));
      }
    },
    [open],
  );

  const selectedNote = song !== undefined && state.selection !== undefined ? findNote(song, state.selection) : undefined;

  return (
    <View
      ref={rootRef}
      style={[styles.root, { backgroundColor: palette.background }]}
      focusable
      enableFocusRing={false}
      keyDownEvents={HANDLED_KEYS}
      onKeyDown={onKeyDown}
      draggedTypes={['fileUrl']}
      onDrop={onDrop}
    >
      <Toolbar
        palette={palette}
        hasDocument={state.document !== undefined}
        canUndo={state.past.length > 0}
        canRedo={state.future.length > 0}
        selection={state.selection}
        selectedNote={selectedNote}
        onCommand={onCommand}
      />
      {state.error !== undefined ? (
        <Pressable onPress={() => dispatch({ type: 'dismissError' })} style={[styles.error, { backgroundColor: palette.danger }]}>
          <Text style={styles.errorText}>Could not open the file: {state.error} (click to dismiss)</Text>
        </Pressable>
      ) : null}
      {state.document !== undefined && song !== undefined ? (
        <View style={styles.body}>
          <TrackList
            tracks={song.tracks}
            selectedIndex={state.trackIndex}
            palette={palette}
            onSelect={(index) => dispatch({ type: 'selectTrack', index })}
          />
          <View style={styles.main}>
            <SongHeader song={song} fileName={state.document.fileName} palette={palette} />
            <TabScore
              song={song}
              trackIndex={state.trackIndex}
              selection={state.selection}
              palette={palette}
              onSelectNote={onSelectNote}
            />
          </View>
        </View>
      ) : (
        <EmptyState isLoading={state.isLoading} onOpen={openDialog} />
      )}
    </View>
  );
}

type KeyResult = EditorAction | 'previous' | 'next' | undefined;

function keyAction(key: string, metaKey: boolean, shiftKey: boolean, lastDigit: { current: DigitEntry | undefined }): KeyResult {
  if (metaKey && key.toLowerCase() === 'z') {
    return shiftKey ? { type: 'redo' } : { type: 'undo' };
  }
  if (DIGITS.includes(key)) {
    const entry = nextFretEntry(lastDigit.current, Number(key), Date.now());
    lastDigit.current = entry;
    return { type: 'setFret', fret: entry.value };
  }
  const simple: Readonly<Record<string, KeyResult>> = {
    Backspace: { type: 'deleteNote' },
    Delete: { type: 'deleteNote' },
    ArrowUp: { type: 'shiftString', delta: -1 },
    ArrowDown: { type: 'shiftString', delta: 1 },
    ArrowLeft: 'previous',
    ArrowRight: 'next',
    '-': { type: 'shiftFret', delta: -1 },
    '=': { type: 'shiftFret', delta: 1 },
    Escape: { type: 'selectNote', address: undefined },
  };
  return simple[key];
}

function EmptyState({ isLoading, onOpen }: { isLoading: boolean; onOpen: () => void }) {
  const palette = usePalette();
  return (
    <View style={styles.empty}>
      {isLoading ? (
        <ActivityIndicator />
      ) : (
        <>
          <Text style={[styles.emptyTitle, { color: palette.text }]}>GP Editor</Text>
          <Text style={[styles.emptyText, { color: palette.muted }]}>
            Open a Guitar Pro file — .gp (7/8), .gpx (6), .gp5, .gp4, .gp3, .gtp (1/2){'\n'}or drop one onto this window.
          </Text>
          <Pressable onPress={onOpen} style={[styles.openButton, { backgroundColor: palette.accent }]}>
            <Text style={[styles.openButtonText, { color: palette.accentText }]}>Open File… (⌘O)</Text>
          </Pressable>
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  body: { flex: 1, flexDirection: 'row' },
  main: { flex: 1 },
  error: { paddingHorizontal: 14, paddingVertical: 8 },
  errorText: { color: '#FFFFFF', fontSize: 12, fontWeight: '600' },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  emptyTitle: { fontSize: 28, fontWeight: '800' },
  emptyText: { fontSize: 13, textAlign: 'center', marginTop: 10, lineHeight: 20 },
  openButton: { marginTop: 22, paddingHorizontal: 18, paddingVertical: 9, borderRadius: 8 },
  openButtonText: { fontSize: 14, fontWeight: '700' },
});
