import { useCallback } from 'react';
import { type PanelCloser, usePanelCloser } from './use-panel-closer';
import type { WindowBase } from './use-window';
import type { WindowFiles } from './use-window-files';
import type { WindowTools } from './use-window-tools';

/** What is over the score, and Esc's way through it. */
export interface WindowOverlays {
  /** Esc answers the save question first (Cancel), then closes a panel, then the chrome's overlays; false: none was open. */
  readonly closeOverlay: () => boolean;
  /** While anything is over the score, typing goes to it (or nowhere), not to the score. */
  readonly isOverlayOpen: boolean;
}

/** The panels over the window that are not the chrome's, the one on top first: closed by Esc after the save question. */
function panelClosers(files: WindowFiles, tools: WindowTools): readonly PanelCloser[] {
  const { importPanel, pdfExport, audioExport, recentFiles } = files;
  const { settingsPanel, tuner, songWriter, lyricsEditor, closeLyricsPanel, scales, transposePanel, scoreDesign, commandPalette, audio, trackManager } = tools;
  return [
    // Settings first: it is over every other panel.
    [settingsPanel.isOpen, settingsPanel.close], [tuner.isOpen, tuner.close], [songWriter.isOpen, songWriter.close], [importPanel.isOpen, importPanel.close],
    [pdfExport.isOpen, pdfExport.close], [audioExport.isOpen, audioExport.close], [recentFiles.isPanelOpen, recentFiles.closePanel], [lyricsEditor.isOpen, closeLyricsPanel],
    [scales.isOpen, scales.close], [transposePanel.isOpen, transposePanel.close], [scoreDesign.isStylesheetOpen, scoreDesign.closeStylesheet],
    [commandPalette.isOpen, commandPalette.close], [audio.lineIn.isOpen, audio.lineIn.close], [trackManager.isOpen, trackManager.close],
  ];
}

export function useWindowOverlays({ chrome, focusScore }: WindowBase, files: WindowFiles, tools: WindowTools): WindowOverlays {
  const closers = panelClosers(files, tools);
  const closePanel = usePanelCloser(closers, focusScore);
  const { cancelClose } = files.tabs;
  const { closeOverlay: closeChromeOverlay } = chrome;
  const closeOverlay = useCallback(() => cancelClose() || closePanel() || closeChromeOverlay(), [cancelClose, closePanel, closeChromeOverlay]);
  const isChromeOverlayOpen =
    chrome.notePanel !== undefined || chrome.isChordPanelOpen || chrome.isShortcutSheetOpen || chrome.menu !== undefined || chrome.pickingTrackIndex !== undefined;
  // The line in's card is beside the score, not over it: typing still goes to the score.
  const isPanelOpen = closers.some(([isOpen, close]) => isOpen && close !== tools.audio.lineIn.close);
  return { closeOverlay, isOverlayOpen: files.tabs.closing !== undefined || isChromeOverlayOpen || isPanelOpen };
}
