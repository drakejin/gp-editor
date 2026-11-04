import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { subscribeImportPdfRequests, subscribeRecoverAutosaveRequests } from '../native/gp-files';
import { type AudioExport, useAudioExport } from './use-audio-export';
import { type Autosave, useAutosave } from './use-autosave';
import { type AutosaveRecovery, useAutosaveRecovery } from './use-autosave-recovery';
import { type Clipboard, useClipboard } from './use-clipboard';
import { type DocumentCommands, useDocument } from './use-document';
import { type PdfExport, usePdfExport } from './use-pdf-export';
import { type PdfImport, usePdfImport } from './use-pdf-import';
import { type RecentFiles, useRecentFiles } from './use-recent-files';
import { type SongExport, useSongExport } from './use-song-export';
import type { TabLabel } from '../state/workspace';
import { type Tabs, useTabLabels, useTabs } from './use-tabs';
import type { WindowBase, WindowMedia } from './use-window';

/** The PDF import's settings panel (the key and the model), over the window. */
export interface ImportPanel {
  readonly isOpen: boolean;
  readonly open: () => void;
  readonly close: () => void;
}

/** The window's files: tabs, opening and saving, the recent files, the PDF import and every export, the clipboard. */
export interface WindowFiles {
  /** File ▸ Open Recent, File ▸ Recent Files… and the start screen's list; every file opened or saved joins it. */
  readonly recentFiles: RecentFiles;
  readonly documents: DocumentCommands;
  readonly tabs: Tabs;
  /** The tab strip's labels, the same array while none changes. */
  readonly tabLabels: readonly TabLabel[];
  readonly importPanel: ImportPanel;
  readonly pdfImport: PdfImport;
  /** The Export… panel (File ▸ Export PDF…, ⌘P; File ▸ Export PNG… opens it for PNG images) and File ▸ Print…. */
  readonly pdfExport: PdfExport;
  /** File ▸ Export MIDI…, Export ASCII Tab…, Export MusicXML… and Export Compressed MusicXML…. */
  readonly songExport: SongExport;
  /** File ▸ Export Audio…: the song rendered with its sounds and effects, as playback plays it. */
  readonly audioExport: AudioExport;
  readonly clipboard: Clipboard;
  /** Every 30 s, the edited tabs' snapshots in Application Support (macOS). */
  readonly autosave: Autosave;
  /** The launch's question about work a crash left unsaved, and File ▸ Recover Autosaved Work…. */
  readonly recovery: AutosaveRecovery;
}

function useImportPanel(): ImportPanel {
  const [isOpen, setIsOpen] = useState(false);
  const open = useCallback(() => setIsOpen(true), []);
  const close = useCallback(() => setIsOpen(false), []);
  return useMemo(() => ({ isOpen, open, close }), [isOpen, open, close]);
}

export function useWindowFiles({ workspace, dispatch, state, focusScore }: WindowBase, { trackView, playback }: WindowMedia): WindowFiles {
  const { document, trackIndex } = state;
  // A PDF handed over like a song (dropped on the window, `open -a`) is imported; the import hook comes later, as it
  // opens its result.
  const importPdfPath = useRef<(pathOrUrl: string) => void>(() => undefined);
  const openPdf = useCallback((pathOrUrl: string) => importPdfPath.current(pathOrUrl), []);
  const recentFiles = useRecentFiles();
  const documents = useDocument(workspace, dispatch, openPdf, recentFiles);
  const autosave = useAutosave(workspace, dispatch, playback.isPlaying);
  const recovery = useAutosaveRecovery(dispatch, autosave);
  const { openList: openAutosavedWork } = recovery;
  useEffect(() => subscribeRecoverAutosaveRequests(openAutosavedWork), [openAutosavedWork]);
  // The question at launch comes before anything has the keyboard: the window's root takes it, so Esc reaches the panel.
  const isRecoveryShown = recovery.panel !== undefined;
  useEffect(() => {
    if (isRecoveryShown) {
      focusScore();
    }
  }, [isRecoveryShown, focusScore]);
  // The save question's Save: the tab closes (or the app quits) before its saved state is drawn, so autosave hears it here.
  const { saveTab } = documents;
  const { markSaved } = autosave;
  const saveAndMark = useCallback(
    async (tabId: string, saveAs: boolean) => {
      const isSaved = await saveTab(tabId, saveAs);
      if (isSaved) {
        markSaved(tabId);
      }
      return isSaved;
    },
    [saveTab, markSaved],
  );
  const tabs = useTabs(workspace, dispatch, saveAndMark, autosave.endSession);
  const panel = useImportPanel();
  // A finished or resumed import rewrites its song: the tab already showing it shows the new one (asking if edited).
  // A PDF dropped (or a project resumed) without a key goes on once the key is saved, the settings closing then.
  const pdfImport = usePdfImport(documents.openRebuilt, panel.open, panel.close);
  const { forgetPending } = pdfImport;
  const closeImportPanel = useCallback(() => {
    forgetPending();
    panel.close();
  }, [forgetPending, panel]);
  const importPanel = useMemo(() => ({ ...panel, close: closeImportPanel }), [panel, closeImportPanel]);
  importPdfPath.current = pdfImport.importPath;
  const { start: startImport } = pdfImport;
  useEffect(() => subscribeImportPdfRequests(startImport), [startImport]);
  const pdfExport = usePdfExport(document, trackIndex, trackView.selectedMode, dispatch, state.chordDisplay, trackView.staves);
  const songExport = useSongExport(document, dispatch);
  const audioExport = useAudioExport(document, playback.practice, dispatch);
  const clipboard = useClipboard(state, dispatch);
  const tabLabels = useTabLabels(workspace);
  return { recentFiles, documents, tabs, tabLabels, importPanel, pdfImport, pdfExport, songExport, audioExport, clipboard, autosave, recovery };
}
