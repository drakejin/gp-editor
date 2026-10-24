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
  setUndoState(canUndo: boolean, canRedo: boolean): void;
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
  /** File ▸ Export MusicXML…. */
  readonly onExportMusicXmlRequested: () => void;
  /** File ▸ Export Compressed MusicXML…. */
  readonly onExportCompressedMusicXmlRequested: () => void;
}

/** File ▸ Export MIDI…, Export ASCII Tab…, Export MusicXML… and Export Compressed MusicXML…; returns the unsubscribe function. */
export function subscribeSongExportRequests(handlers: SongExportHandlers): () => void {
  if (native === undefined) {
    return () => undefined;
  }
  const emitter = new NativeEventEmitter(NativeModules.GPFiles);
  const subscriptions = [
    emitter.addListener('exportMidiRequested', handlers.onExportMidiRequested),
    emitter.addListener('exportAsciiTabRequested', handlers.onExportAsciiTabRequested),
    emitter.addListener('exportMusicXmlRequested', handlers.onExportMusicXmlRequested),
    emitter.addListener('exportCompressedMusicXmlRequested', handlers.onExportCompressedMusicXmlRequested),
  ];
  return () => subscriptions.forEach((subscription) => subscription.remove());
}

/** File ▸ Export Audio…; returns the unsubscribe function. */
export function subscribeExportAudioRequests(onExportAudioRequested: () => void): () => void {
  if (native === undefined) {
    return () => undefined;
  }
  const subscription = new NativeEventEmitter(NativeModules.GPFiles).addListener('exportAudioRequested', onExportAudioRequested);
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

/** Edit ▸ AI Wizard ▸ Song Writer…. */
export function subscribeSongWriterRequests(onSongWriterRequested: () => void): () => void {
  if (native === undefined) {
    return () => undefined;
  }
  const subscription = new NativeEventEmitter(NativeModules.GPFiles).addListener('songWriterRequested', onSongWriterRequested);
  return () => subscription.remove();
}

/** Tools ▸ Transpose…. */
export function subscribeTransposeRequests(onTransposeRequested: () => void): () => void {
  if (native === undefined) {
    return () => undefined;
  }
  const subscription = new NativeEventEmitter(NativeModules.GPFiles).addListener('transposeRequested', onTransposeRequested);
  return () => subscription.remove();
}

/** What the palette opens on: its commands, or Expression Text (the field starts with “>”). */
export type CommandPaletteMode = 'commands' | 'expression';

/** Tools ▸ Command Palette… (⇧⌘P) and Tools ▸ Expression Text… (⌥⌘E): `{ mode }` says which. */
export function subscribeCommandPaletteRequests(onCommandPaletteRequested: (mode: CommandPaletteMode) => void): () => void {
  if (native === undefined) {
    return () => undefined;
  }
  const subscription = new NativeEventEmitter(NativeModules.GPFiles).addListener('commandPaletteRequested', (body: unknown) => {
    const mode = typeof body === 'object' && body !== null && (body as { readonly mode?: unknown }).mode === 'expression' ? 'expression' : 'commands';
    onCommandPaletteRequested(mode);
  });
  return () => subscription.remove();
}

/** Edit ▸ Lyrics…. */
export function subscribeLyricsRequests(onLyricsRequested: () => void): () => void {
  if (native === undefined) {
    return () => undefined;
  }
  const subscription = new NativeEventEmitter(NativeModules.GPFiles).addListener('lyricsRequested', onLyricsRequested);
  return () => subscription.remove();
}

/** Tools ▸ Scales…. */
export function subscribeScalesRequests(onScalesRequested: () => void): () => void {
  if (native === undefined) {
    return () => undefined;
  }
  const subscription = new NativeEventEmitter(NativeModules.GPFiles).addListener('scalesRequested', onScalesRequested);
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

/** Edit ▸ Undo / Redo of the menu bar (their key equivalents ⌘Z / ⇧⌘Z in the activated app). */
export interface UndoEventHandlers {
  readonly onUndoRequested: () => void;
  readonly onRedoRequested: () => void;
}

/** Edit ▸ Undo and Redo chosen (or their keys pressed); returns the unsubscribe function. */
export function subscribeUndoRequests(handlers: UndoEventHandlers): () => void {
  if (native === undefined) {
    return () => undefined;
  }
  const emitter = new NativeEventEmitter(NativeModules.GPFiles);
  const subscriptions = [emitter.addListener('undoRequested', handlers.onUndoRequested), emitter.addListener('redoRequested', handlers.onRedoRequested)];
  return () => subscriptions.forEach((subscription) => subscription.remove());
}

/** Enables Edit ▸ Undo / Redo of the menu bar when the shown tab has something to undo / redo. */
export function setUndoState(canUndo: boolean, canRedo: boolean): void {
  native?.setUndoState(canUndo, canRedo);
}

/** View ▸ Focus / Unfocus (⇧⌘F): only the score and the transport, or the panels back. */
export function subscribeFocusRequests(onFocusRequested: () => void): () => void {
  if (native === undefined) {
    return () => undefined;
  }
  const subscription = new NativeEventEmitter(NativeModules.GPFiles).addListener('focusRequested', onFocusRequested);
  return () => subscription.remove();
}

export interface TrackViewEventHandlers {
  /** View ▸ Multitrack (F3). */
  readonly onMultitrackRequested: () => void;
  /** View ▸ Previous Track / Next Track (⌘↑ / ⌘↓ on the score). */
  readonly onPreviousTrackRequested: () => void;
  readonly onNextTrackRequested: () => void;
}

/** View ▸ Multitrack, Previous Track and Next Track. */
export function subscribeTrackViewRequests(handlers: TrackViewEventHandlers): () => void {
  if (native === undefined) {
    return () => undefined;
  }
  const emitter = new NativeEventEmitter(NativeModules.GPFiles);
  const subscriptions = [
    emitter.addListener('multitrackRequested', handlers.onMultitrackRequested),
    emitter.addListener('previousTrackRequested', handlers.onPreviousTrackRequested),
    emitter.addListener('nextTrackRequested', handlers.onNextTrackRequested),
  ];
  return () => subscriptions.forEach((subscription) => subscription.remove());
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
