import { useEffect, useReducer, useRef } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { findNote } from '@gp-editor/core';
import { DocumentView } from './components/DocumentView';
import { EditBar } from './components/EditBar';
import { EmptyState } from './components/EmptyState';
import { Toolbar } from './components/Toolbar';
import { TransportBar } from './components/TransportBar';
import { useDocument } from './hooks/use-document';
import { useEditorCommands } from './hooks/use-editor-commands';
import { usePlayback } from './hooks/use-playback';
import { HANDLED_KEYS } from './lib/key-commands';
import { focusView } from './native/focus-view';
import { INITIAL_EDITOR_STATE, editorReducer, isEdited } from './state/editor';
import { cursorVoice } from './state/song-edits';
import { type Palette, usePalette } from './theme';

export default function App() {
  const palette = usePalette();
  const [state, dispatch] = useReducer(editorReducer, INITIAL_EDITOR_STATE);
  // Keyboard edits arrive at this view; clicking the score does not make it first responder by itself.
  const keyboardView = useRef<View>(null);
  const { document, cursor, trackIndex } = state;
  const playback = usePlayback(document?.song, trackIndex);
  const { create, openDialog, openPath, save } = useDocument(state, dispatch);
  const commands = useEditorCommands({
    state,
    dispatch,
    playback,
    create,
    openDialog,
    openPath,
    save,
    keyboardView,
  });

  const { stop: stopPlayback } = playback;
  useEffect(() => {
    stopPlayback();
    if (document?.fileName !== undefined) {
      focusView(keyboardView.current);
    }
  }, [document?.fileName, stopPlayback]);

  const errorText =
    state.error ??
    (playback.error !== undefined
      ? `Could not play: ${playback.error}`
      : undefined);
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
        isEdited={isEdited(state)}
        mode={state.mode}
        cursor={cursor}
        cursorNote={
          document !== undefined && cursor !== undefined
            ? findNote(document.song, cursor)
            : undefined
        }
        onCommand={commands.runCommand}
      />
      {document !== undefined ? (
        <EditBar
          palette={palette}
          voice={
            cursor === undefined
              ? undefined
              : cursorVoice(document.song, cursor)
          }
          note={
            cursor === undefined ? undefined : findNote(document.song, cursor)
          }
          header={
            cursor === undefined
              ? undefined
              : document.song.measureHeaders[cursor.measureIndex]
          }
          keySignature={
            cursor === undefined
              ? 0
              : document.song.tracks[cursor.trackIndex]?.measures[
                  cursor.measureIndex
                ]?.keySignature ?? 0
          }
          onEdit={edit => dispatch({ type: 'edit', edit })}
        />
      ) : null}
      {document !== undefined ? (
        <TransportBar
          palette={palette}
          song={document.song}
          cursorMeasureIndex={cursor?.measureIndex}
          practice={playback.practice}
          loopPass={playback.loopPass}
          onChangePractice={playback.changePractice}
        />
      ) : null}
      {errorText !== undefined ? (
        <ErrorBanner
          message={errorText}
          palette={palette}
          onDismiss={dismissError}
        />
      ) : null}
      {document !== undefined ? (
        <DocumentView
          document={document}
          trackIndex={trackIndex}
          mode={state.mode}
          cursor={cursor}
          playing={playback.playing}
          notice={state.notice}
          palette={palette}
          onSelectTrack={index =>
            dispatch({ type: 'selectTrack', trackIndex: index })
          }
          onPressBeat={commands.onPressBeat}
          onSetTrackTuning={(index, tuning) =>
            dispatch({ type: 'setTrackTuning', trackIndex: index, tuning })
          }
          onDismissNotice={() => dispatch({ type: 'dismissNotice' })}
        />
      ) : (
        <EmptyState
          isLoading={state.isLoading}
          palette={palette}
          onCreate={create}
          onOpen={openDialog}
        />
      )}
    </View>
  );
}

function ErrorBanner({
  message,
  palette,
  onDismiss,
}: {
  message: string;
  palette: Palette;
  onDismiss: () => void;
}) {
  return (
    <Pressable
      onPress={onDismiss}
      style={[styles.error, { backgroundColor: palette.danger }]}
    >
      <Text style={styles.errorText}>{message} (click to dismiss)</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  error: { paddingHorizontal: 14, paddingVertical: 8 },
  errorText: { color: '#FFFFFF', fontSize: 12, fontWeight: '600' },
});
