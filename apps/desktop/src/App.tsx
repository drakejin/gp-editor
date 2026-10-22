import { useEffect, useReducer, useRef } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { findNote } from '@gp-editor/core';
import { DocumentView } from './components/DocumentView';
import { Toolbar } from './components/Toolbar';
import { useDocument } from './hooks/use-document';
import { useEditorCommands } from './hooks/use-editor-commands';
import { usePlayback } from './hooks/use-playback';
import { HANDLED_KEYS } from './lib/key-commands';
import { focusView } from './native/focus-view';
import { INITIAL_EDITOR_STATE, editorReducer } from './state/editor';
import { type Palette, usePalette } from './theme';

export default function App() {
  const palette = usePalette();
  const [state, dispatch] = useReducer(editorReducer, INITIAL_EDITOR_STATE);
  // Keyboard edits arrive at this view; clicking the score does not make it first responder by itself.
  const keyboardView = useRef<View>(null);
  const { document, cursor, trackIndex } = state;
  const playback = usePlayback(document?.song, trackIndex);
  const { openDialog, openPath } = useDocument(state, dispatch);
  const commands = useEditorCommands({ state, dispatch, playback, openDialog, openPath, keyboardView });

  const { stop: stopPlayback } = playback;
  useEffect(() => {
    stopPlayback();
    if (document?.fileName !== undefined) {
      focusView(keyboardView.current);
    }
  }, [document?.fileName, stopPlayback]);

  const errorText = state.error !== undefined ? `Could not open the file: ${state.error}` : playback.error !== undefined ? `Could not play: ${playback.error}` : undefined;
  const dismissError = () => {
    dispatch({ type: 'dismissError' });
    playback.dismissError();
  };
  return (
    <View
      ref={keyboardView}
      style={[styles.root, { backgroundColor: palette.background }]}
      focusable
      enableFocusRing={false}
      keyDownEvents={HANDLED_KEYS}
      onKeyDown={commands.onKeyDown}
      draggedTypes={['fileUrl']}
      onDrop={commands.onDrop}
    >
      <Toolbar
        palette={palette}
        hasDocument={document !== undefined}
        canUndo={state.past.length > 0}
        canRedo={state.future.length > 0}
        isPlaying={playback.isPlaying}
        mode={state.mode}
        cursor={cursor}
        cursorNote={document !== undefined && cursor !== undefined ? findNote(document.song, cursor) : undefined}
        onCommand={commands.runCommand}
      />
      {errorText !== undefined ? <ErrorBanner message={errorText} palette={palette} onDismiss={dismissError} /> : null}
      {document !== undefined ? (
        <DocumentView
          document={document}
          trackIndex={trackIndex}
          mode={state.mode}
          cursor={cursor}
          playing={playback.playing}
          palette={palette}
          onSelectTrack={(index) => dispatch({ type: 'selectTrack', trackIndex: index })}
          onPressBeat={commands.onPressBeat}
        />
      ) : (
        <EmptyState isLoading={state.isLoading} palette={palette} onOpen={openDialog} />
      )}
    </View>
  );
}

function ErrorBanner({ message, palette, onDismiss }: { message: string; palette: Palette; onDismiss: () => void }) {
  return (
    <Pressable onPress={onDismiss} style={[styles.error, { backgroundColor: palette.danger }]}>
      <Text style={styles.errorText}>{message} (click to dismiss)</Text>
    </Pressable>
  );
}

interface EmptyStateProps {
  readonly isLoading: boolean;
  readonly palette: Palette;
  readonly onOpen: () => void;
}

function EmptyState({ isLoading, palette, onOpen }: EmptyStateProps) {
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
  error: { paddingHorizontal: 14, paddingVertical: 8 },
  errorText: { color: '#FFFFFF', fontSize: 12, fontWeight: '600' },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  emptyTitle: { fontSize: 28, fontWeight: '800' },
  emptyText: { fontSize: 13, textAlign: 'center', marginTop: 10, lineHeight: 20 },
  openButton: { marginTop: 22, paddingHorizontal: 18, paddingVertical: 9, borderRadius: 8 },
  openButtonText: { fontSize: 14, fontWeight: '700' },
});
