import { runMcpServerCommand } from '../native/mcp-server';
import { stepZoom } from '../state/panels';
import type { CommandActions } from '../lib/command-types';
import type { CursorTools } from './use-cursor-tools';
import { useEditMenu } from './use-edit-menu';
import { type EditorCommands, useEditorCommands } from './use-editor-commands';
import type { WindowBase, WindowMedia, WindowModel } from './use-window';
import type { WindowFiles } from './use-window-files';
import type { WindowOverlays } from './use-window-overlays';
import type { WindowTools } from './use-window-tools';

/** The window's keys, buttons, score clicks and drops (useEditorCommands), with Edit ▸ Undo / Redo / Cut / Copy / Paste of the menu bar. */
export interface WindowCommands {
  readonly editor: EditorCommands;
}

interface WindowCommandSources {
  readonly base: WindowBase;
  readonly media: WindowMedia;
  readonly files: WindowFiles;
  readonly tools: WindowTools;
  readonly overlays: WindowOverlays;
  readonly cursorTools: CursorTools;
}

export function useWindowCommands({ base, media, files, overlays, cursorTools }: WindowCommandSources): WindowCommands {
  const { state, dispatch, chrome, keyboardView } = base;
  const { documents } = files;
  const editor = useEditorCommands({
    state,
    dispatch,
    playback: media.playback,
    create: documents.create,
    openDialog: documents.openDialog,
    importPdf: files.pdfImport.start,
    exportPdf: files.pdfExport.open,
    openPath: documents.openPath,
    save: documents.save,
    onZoom: (direction) => chrome.setZoom(stepZoom(chrome.zoom, direction)),
    onNotePanel: cursorTools.openNotePanel,
    onChordPanel: cursorTools.openChordPanel,
    onMarkSyncPoint: cursorTools.audioLane.markSyncPoint,
    closeOverlay: overlays.closeOverlay,
    isOverlayOpen: overlays.isOverlayOpen,
    clipboard: files.clipboard,
    keyboardView,
  });
  // Edit ▸ Undo / Redo / Cut / Copy / Paste of the menu bar, and ⌘Z ⇧⌘Z ⌘X ⌘C ⌘V in the activated app (the menu's key equivalents).
  useEditMenu(state.past.length > 0, state.future.length > 0, editor.runCommand, overlays.isOverlayOpen);
  return { editor };
}

/** What the command palette's commands call: the handlers of the menus, keys and buttons. */
export function commandActionsOf({ base, media, files, tools, cursorTools, commands, topBar }: WindowModel): CommandActions {
  const { chrome, dispatch, workspace, state } = base;
  const { playback } = media;
  const { pdfExport, songExport } = files;
  return {
    runCommand: commands.editor.runCommand,
    save: files.documents.save,
    exportPng: pdfExport.openPng,
    exportMidi: songExport.exportMidi,
    exportAsciiTab: songExport.exportAsciiTab,
    exportMusicXml: songExport.exportMusicXml,
    exportCompressedMusicXml: songExport.exportCompressedMusicXml,
    exportAudio: files.audioExport.open,
    print: pdfExport.print,
    openStylesheet: tools.scoreDesign.openStylesheet,
    closeTab: () => workspace.activeTabId !== undefined && files.tabs.requestClose(workspace.activeTabId),
    cycleTab: (step) => dispatch({ type: 'cycleTab', step }),
    openRecentFiles: files.recentFiles.openPanel,
    openSongWriter: tools.songWriter.open,
    openShortcuts: chrome.openShortcutSheet,
    openSettings: tools.settingsPanel.open,
    openTranspose: tools.transposePanel.open,
    openTuner: tools.tuner.open,
    openScales: tools.scales.open,
    openLineIn: tools.audio.lineIn.open,
    openExpressionText: tools.openExpressionText,
    openLyrics: tools.openLyrics,
    pickInstrument: () => chrome.pickInstrument(state.trackIndex),
    addAudioTrack: cursorTools.audioLane.addAudioTrack,
    runTrackCommand: tools.trackManager.runTrackCommand,
    togglePanel: chrome.togglePanel,
    toggleLoop: topBar.toggleLoop,
    toggleFocus: chrome.toggleFocus,
    toggleDrumKey: tools.drumKey.toggle,
    togglePreviewOnHover: () => playback.changePractice({ type: 'togglePreviewOnHover' }),
    runMcpServerCommand,
  };
}
