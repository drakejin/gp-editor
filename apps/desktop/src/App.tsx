import { type Dispatch, useCallback, useEffect, useMemo, useReducer, useRef, useState } from 'react';
import { type LayoutChangeEvent, Pressable, StyleSheet, Text, View } from 'react-native';
import { type Effect, type MasterMix, type PlayedNote, type Song, findNote } from '@gp-editor/core';
import { ChromeMenu } from './components/chrome/ChromeMenu';
import { CommandPalette } from './components/CommandPalette';
import { DocumentLayout } from './components/DocumentLayout';
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
import { RecentFileList } from './components/RecentFileList';
import { RecentFilesPanel } from './components/RecentFilesPanel';
import { ScoreView } from './components/ScoreView';
import { SongHeader } from './components/SongHeader';
import { TOP_BAR_HEIGHT, TopBar } from './components/TopBar';
import { TracksPanel } from './components/TracksPanel';
import { SpeedMenu, ZoomMenu } from './components/TopBarMenus';
import { ShortcutSheet } from './components/ShortcutSheet';
import { SaveChangesPanel } from './components/SaveChangesPanel';
import { TabStrip } from './components/TabStrip';
import { TransposePanel } from './components/TransposePanel';
import { SongWriterPanel } from './components/song-writer/SongWriterPanel';
import { TunerPanel } from './components/tuner/TunerPanel';
import { LineInPanel } from './components/effects/LineInPanel';
import { MixerPanel } from './components/effects/MixerPanel';
import { NotePanelView } from './components/note-panels/NotePanels';
import { ChordPanel } from './components/chords/ChordPanel';
import { LyricsPanel } from './components/lyrics/LyricsPanel';
import { ScalesPanel } from './components/scales/ScalesPanel';
import { useClipboard } from './hooks/use-clipboard';
import { commandStateOf, useCommandPalette, useTransposePanel } from './hooks/use-command-palette';
import { useDocument } from './hooks/use-document';
import { useEditorCommands } from './hooks/use-editor-commands';
import { useLyricsEditor } from './hooks/use-lyrics-editor';
import { useMidiInput } from './hooks/use-midi-input';
import { useScales } from './hooks/use-scales';
import { usePlayback } from './hooks/use-playback';
import { usePdfExport } from './hooks/use-pdf-export';
import { usePdfImport } from './hooks/use-pdf-import';
import { useRecentFiles } from './hooks/use-recent-files';
import { useSongExport } from './hooks/use-song-export';
import { useSongWriter, writtenSummary } from './hooks/use-song-writer';
import { useSoundBanks } from './hooks/use-sound-banks';
import { useTabs } from './hooks/use-tabs';
import { useTuner } from './hooks/use-tuner';
import { useAudioTools } from './hooks/use-audio-tools';
import { useWindowChrome } from './hooks/use-window-chrome';
import type { CommandActions } from './lib/command-types';
import { COMMANDS } from './lib/commands';
import { trackInstrument } from './lib/instruments';
import { HANDLED_KEYS, type NotePanel } from './lib/key-commands';
import { lcdInfo } from './lib/lcd';
import { tempoPercent } from './lib/practice-tempo';
import { tunerStrings } from './lib/tuner-display';
import { subscribeTunerRequests } from './native/audio-input';
import { focusView } from './native/focus-view';
import { subscribeHelpRequests, subscribeImportPdfRequests, subscribeLyricsRequests, subscribeScalesRequests, subscribeSongWriterRequests } from './native/gp-files';
import { noNoteHint } from './state/edit-hints';
import { type EditorAction, isEdited } from './state/editor';
import { stepZoom } from './state/panels';
import { describeReference } from './song-writer/reference';
import { playbackStartTempo } from './state/practice';
import { selectedFragment, selectionRange, selectionSummary } from './state/selection';
import type { SongEdit } from './state/song-edits';
import { NO_SELECTION_HINT, type TranspositionDraft, toTranspositionOptions, transpositionScope } from './state/transposition';
import { INITIAL_WORKSPACE, activeEditor, tabLabels, workspaceReducer } from './state/workspace';
import { type Palette, onChrome, usePalette } from './theme';

/** How many recent files the start screen lists (above the PDF import projects); the panel lists all of them. */
const START_SCREEN_RECENT_FILES = 5;

export default function App() {
  const palette = usePalette();
  // Panels and banners around the score share Guitar Pro's dark chrome.
  const chromePalette = useMemo(() => onChrome(palette), [palette]);
  // Every open document is a tab; `state` is the shown tab's editor, and editor actions go to it.
  const [workspace, dispatch] = useReducer(workspaceReducer, INITIAL_WORKSPACE);
  const state = activeEditor(workspace);
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
  // File ▸ Open Recent, File ▸ Recent Files… and the start screen's list; every file opened or saved joins it.
  const recentFiles = useRecentFiles();
  const { create, openDialog, openPath, openRecent, save, saveTab } = useDocument(workspace, dispatch, openPdf, recentFiles);
  const tabs = useTabs(workspace, dispatch, saveTab);
  const [isImportPanelOpen, setIsImportPanelOpen] = useState(false);
  const openImportPanel = useCallback(() => setIsImportPanelOpen(true), []);
  const pdfImport = usePdfImport(openPath, openImportPanel);
  importPdfPath.current = pdfImport.importPath;
  const { start: startImport } = pdfImport;
  useEffect(() => subscribeImportPdfRequests(startImport), [startImport]);
  // Export button and File ▸ Export PDF… (⌘P) open the same panel; File ▸ Export PNG… opens it for PNG images.
  const pdfExport = usePdfExport(document, trackIndex, state.mode, dispatch, state.chordDisplay);
  // File ▸ Export MIDI… and Export ASCII Tab….
  const songExport = useSongExport(document, dispatch);
  const clipboard = useClipboard(state, dispatch);
  const { selectionAnchor } = state;
  // The tinted beats; the same object while the cursor and the anchor stay, so rows outside it are not redrawn.
  const selection = useMemo(() => selectionRange({ cursor, selectionAnchor }), [cursor, selectionAnchor]);
  const cursorNote = song === undefined || cursor === undefined ? undefined : findNote(song, cursor);
  const hasCursorNote = cursorNote !== undefined;
  const stringAtCursor = cursor?.string;
  // Edit ▸ AI Wizard ▸ Song Writer…: a written song opens in a new tab, unsaved, with a summary in the hint strip.
  const onSongWritten = useCallback((written: Song, fileName: string, warnings: readonly string[]) => {
    dispatch({ type: 'openTab', document: { fileName, path: '', song: written }, isUnsaved: true });
    dispatch({ type: 'showHint', hint: writtenSummary(written, warnings) });
  }, []);
  const songWriter = useSongWriter(onSongWritten);
  // Tools ▸ Scales… (beside the score, in the inspector's place) and Edit ▸ Lyrics… (above it).
  const scales = useScales();
  const lyricsEditor = useLyricsEditor(song, trackIndex, workspace.activeTabId, dispatch);
  const { isOpen: isScalesOpen, close: closeScales } = scales;
  const { isOpen: isLyricsOpen, close: closeLyrics } = lyricsEditor;
  // The keyboard goes back to the score when the lyrics field goes away.
  const closeLyricsPanel = useCallback(() => {
    closeLyrics();
    focusView(keyboardView.current);
  }, [closeLyrics]);
  const { openNotePanel: showNotePanel, closeOverlay: closeChromeOverlay } = chrome;
  const { cancelClose } = tabs;
  const { isOpen: isSongWriterOpen, close: closeSongWriter } = songWriter;
  const { isOpen: isExportPanelOpen, close: closeExportPanel } = pdfExport;
  const { isPanelOpen: isRecentFilesOpen, closePanel: closeRecentFiles } = recentFiles;
  // Tools ▸ Tuner…: the microphone runs while its panel is open.
  const tuner = useTuner();
  const { isOpen: isTunerOpen, open: openTuner, close: closeTuner } = tuner;
  useEffect(() => subscribeTunerRequests(openTuner), [openTuner]);
  // Tools ▸ Transpose… and Tools ▸ Command Palette… (⇧⌘P); the keyboard goes back to the score when they close.
  const focusScore = useCallback(() => focusView(keyboardView.current), []);
  const transposePanel = useTransposePanel(document !== undefined);
  const commandPalette = useCommandPalette(focusScore);
  const { isOpen: isTransposeOpen, close: closeTranspose } = transposePanel;
  const { isOpen: isCommandPaletteOpen, close: closeCommandPalette } = commandPalette;
  // Effects (View ▸ Mixer, the Track inspector) heard live, and Tools ▸ Line In… (a card beside the score).
  const audio = useAudioTools(song, trackIndex, chrome.togglePanel);
  const { isOpen: isLineInOpen, close: closeLineIn } = audio.lineIn;
  // The panels over the window that are not the chrome's: closed by Esc after the save question.
  const closePanel = useCallback(() => {
    const closers: readonly (readonly [boolean, () => void])[] = [
      [isTunerOpen, closeTuner],
      [isSongWriterOpen, closeSongWriter],
      [isImportPanelOpen, () => setIsImportPanelOpen(false)],
      [isExportPanelOpen, closeExportPanel],
      [isRecentFilesOpen, closeRecentFiles],
      [isLyricsOpen, closeLyricsPanel],
      [isScalesOpen, closeScales],
      [isTransposeOpen, closeTranspose],
      [isCommandPaletteOpen, closeCommandPalette],
      [isLineInOpen, closeLineIn],
    ];
    const open = closers.find(([isOpen]) => isOpen);
    open?.[1]();
    if (open !== undefined) {
      focusScore();
    }
    return open !== undefined;
  }, [isTunerOpen, closeTuner, isSongWriterOpen, closeSongWriter, isImportPanelOpen, isExportPanelOpen, closeExportPanel, isRecentFilesOpen, closeRecentFiles, isLyricsOpen, closeLyricsPanel, isScalesOpen, closeScales, isTransposeOpen, closeTranspose, isCommandPaletteOpen, closeCommandPalette, focusScore, isLineInOpen, closeLineIn]);
  // Esc answers the save question first (Cancel), then closes a panel, then the chrome's overlays.
  const closeOverlay = useCallback(() => cancelClose() || closePanel() || closeChromeOverlay(), [cancelClose, closePanel, closeChromeOverlay]);
  // While anything is over the score, typing goes to it (or nowhere), not to the score.
  const isOverlayOpen =
    tabs.closing !== undefined || isSongWriterOpen || isImportPanelOpen || isExportPanelOpen || isRecentFilesOpen || chrome.notePanel !== undefined || chrome.isChordPanelOpen ||
    chrome.isShortcutSheetOpen || chrome.menu !== undefined || chrome.pickingTrackIndex !== undefined || isTunerOpen || isLyricsOpen || isScalesOpen || isTransposeOpen || isCommandPaletteOpen;
  // B / C and the palette's bend and vibrato open a panel for the note at the cursor; on an empty string a hint says
  // to type a fret first. The keyboard goes back to the score, so Esc closes the panel.
  const openNotePanel = useCallback(
    (panel: NotePanel) => {
      if (hasCursorNote) {
        showNotePanel(panel);
      } else if (stringAtCursor !== undefined) {
        dispatch({ type: 'showHint', hint: noNoteHint(stringAtCursor) });
      }
      focusView(keyboardView.current);
    },
    [hasCursorNote, stringAtCursor, showNotePanel],
  );
  // K and the palette's Chord tool open the chord panel for the cursor's beat; without a cursor there is no beat.
  const hasCursor = cursor !== undefined;
  const { openChordPanel: showChordPanel, closeChordPanel } = chrome;
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
    onNotePanel: openNotePanel,
    onChordPanel: openChordPanel,
    closeOverlay,
    isOverlayOpen,
    clipboard,
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
  // A drum kit click enters that drum at the cursor (or takes it out of the beat).
  const hitDrum = useCallback((key: number) => actAtCursor({ type: 'toggleDrumNote', key }), [actAtCursor]);
  // MIDI step entry: a struck chord becomes the cursor's beat; not while a panel or menu is over the score.
  const enterPlayed = useCallback(
    (notes: readonly PlayedNote[]) => {
      if (!isOverlayOpen) {
        dispatch({ type: 'enterPlayedNotes', notes });
      }
    },
    [isOverlayOpen],
  );
  const midiInput = useMidiInput(enterPlayed);
  // The chord panel closes back to the score; Apply and Remove are one undo step each.
  const leaveChordPanel = useCallback((edit?: SongEdit) => {
    closeChordPanel();
    if (edit !== undefined) {
      dispatch({ type: 'edit', edit });
    }
    focusView(keyboardView.current);
  }, [closeChordPanel]);

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
  const effectCommands = useMemo(
    () => ({
      onSetTrackEffects: (index: number, effects: readonly Effect[]) => dispatch({ type: 'setTrackEffects', trackIndex: index, effects }),
      onSetMasterMix: (master: MasterMix) => dispatch({ type: 'setMasterMix', master }),
    }),
    [],
  );

  const { openShortcutSheet } = chrome;
  useEffect(() => subscribeHelpRequests(openShortcutSheet), [openShortcutSheet]);

  const { open: openSongWriter } = songWriter;
  useEffect(() => subscribeSongWriterRequests(openSongWriter), [openSongWriter]);
  const { open: openScales } = scales;
  useEffect(() => subscribeScalesRequests(openScales), [openScales]);
  // The lyrics editor opens on the shown song, so its `open` changes with every edit: the menu calls the latest.
  const openLyrics = useRef(lyricsEditor.open);
  openLyrics.current = lyricsEditor.open;
  useEffect(() => subscribeLyricsRequests(() => openLyrics.current()), []);
  const reference = useMemo(() => (song === undefined ? undefined : describeReference(song, trackIndex)), [song, trackIndex]);

  // Another tab: playback stops (the player plays the shown song), the chord panel of the last tab's beat closes and
  // the keyboard goes to its score.
  const { stop: stopPlayback } = playback;
  const { closePicker } = chrome;
  const { activeTabId } = workspace;
  useEffect(() => {
    stopPlayback();
    closePicker();
    closeChordPanel();
    if (activeTabId !== undefined) {
      focusView(keyboardView.current);
    }
  }, [activeTabId, stopPlayback, closePicker, closeChordPanel]);

  const lcd = useMemo(
    () => (song === undefined ? undefined : lcdInfo({ song, trackIndex, cursor, playing: playback.playing, practice: playback.practice, loopPass: playback.loopPass })),
    [song, trackIndex, cursor, playback.playing, playback.practice, playback.loopPass],
  );
  const track = song?.tracks[trackIndex];
  // A note panel follows the cursor from note to note; an empty string closes it.
  const { closeNotePanel } = chrome;
  useEffect(() => {
    if (!hasCursorNote) {
      closeNotePanel();
    }
  }, [hasCursorNote, closeNotePanel]);
  const errorText =
    state.error ??
    workspace.error ??
    (playback.error !== undefined ? `Could not play: ${playback.error}` : sound.error !== undefined ? `Sound bank: ${sound.error}` : undefined) ??
    (recentFiles.error !== undefined ? `Recent files: ${recentFiles.error}` : undefined);
  const dismissError = () => {
    dispatch({ type: 'dismissError' });
    playback.dismissError();
    sound.dismissError();
    recentFiles.dismissError();
  };
  const measureCount = song?.measureHeaders.length ?? 0;
  const loopScope = { measureCount, cursorMeasureIndex: cursor?.measureIndex ?? 0 };
  const writtenTempo = song === undefined ? 0 : playbackStartTempo(song, playback.practice, loopScope.cursorMeasureIndex);
  // What the command palette's commands call: the handlers of the menus, keys and buttons.
  const commandActions: CommandActions = {
    runCommand: commands.runCommand,
    save,
    exportPng: pdfExport.openPng,
    exportMidi: songExport.exportMidi,
    exportAsciiTab: songExport.exportAsciiTab,
    exportMusicXml: songExport.exportMusicXml,
    exportCompressedMusicXml: songExport.exportCompressedMusicXml,
    print: pdfExport.print,
    closeTab: () => activeTabId !== undefined && tabs.requestClose(activeTabId),
    cycleTab: (step) => dispatch({ type: 'cycleTab', step }),
    openRecentFiles: recentFiles.openPanel,
    openSongWriter: songWriter.open,
    openShortcuts: chrome.openShortcutSheet,
    openTranspose: transposePanel.open,
    openTuner,
    openScales,
    openLineIn: audio.lineIn.open,
    openLyrics: () => openLyrics.current(),
    pickInstrument: () => chrome.pickInstrument(trackIndex),
    togglePanel: chrome.togglePanel,
    toggleLoop: () => playback.changePractice({ type: 'toggleLoop', ...loopScope }),
  };
  const transposeTo = (draft: TranspositionDraft) => {
    const scope = transpositionScope(state, draft.target);
    dispatch(scope === undefined ? { type: 'showHint', hint: NO_SELECTION_HINT } : { type: 'transpose', scope, options: toTranspositionOptions(draft) });
    closeTranspose();
    focusScore();
  };
  const selectionFragment = isTransposeOpen && selectionAnchor !== undefined ? selectedFragment(state) : undefined;

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
      {workspace.tabs.length > 0 ? <TabStrip palette={palette} tabs={tabLabels(workspace)} activeTabId={activeTabId} onSelect={tabs.switchTo} onClose={tabs.requestClose} /> : null}
      {state.hint !== undefined ? <HintBar palette={palette} message={state.hint} onDismiss={() => dispatch({ type: 'dismissHint' })} /> : null}
      {isImportPanelOpen ? (
        <ImportPanel
          palette={chromePalette}
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
          palette={chromePalette}
          song={document.song}
          trackIndex={trackIndex}
          fileName={document.fileName}
          mode={state.mode}
          chordDisplay={state.chordDisplay}
          format={pdfExport.format}
          isSaving={pdfExport.isSaving}
          onSave={pdfExport.save}
          onSavePng={pdfExport.savePng}
          onClose={pdfExport.close}
        />
      ) : null}
      {isTransposeOpen ? (
        <TransposePanel
          palette={chromePalette}
          trackName={track?.name ?? ''}
          selection={selectionFragment === undefined ? undefined : selectionSummary(state, selectionFragment)}
          onTranspose={transposeTo}
          onClose={() => {
            closeTranspose();
            focusScore();
          }}
        />
      ) : null}
      {isRecentFilesOpen ? (
        <RecentFilesPanel
          palette={chromePalette}
          files={recentFiles.files}
          onOpen={(path) => {
            closeRecentFiles();
            openRecent(path);
          }}
          onTogglePin={recentFiles.togglePin}
          onRemove={recentFiles.remove}
          onClear={recentFiles.clear}
          onClose={closeRecentFiles}
        />
      ) : null}
      {lyricsEditor.draft !== undefined && document !== undefined ? (
        <LyricsPanel
          palette={palette}
          song={document.song}
          draft={lyricsEditor.draft}
          onChooseTrack={lyricsEditor.chooseTrack}
          onChangeFrom={lyricsEditor.changeFrom}
          onChangeText={lyricsEditor.changeText}
          onClose={closeLyricsPanel}
        />
      ) : null}
      <ImportBanner palette={chromePalette} pdfImport={pdfImport} onOpenSettings={openImportPanel} />
      {errorText !== undefined ? <ErrorBanner message={errorText} palette={palette} onDismiss={dismissError} /> : null}
      {document !== undefined ? (
        <DocumentLayout
          left={
            chrome.panels.palette ? (
              <EditionPalette palette={palette} song={document.song} cursor={cursor} onEdit={editAtCursor} onAction={actAtCursor} onOpenPanel={openNotePanel} onOpenChordPanel={openChordPanel} />
            ) : null
          }
          center={
            <ScoreView
              // A page of its own per tab: it opens at the tab's cursor, not where the last tab was scrolled.
              key={activeTabId}
              song={document.song}
              trackIndex={trackIndex}
              mode={state.mode}
              chordDisplay={state.chordDisplay}
              cursor={cursor}
              playing={playback.playing}
              selection={selection}
              palette={palette}
              zoom={chrome.zoom}
              header={<SongHeader song={document.song} trackIndex={trackIndex} fileName={document.fileName} palette={palette} />}
              onPressBeat={commands.onPressBeat}
              onDragBeat={commands.onDragBeat}
            />
          }
          right={
            isScalesOpen ? (
              <ScalesPanel
                palette={palette}
                song={document.song}
                trackIndex={trackIndex}
                selection={selection}
                cursorMeasureIndex={cursor?.measureIndex ?? 0}
                choice={scales.choice}
                onChoose={scales.choose}
                onClear={scales.clear}
                onClose={closeScales}
              />
            ) : chrome.panels.inspector ? (
              <Inspector
                palette={palette}
                song={document.song}
                trackIndex={trackIndex}
                mode={state.mode}
                notice={state.notice}
                soundBanks={sound.soundBanks}
                onChangeMode={(mode) => dispatch({ type: 'setMode', mode })}
                chordDisplay={state.chordDisplay}
                onChangeChordDisplay={(display) => dispatch({ type: 'setChordDisplay', display })}
                onSetSongInfo={(info) => dispatch({ type: 'setSongInfo', info })}
                onSetTrackName={(index, name) => dispatch({ type: 'setTrackName', trackIndex: index, name })}
                onSetTrackCapo={(index, capo) => dispatch({ type: 'setTrackCapo', trackIndex: index, capo })}
                onSetTrackSlashNotation={(index, hasSlashNotation) => dispatch({ type: 'setTrackSlashNotation', trackIndex: index, hasSlashNotation })}
                onSetTrackTuning={(index, tuning) => dispatch({ type: 'setTrackTuning', trackIndex: index, tuning })}
                onDismissNotice={() => dispatch({ type: 'dismissNotice' })}
                onEditInstrument={chrome.pickInstrument}
                onSelectSoundBank={sound.select}
                onAddSoundBank={sound.add}
                onRemoveSoundBank={sound.remove}
                onSetTrackEffects={effectCommands.onSetTrackEffects}
                onPreviewMix={audio.previewMix}
                midiInput={midiInput}
              />
            ) : null
          }
          bottom={
            <>
              <InstrumentView
                song={document.song}
                trackIndex={trackIndex}
                cursor={cursor}
                playing={playback.playing}
                palette={palette}
                showsKeyboard={chrome.panels.keyboard}
                showsFretboard={chrome.panels.neck}
                scale={scales.highlight}
                onDrumHit={hitDrum}
              />
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
              {chrome.panels.mixer ? (
                <MixerPanel
                  palette={palette}
                  song={document.song}
                  selectedTrackIndex={trackIndex}
                  onSelectTrack={trackCommands.onSelectTrack}
                  {...effectCommands}
                  onPreview={audio.previewMix}
                  onClose={() => chrome.togglePanel('mixer')}
                />
              ) : null}
            </>
          }
        />
      ) : (
        <EmptyState
          isLoading={workspace.isLoading}
          palette={palette}
          onCreate={create}
          onOpen={openDialog}
          onImportPdf={startImport}
          recentFiles={
            recentFiles.files.length === 0 ? undefined : (
              <RecentFileList
                files={recentFiles.files}
                palette={palette}
                heading="RECENT FILES"
                limit={START_SCREEN_RECENT_FILES}
                onOpen={openRecent}
                onTogglePin={recentFiles.togglePin}
                onRemove={recentFiles.remove}
                onShowAll={recentFiles.openPanel}
              />
            )
          }
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
      {isCommandPaletteOpen ? (
        <CommandPalette
          palette={palette}
          commands={COMMANDS}
          state={commandStateOf(workspace)}
          recentIds={commandPalette.recentIds}
          onRun={(command) => commandPalette.run(command, commandActions)}
          onClose={() => {
            closeCommandPalette();
            focusScore();
          }}
        />
      ) : null}
      {songWriter.isOpen ? (
        <SongWriterPanel
          palette={chromePalette}
          draft={songWriter.draft}
          onChangeDraft={songWriter.changeDraft}
          status={songWriter.status}
          reference={reference === undefined || document === undefined ? undefined : `${document.fileName} · ${track?.name ?? ''}`}
          hasKey={pdfImport.hasKey}
          model={pdfImport.model}
          onSaveKey={pdfImport.saveKey}
          onChooseModel={pdfImport.chooseModel}
          onWrite={() => songWriter.write(pdfImport.model, reference)}
          onCancel={songWriter.cancel}
          onClose={songWriter.close}
        />
      ) : null}
      {audio.lineIn.isOpen && song !== undefined ? (
        <LineInPanel palette={palette} lineIn={audio.lineIn} trackLabel={`${audio.lineIn.trackIndex + 1}. ${song.tracks[audio.lineIn.trackIndex]?.name ?? ''}`} />
      ) : null}
      {isTunerOpen ? (
        <TunerPanel
          palette={palette}
          referenceA4={tuner.referenceA4}
          strings={tunerStrings(track)}
          onShiftReferenceA4={tuner.shiftReferenceA4}
          onClose={closeTuner}
        />
      ) : null}
      {chrome.isChordPanelOpen && song !== undefined && cursor !== undefined ? (
        <ChordPanel
          palette={palette}
          song={song}
          cursor={cursor}
          onApply={(chord, withNotes) => leaveChordPanel({ type: 'setBeatChord', chord, withNotes })}
          onRemove={() => leaveChordPanel({ type: 'setBeatChord', chord: undefined })}
          onClose={() => leaveChordPanel()}
        />
      ) : null}
      {chrome.notePanel !== undefined && cursorNote !== undefined ? (
        <NotePanelView palette={palette} panel={chrome.notePanel} note={cursorNote} onEdit={editAtCursor} onClose={chrome.closeNotePanel} />
      ) : null}
      {song !== undefined && chrome.pickingTrackIndex !== undefined ? <PickerOverlay {...{ palette, song, dispatch }} trackIndex={chrome.pickingTrackIndex} onClose={chrome.closePicker} /> : null}
      {tabs.closing !== undefined ? (
        <SaveChangesPanel palette={palette} name={tabs.closing.name} onSave={tabs.saveAndClose} onDiscard={tabs.discardAndClose} onCancel={tabs.cancelClose} />
      ) : null}
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
      palette={onChrome(palette)}
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
