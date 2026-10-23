import { NativeEventEmitter, NativeModules } from 'react-native';
import type { FileFormat } from '../lib/file-formats';
import { type ScoreMode, toScoreMode } from '../score/geometry';

/** A file read by the native side; `base64` holds its bytes. */
export interface OpenedFile {
  readonly name: string;
  readonly path: string;
  readonly base64: string;
}

/** Where a file was saved. */
export interface SavedFile {
  readonly name: string;
  readonly path: string;
}

/** The save panel: a "Format" popup when it offers more than one format (choosing one changes the extension). */
export interface SavePanelOptions {
  readonly suggestedName: string;
  readonly formats: readonly FileFormat[];
  /** The format chosen when the panel opens. */
  readonly formatId: string;
}

/** Where to save, and in which of the offered formats; the file is not written yet. */
export interface ChosenFile extends SavedFile {
  readonly formatId: string;
}

interface GPFilesModule {
  showOpenDialog(): Promise<OpenedFile | null>;
  readFile(pathOrUrl: string): Promise<OpenedFile>;
  showSavePanel(options: SavePanelOptions): Promise<ChosenFile | null>;
  writeFile(path: string, base64: string): Promise<SavedFile>;
  writeTextFile(path: string, text: string): Promise<SavedFile>;
  setDocumentTitle(title: string): void;
}

const native = NativeModules.GPFiles as GPFilesModule | undefined;

function requireNative(): GPFilesModule {
  if (native === undefined) {
    throw new Error('GPFiles native module is not available on this platform');
  }
  return native;
}

export function showOpenDialog(): Promise<OpenedFile | null> {
  return requireNative().showOpenDialog();
}

export function readFile(pathOrUrl: string): Promise<OpenedFile> {
  return requireNative().readFile(pathOrUrl);
}

/** Asks where to save (and in which format); null when cancelled. Write the file with writeFile / writeTextFile. */
export function showSavePanel(options: SavePanelOptions): Promise<ChosenFile | null> {
  return requireNative().showSavePanel(options);
}

/** Write (or overwrite) a file the user opened or chose in a save panel in this session. */
export function writeFile(path: string, base64: string): Promise<SavedFile> {
  return requireNative().writeFile(path, base64);
}

/** writeFile for text, saved as UTF-8. */
export function writeTextFile(path: string, text: string): Promise<SavedFile> {
  return requireNative().writeTextFile(path, text);
}

/** Window title; ignored where the native module is missing (tests). */
export function setDocumentTitle(title: string): void {
  native?.setDocumentTitle(title);
}

export interface FileEventHandlers {
  /** File ▸ New Score + Tab (⌘N) / New Score / New Tab. */
  readonly onNewRequested: (mode: ScoreMode) => void;
  /** File ▸ Open… (⌘O) was chosen. */
  readonly onOpenRequested: () => void;
  /** Finder handed the app a file (Open With, dock drop). */
  readonly onFileOpened: (path: string) => void;
  /** File ▸ Save (⌘S) or Save As… (⇧⌘S). */
  readonly onSaveRequested: (saveAs: boolean) => void;
}

/** Subscribe to the native file events; returns the unsubscribe function. */
export function subscribeFileEvents(handlers: FileEventHandlers): () => void {
  if (native === undefined) {
    return () => undefined;
  }
  const emitter = new NativeEventEmitter(NativeModules.GPFiles);
  const subscriptions = [
    emitter.addListener('newRequested', (event: { mode?: unknown }) => handlers.onNewRequested(toScoreMode(event.mode))),
    emitter.addListener('openRequested', handlers.onOpenRequested),
    emitter.addListener('fileOpened', (event: { path: string }) => handlers.onFileOpened(event.path)),
    emitter.addListener('saveRequested', (event: { saveAs: boolean }) => handlers.onSaveRequested(event.saveAs)),
  ];
  return () => subscriptions.forEach((subscription) => subscription.remove());
}

/** File ▸ Import PDF… (⇧⌘I); returns the unsubscribe function. */
export function subscribeImportPdfRequests(onImportPdfRequested: () => void): () => void {
  if (native === undefined) {
    return () => undefined;
  }
  const subscription = new NativeEventEmitter(NativeModules.GPFiles).addListener('importPdfRequested', onImportPdfRequested);
  return () => subscription.remove();
}

/** File ▸ Export PDF… (⌘P), the same as the Export… button; returns the unsubscribe function. */
export function subscribeExportRequests(onExportRequested: () => void): () => void {
  if (native === undefined) {
    return () => undefined;
  }
  const subscription = new NativeEventEmitter(NativeModules.GPFiles).addListener('exportRequested', onExportRequested);
  return () => subscription.remove();
}

/** File ▸ Export PNG…; returns the unsubscribe function. */
export function subscribeExportPngRequests(onExportPngRequested: () => void): () => void {
  if (native === undefined) {
    return () => undefined;
  }
  const subscription = new NativeEventEmitter(NativeModules.GPFiles).addListener('exportPngRequested', onExportPngRequested);
  return () => subscription.remove();
}

export interface SongExportHandlers {
  /** File ▸ Export MIDI…. */
  readonly onExportMidiRequested: () => void;
  /** File ▸ Export ASCII Tab…. */
  readonly onExportAsciiTabRequested: () => void;
}

/** File ▸ Export MIDI… and Export ASCII Tab…; returns the unsubscribe function. */
export function subscribeSongExportRequests(handlers: SongExportHandlers): () => void {
  if (native === undefined) {
    return () => undefined;
  }
  const emitter = new NativeEventEmitter(NativeModules.GPFiles);
  const subscriptions = [
    emitter.addListener('exportMidiRequested', handlers.onExportMidiRequested),
    emitter.addListener('exportAsciiTabRequested', handlers.onExportAsciiTabRequested),
  ];
  return () => subscriptions.forEach((subscription) => subscription.remove());
}

/** File ▸ Print… (⌘P). */
export function subscribePrintRequests(onPrintRequested: () => void): () => void {
  if (native === undefined) {
    return () => undefined;
  }
  const subscription = new NativeEventEmitter(NativeModules.GPFiles).addListener('printRequested', onPrintRequested);
  return () => subscription.remove();
}

/** Edit ▸ AI Wizard ▸ Song Writer…. */
export function subscribeSongWriterRequests(onSongWriterRequested: () => void): () => void {
  if (native === undefined) {
    return () => undefined;
  }
  const subscription = new NativeEventEmitter(NativeModules.GPFiles).addListener('songWriterRequested', onSongWriterRequested);
  return () => subscription.remove();
}

/** Help ▸ Keyboard Shortcuts (⌘H). */
export function subscribeHelpRequests(onHelpRequested: () => void): () => void {
  if (native === undefined) {
    return () => undefined;
  }
  const subscription = new NativeEventEmitter(NativeModules.GPFiles).addListener('helpRequested', onHelpRequested);
  return () => subscription.remove();
}

export interface TabEventHandlers {
  /** File ▸ Close Tab (⌘W). */
  readonly onCloseTabRequested: () => void;
  /** File ▸ Next Tab (⌃Tab). */
  readonly onNextTabRequested: () => void;
  /** File ▸ Previous Tab (⌃⇧Tab). */
  readonly onPreviousTabRequested: () => void;
}

/** File ▸ Close Tab, Next Tab and Previous Tab; returns the unsubscribe function. */
export function subscribeTabRequests(handlers: TabEventHandlers): () => void {
  if (native === undefined) {
    return () => undefined;
  }
  const emitter = new NativeEventEmitter(NativeModules.GPFiles);
  const subscriptions = [
    emitter.addListener('closeTabRequested', handlers.onCloseTabRequested),
    emitter.addListener('nextTabRequested', handlers.onNextTabRequested),
    emitter.addListener('previousTabRequested', handlers.onPreviousTabRequested),
  ];
  return () => subscriptions.forEach((subscription) => subscription.remove());
}
