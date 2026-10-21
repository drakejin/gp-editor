import { NativeEventEmitter, NativeModules } from 'react-native';

/** A file read by the native side; `base64` holds its bytes. */
export interface OpenedFile {
  readonly name: string;
  readonly path: string;
  readonly base64: string;
}

interface GPFilesModule {
  showOpenDialog(): Promise<OpenedFile | null>;
  readFile(pathOrUrl: string): Promise<OpenedFile>;
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

/** Window title; ignored where the native module is missing (tests). */
export function setDocumentTitle(title: string): void {
  native?.setDocumentTitle(title);
}

export interface FileEventHandlers {
  /** File ▸ Open… (⌘O) was chosen. */
  readonly onOpenRequested: () => void;
  /** Finder handed the app a file (Open With, dock drop). */
  readonly onFileOpened: (path: string) => void;
}

/** Subscribe to the native file events; returns the unsubscribe function. */
export function subscribeFileEvents(handlers: FileEventHandlers): () => void {
  if (native === undefined) {
    return () => undefined;
  }
  const emitter = new NativeEventEmitter(NativeModules.GPFiles);
  const subscriptions = [
    emitter.addListener('openRequested', handlers.onOpenRequested),
    emitter.addListener('fileOpened', (event: { path: string }) => handlers.onFileOpened(event.path)),
  ];
  return () => subscriptions.forEach((subscription) => subscription.remove());
}
