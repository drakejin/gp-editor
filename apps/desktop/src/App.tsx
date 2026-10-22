import { type Dispatch, useCallback, useEffect, useMemo, useReducer, useRef, useState } from 'react';
import { type LayoutChangeEvent, Pressable, StyleSheet, Text, View } from 'react-native';
import { type Song, findNote } from '@gp-editor/core';
import { ChromeMenu } from './components/chrome/ChromeMenu';
import { DocumentLayout } from './components/DocumentLayout';
import { DocumentTab } from './components/DocumentTab';
import { EmptyState } from './components/EmptyState';
import { ExportPanel } from './components/ExportPanel';
import { HintBar } from './components/HintBar';
import { ImportBanner } from './components/ImportBanner';
import { ImportPanel } from './components/ImportPanel';
import { Inspector } from './components/inspector/Inspector';
import { InstrumentPicker } from './components/InstrumentPicker';
import { InstrumentView } from './components/InstrumentView';
import { EditionPalette } from './components/palette/EditionPalette';
import { ProjectList } from './components/ProjectList';
import { ScoreView } from './components/ScoreView';
import { SongHeader } from './components/SongHeader';
import { TOP_BAR_HEIGHT, TopBar } from './components/TopBar';
import { TracksPanel } from './components/TracksPanel';
import { SpeedMenu, ZoomMenu } from './components/TopBarMenus';
import { ShortcutSheet } from './components/ShortcutSheet';
import { useDocument } from './hooks/use-document';
import { useEditorCommands } from './hooks/use-editor-commands';
import { usePlayback } from './hooks/use-playback';
import { usePdfExport } from './hooks/use-pdf-export';
import { usePdfImport } from './hooks/use-pdf-import';
import { useSoundBanks } from './hooks/use-sound-banks';
import { useWindowChrome } from './hooks/use-window-chrome';
import { trackInstrument } from './lib/instruments';
import { HANDLED_KEYS } from './lib/key-commands';
import { lcdInfo } from './lib/lcd';
import { tempoPercent } from './lib/practice-tempo';
import { focusView } from './native/focus-view';
import { subscribeHelpRequests, subscribeImportPdfRequests } from './native/gp-files';
import { type EditorAction, INITIAL_EDITOR_STATE, editorReducer, isEdited } from './state/editor';
import { stepZoom } from './state/panels';
import { playbackStartTempo } from './state/practice';
import type { SongEdit } from './state/song-edits';
import { type Palette, usePalette } from './theme';

/** Until the clipboard hook lands: copy, cut and paste do nothing. */
const NO_CLIPBOARD = { copy: () => undefined, cut: () => undefined, paste: () => undefined };

export default function App() {
  const palette = usePalette();
  const [state, dispatch] = useReducer(editorReducer, INITIAL_EDITOR_STATE);
  // Keyboard edits arrive at this view; clicking the score does not make it first responder by itself.
  const keyboardView = useRef<View>(null);
  const { document, cursor, trackIndex } = state;
  const song = document?.song;
  const playback = usePlayback(song, trackIndex);
  const sound = useSoundBanks(playback.restart);
  const chrome = useWindowChrome();
  const [windowWidth, setWindowWidth] = useState(0);
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
  // Export button and File ▸ Export PDF… (⌘P) open the same panel.
  const pdfExport = usePdfExport(document, trackIndex, state.mode, dispatch);
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
    onZoom: (direction) => chrome.setZoom(stepZoom(chrome.zoom, direction)),
    // B / C open a panel for the note at the cursor; on an empty string there is nothing to set.
    onNotePanel: (panel) => {
      if (song !== undefined && cursor !== undefined && findNote(song, cursor) !== undefined) {
        chrome.openNotePanel(panel);
      }
    },
    clipboard: NO_CLIPBOARD,
    keyboardView,
  });

  // Palette buttons edit at the cursor, then hand the keyboard back to the score (to type the next fret).
  const editAtCursor = useCallback((edit: SongEdit) => {
    dispatch({ type: 'edit', edit });
    focusView(keyboardView.current);
  }, []);
  const actAtCursor = useCallback((action: EditorAction) => {
    dispatch(action);
    focusView(keyboardView.current);
  }, []);

  const cursorString = cursor?.string ?? 1;
  const trackCommands = useMemo(
    () => ({
      onSelectTrack: (index: number) => dispatch({ type: 'selectTrack', trackIndex: index }),
      // A cell of the bar map: that track, the cursor at the bar's first beat.
      onSelectBar: (index: number, measureIndex: number) => {
        dispatch({ type: 'selectTrack', trackIndex: index });
        dispatch({ type: 'placeCursor', cursor: { trackIndex: index, measureIndex, beatIndex: 0, voiceIndex: 0, string: cursorString } });
      },
      onSetTrackMute: (index: number, isMute: boolean) => dispatch({ type: 'setTrackMute', trackIndex: index, isMute }),
      onSetTrackSolo: (index: number, isSolo: boolean) => dispatch({ type: 'setTrackSolo', trackIndex: index, isSolo }),
      onSetTrackVolume: (index: number, volume: number) => dispatch({ type: 'setTrackVolume', trackIndex: index, volume }),
      onSetTrackBalance: (index: number, balance: number) => dispatch({ type: 'setTrackBalance', trackIndex: index, balance }),
    }),
    [cursorString],
  );

  const { openShortcutSheet } = chrome;
  useEffect(() => subscribeHelpRequests(openShortcutSheet), [openShortcutSheet]);

  const { stop: stopPlayback } = playback;
  useEffect(() => {
    stopPlayback();
    if (document?.fileName !== undefined) {
      focusView(keyboardView.current);
    }
  }, [document?.fileName, stopPlayback]);

  const lcd = useMemo(
    () => (song === undefined ? undefined : lcdInfo({ song, trackIndex, cursor, playing: playback.playing, practice: playback.practice, loopPass: playback.loopPass })),
    [song, trackIndex, cursor, playback.playing, playback.practice, playback.loopPass],
  );
  const track = song?.tracks[trackIndex];
  const errorText =
    state.error ??
    (playback.error !== undefined ? `Could not play: ${playback.error}` : sound.error !== undefined ? `Sound bank: ${sound.error}` : undefined);
  const dismissError = () => {
    dispatch({ type: 'dismissError' });
    playback.dismissError();
    sound.dismissError();
  };
  const measureCount = song?.measureHeaders.length ?? 0;
  const loopScope = { measureCount, cursorMeasureIndex: cursor?.measureIndex ?? 0 };
  const writtenTempo = song === undefined ? 0 : playbackStartTempo(song, playback.practice, loopScope.cursorMeasureIndex);

  return (
    <View
      ref={keyboardView}
      style={[styles.root, { backgroundColor: palette.chrome }]}
      focusable
      enableFocusRing={false}
      keyDownEvents={HANDLED_KEYS}
      onKeyDown={commands.onKeyDown}
      draggedTypes={['fileUrl']}
      onDrop={commands.onDrop}
      onLayout={(event: LayoutChangeEvent) => setWindowWidth(event.nativeEvent.layout.width)}
    >
      <TopBar
        palette={palette}
        hasDocument={document !== undefined}
        canUndo={state.past.length > 0}
        canRedo={state.future.length > 0}
        isPlaying={playback.isPlaying}
        isEdited={isEdited(state)}
        isLooping={playback.practice.isLooping}
        zoom={chrome.zoom}
        speedLabel={`${tempoPercent(playback.practice.tempoScale)}%`}
        lcd={lcd}
        trackColor={track === undefined ? undefined : `rgb(${track.color.r},${track.color.g},${track.color.b})`}
        panels={chrome.panels}
        onTogglePanel={chrome.togglePanel}
        onOpenMenu={chrome.openMenu}
        onToggleLoop={() => playback.changePractice({ type: 'toggleLoop', ...loopScope })}
        onShowShortcuts={chrome.openShortcutSheet}
        onCommand={commands.runCommand}
      />
      {document !== undefined ? <DocumentTab palette={palette} title={document.song.info.title} fileName={document.fileName} isEdited={isEdited(state)} /> : null}
      {state.hint !== undefined ? <HintBar palette={palette} message={state.hint} onDismiss={() => dispatch({ type: 'dismissHint' })} /> : null}
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
      <ImportBanner palette={palette} pdfImport={pdfImport} onOpenSettings={openImportPanel} />
      {errorText !== undefined ? <ErrorBanner message={errorText} palette={palette} onDismiss={dismissError} /> : null}
      {document !== undefined ? (
        <DocumentLayout
          left={chrome.panels.palette ? <EditionPalette palette={palette} song={document.song} cursor={cursor} onEdit={editAtCursor} onAction={actAtCursor} /> : null}
          center={
            <ScoreView
              song={document.song}
              trackIndex={trackIndex}
              mode={state.mode}
              cursor={cursor}
              playing={playback.playing}
              palette={palette}
              zoom={chrome.zoom}
              header={<SongHeader song={document.song} trackIndex={trackIndex} fileName={document.fileName} palette={palette} />}
              onPressBeat={commands.onPressBeat}
            />
          }
          right={
            chrome.panels.inspector ? (
              <Inspector
                palette={palette}
                song={document.song}
                trackIndex={trackIndex}
                mode={state.mode}
                notice={state.notice}
                soundBanks={sound.soundBanks}
                onChangeMode={(mode) => dispatch({ type: 'setMode', mode })}
                onSetSongInfo={(info) => dispatch({ type: 'setSongInfo', info })}
                onSetTrackName={(index, name) => dispatch({ type: 'setTrackName', trackIndex: index, name })}
                onSetTrackCapo={(index, capo) => dispatch({ type: 'setTrackCapo', trackIndex: index, capo })}
                onSetTrackTuning={(index, tuning) => dispatch({ type: 'setTrackTuning', trackIndex: index, tuning })}
                onDismissNotice={() => dispatch({ type: 'dismissNotice' })}
                onEditInstrument={chrome.pickInstrument}
                onSelectSoundBank={sound.select}
                onAddSoundBank={sound.add}
                onRemoveSoundBank={sound.remove}
              />
            ) : null
          }
          bottom={
            <>
              {chrome.panels.neck ? <InstrumentView song={document.song} trackIndex={trackIndex} cursor={cursor} playing={playback.playing} palette={palette} /> : null}
              {chrome.panels.tracks ? (
                <TracksPanel
                  song={document.song}
                  selectedTrackIndex={trackIndex}
                  cursorMeasureIndex={cursor?.measureIndex}
                  playingMeasureIndex={playback.playing?.measureIndex}
                  palette={palette}
                  onEditInstrument={chrome.pickInstrument}
                  {...trackCommands}
                />
              ) : null}
            </>
          }
        />
      ) : (
        <EmptyState
          isLoading={state.isLoading}
          palette={palette}
          onCreate={create}
          onOpen={openDialog}
          onImportPdf={startImport}
          projects={<ProjectList projects={pdfImport.projects} palette={palette} onOpenSong={openPath} onResume={pdfImport.resume} onReveal={pdfImport.reveal} />}
        />
      )}
      {chrome.menu !== undefined ? (
        <ChromeMenu palette={palette} x={chrome.menu.x} top={TOP_BAR_HEIGHT} windowWidth={windowWidth} onClose={chrome.closeMenu}>
          {chrome.menu.id === 'zoom' ? <ZoomMenu palette={palette} zoom={chrome.zoom} onZoom={chrome.setZoom} onClose={chrome.closeMenu} /> : null}
          {chrome.menu.id === 'speed' ? (
            <SpeedMenu
              palette={palette}
              practice={playback.practice}
              writtenTempo={writtenTempo}
              measureCount={measureCount}
              cursorMeasureIndex={loopScope.cursorMeasureIndex}
              onChangePractice={playback.changePractice}
              onClose={chrome.closeMenu}
            />
          ) : null}
        </ChromeMenu>
      ) : null}
      {chrome.isShortcutSheetOpen ? <ShortcutSheet palette={palette} onClose={chrome.closeShortcutSheet} /> : null}
      {song !== undefined && chrome.pickingTrackIndex !== undefined ? <PickerOverlay {...{ palette, song, dispatch }} trackIndex={chrome.pickingTrackIndex} onClose={chrome.closePicker} /> : null}
    </View>
  );
}

function PickerOverlay({
  palette,
  song,
  trackIndex,
  dispatch,
  onClose,
}: {
  readonly palette: Palette;
  readonly song: Song;
  readonly trackIndex: number;
  readonly dispatch: Dispatch<EditorAction>;
  readonly onClose: () => void;
}) {
  const instrument = trackInstrument(song, trackIndex);
  if (instrument === undefined || instrument.isPercussion) {
    return null;
  }
  return (
    <InstrumentPicker
      trackName={song.tracks[trackIndex]?.name ?? ''}
      program={instrument.program}
      palette={palette}
      onSetProgram={(program) => dispatch({ type: 'setTrackProgram', trackIndex, program })}
      onClose={onClose}
    />
  );
}

function ErrorBanner({ message, palette, onDismiss }: { readonly message: string; readonly palette: Palette; readonly onDismiss: () => void }) {
  return (
    <Pressable onPress={onDismiss} style={[styles.error, { backgroundColor: palette.danger }]}>
      <Text style={styles.errorText}>{message} (click to dismiss)</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  error: { paddingHorizontal: 14, paddingVertical: 8 },
  errorText: { color: '#FFFFFF', fontSize: 12, fontWeight: '600' },
});
