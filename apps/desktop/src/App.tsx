import { useCallback, useEffect, useReducer, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { findNote } from '@gp-editor/core';
import { DocumentView } from './components/DocumentView';
import { EditBar } from './components/EditBar';
import { EmptyState } from './components/EmptyState';
import { ExportPanel } from './components/ExportPanel';
import { ImportBanner } from './components/ImportBanner';
import { ImportPanel } from './components/ImportPanel';
import { ProjectList } from './components/ProjectList';
import { Toolbar } from './components/Toolbar';
import { TransportBar } from './components/TransportBar';
import { useDocument } from './hooks/use-document';
import { useEditorCommands } from './hooks/use-editor-commands';
import { usePlayback } from './hooks/use-playback';
import { usePdfExport } from './hooks/use-pdf-export';
import { usePdfImport } from './hooks/use-pdf-import';
import { useSoundBanks } from './hooks/use-sound-banks';
import { HANDLED_KEYS } from './lib/key-commands';
import { focusView } from './native/focus-view';
import { subscribeImportPdfRequests } from './native/gp-files';
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
  const sound = useSoundBanks(playback.restart);
  // A PDF handed over like a song (dropped on the window, `open -a`) is imported; the import hook comes later, as it
  // opens its result.
  const importPdfPath = useRef<(pathOrUrl: string) => void>(() => undefined);
  const openPdf = useCallback((pathOrUrl: string) => importPdfPath.current(pathOrUrl), []);
  const { create, openDialog, openPath, save } = useDocument(state, dispatch, openPdf);
  const [isImportPanelOpen, setIsImportPanelOpen] = useState(false);
  const openImportPanel = useCallback(() => setIsImportPanelOpen(true), []);
  const pdfImport = usePdfImport(openPath, openImportPanel);
  importPdfPath.current = pdfImport.importPath;
  const { start: startImport } = pdfImport;
  useEffect(() => subscribeImportPdfRequests(startImport), [startImport]);
  // Export… button and File ▸ Export PDF… (⌘P) open the same panel.
  const pdfExport = usePdfExport(document, trackIndex, dispatch);
  const commands = useEditorCommands({
    state,
    dispatch,
    playback,
    create,
    openDialog,
    importPdf: startImport,
    exportPdf: pdfExport.open,
    openPath,
    save,
    keyboardView,
  });

  // Stable, so the memoized panels beside the score skip the renders a moving cursor or playing beat causes.
  const selectTrack = useCallback(
    (index: number) => dispatch({ type: 'selectTrack', trackIndex: index }),
    [],
  );
  const setTrackTuning = useCallback(
    (index: number, tuning: readonly number[]) =>
      dispatch({ type: 'setTrackTuning', trackIndex: index, tuning }),
    [],
  );
  const setTrackProgram = useCallback(
    (index: number, program: number) =>
      dispatch({ type: 'setTrackProgram', trackIndex: index, program }),
    [],
  );
  const dismissNotice = useCallback(
    () => dispatch({ type: 'dismissNotice' }),
    [],
  );

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
      : sound.error !== undefined
      ? `Sound bank: ${sound.error}`
      : undefined);
  const dismissError = () => {
    dispatch({ type: 'dismissError' });
    playback.dismissError();
    sound.dismissError();
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
          soundBanks={sound.soundBanks}
          onSelectSoundBank={sound.select}
          onAddSoundBank={sound.add}
          onRemoveSoundBank={sound.remove}
        />
      ) : null}
      {isImportPanelOpen ? (
        <ImportPanel
          palette={palette}
          hasKey={pdfImport.hasKey}
          model={pdfImport.model}
          onSaveKey={pdfImport.saveKey}
          onRemoveKey={pdfImport.removeKey}
          onChooseModel={pdfImport.chooseModel}
          onStart={() => {
            setIsImportPanelOpen(false);
            startImport();
          }}
          onClose={() => setIsImportPanelOpen(false)}
        />
      ) : null}
      {pdfExport.isOpen && document !== undefined ? (
        <ExportPanel
          palette={palette}
          song={document.song}
          trackIndex={trackIndex}
          fileName={document.fileName}
          mode={state.mode}
          isSaving={pdfExport.isSaving}
          onSave={pdfExport.save}
          onClose={pdfExport.close}
        />
      ) : null}
      <ImportBanner
        palette={palette}
        pdfImport={pdfImport}
        onOpenSettings={openImportPanel}
      />
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
          onSelectTrack={selectTrack}
          onPressBeat={commands.onPressBeat}
          onSetTrackTuning={setTrackTuning}
          onSetTrackProgram={setTrackProgram}
          onDismissNotice={dismissNotice}
        />
      ) : (
        <EmptyState
          isLoading={state.isLoading}
          palette={palette}
          onCreate={create}
          onOpen={openDialog}
          onImportPdf={startImport}
          projects={
            <ProjectList
              projects={pdfImport.projects}
              palette={palette}
              onOpenSong={openPath}
              onResume={pdfImport.resume}
              onReveal={pdfImport.reveal}
            />
          }
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
