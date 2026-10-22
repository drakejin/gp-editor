import { NativeEventEmitter, NativeModules } from 'react-native';
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

interface GPFilesModule {
  showOpenDialog(): Promise<OpenedFile | null>;
  readFile(pathOrUrl: string): Promise<OpenedFile>;
  showSaveDialog(base64: string, suggestedName: string): Promise<SavedFile | null>;
  writeFile(path: string, base64: string): Promise<SavedFile>;
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

/** Save panel for a .gp5 file; null when cancelled. */
export function showSaveDialog(base64: string, suggestedName: string): Promise<SavedFile | null> {
  return requireNative().showSaveDialog(base64, suggestedName);
}

/** Overwrite a file the user opened or saved in this session. */
export function writeFile(path: string, base64: string): Promise<SavedFile> {
  return requireNative().writeFile(path, base64);
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

/** File ▸ Print… (⌘P). */
export function subscribePrintRequests(onPrintRequested: () => void): () => void {
  if (native === undefined) {
    return () => undefined;
  }
  const subscription = new NativeEventEmitter(NativeModules.GPFiles).addListener('printRequested', onPrintRequested);
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
