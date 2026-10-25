import { useCallback, useEffect, useRef, useState } from 'react';
import { subscribeImportPdfRequests } from '../native/gp-files';
import { type AudioExport, useAudioExport } from './use-audio-export';
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
}

function useImportPanel(): ImportPanel {
  const [isOpen, setIsOpen] = useState(false);
  const open = useCallback(() => setIsOpen(true), []);
  const close = useCallback(() => setIsOpen(false), []);
  return { isOpen, open, close };
}

export function useWindowFiles({ workspace, dispatch, state }: WindowBase, { trackView, playback }: WindowMedia): WindowFiles {
  const { document, trackIndex } = state;
  // A PDF handed over like a song (dropped on the window, `open -a`) is imported; the import hook comes later, as it
  // opens its result.
  const importPdfPath = useRef<(pathOrUrl: string) => void>(() => undefined);
  const openPdf = useCallback((pathOrUrl: string) => importPdfPath.current(pathOrUrl), []);
  const recentFiles = useRecentFiles();
  const documents = useDocument(workspace, dispatch, openPdf, recentFiles);
  const tabs = useTabs(workspace, dispatch, documents.saveTab);
  const importPanel = useImportPanel();
  const pdfImport = usePdfImport(documents.openPath, importPanel.open);
  importPdfPath.current = pdfImport.importPath;
  const { start: startImport } = pdfImport;
  useEffect(() => subscribeImportPdfRequests(startImport), [startImport]);
  const pdfExport = usePdfExport(document, trackIndex, trackView.selectedMode, dispatch, state.chordDisplay, trackView.staves);
  const songExport = useSongExport(document, dispatch);
  const audioExport = useAudioExport(document, playback.practice, dispatch);
  const clipboard = useClipboard(state, dispatch);
  const tabLabels = useTabLabels(workspace);
  return { recentFiles, documents, tabs, tabLabels, importPanel, pdfImport, pdfExport, songExport, audioExport, clipboard };
}
