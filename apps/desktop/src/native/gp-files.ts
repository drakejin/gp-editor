import { NativeModules } from 'react-native';
import type { FileFormat } from '../lib/file-formats';
import { type ScoreMode, toScoreMode } from '../score/geometry';
import { subscribeNativeEvents } from './native-events';

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
    // i18n-exempt: a developer's diagnostic naming the native module
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
  // Plain copies: a format's label and note are getters in the shown language, read here once.
  const formats = options.formats.map(({ id, label, extension, note }) => ({ id, label, extension, ...(note === undefined ? {} : { note }) }));
  return requireNative().showSavePanel({ ...options, formats });
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
  return subscribeNativeEvents(native, {
    newRequested: (event: { mode?: unknown }) => handlers.onNewRequested(toScoreMode(event.mode)),
    openRequested: handlers.onOpenRequested,
    fileOpened: (event: { path: string }) => handlers.onFileOpened(event.path),
    saveRequested: (event: { saveAs: boolean }) => handlers.onSaveRequested(event.saveAs),
  });
}

/** A menu command GPFiles forwards as the event `event` (no body): subscribing returns the unsubscribe function. */
function menuRequests(event: string): (listener: () => void) => () => void {
  return (listener) => subscribeNativeEvents(native, { [event]: listener });
}

/** File ▸ Import PDF… (⇧⌘I). */
export const subscribeImportPdfRequests = menuRequests('importPdfRequested');
/** File ▸ Export PDF… (⌘P), the same as the Export… button. */
export const subscribeExportRequests = menuRequests('exportRequested');
/** File ▸ Export PNG…. */
export const subscribeExportPngRequests = menuRequests('exportPngRequested');
/** File ▸ Export Audio…. */
export const subscribeExportAudioRequests = menuRequests('exportAudioRequested');
/** File ▸ Print… (⌘P). */
export const subscribePrintRequests = menuRequests('printRequested');
/** Edit ▸ AI Wizard ▸ Song Writer…. */
export const subscribeSongWriterRequests = menuRequests('songWriterRequested');
/** Tools ▸ Transpose…. */
export const subscribeTransposeRequests = menuRequests('transposeRequested');
/** Edit ▸ Lyrics…. */
export const subscribeLyricsRequests = menuRequests('lyricsRequested');
/** Tools ▸ Scales…. */
export const subscribeScalesRequests = menuRequests('scalesRequested');
/** Help ▸ Keyboard Shortcuts (⌘H). */
export const subscribeHelpRequests = menuRequests('helpRequested');
/** View ▸ Focus / Unfocus (⇧⌘F): only the score and the transport, or the panels back. */
export const subscribeFocusRequests = menuRequests('focusRequested');

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
  return subscribeNativeEvents(native, {
    exportMidiRequested: handlers.onExportMidiRequested,
    exportAsciiTabRequested: handlers.onExportAsciiTabRequested,
    exportMusicXmlRequested: handlers.onExportMusicXmlRequested,
    exportCompressedMusicXmlRequested: handlers.onExportCompressedMusicXmlRequested,
  });
}

/** What the palette opens on: its commands, or Expression Text (the field starts with “>”). */
export type CommandPaletteMode = 'commands' | 'expression';

/** Tools ▸ Command Palette… (⇧⌘P) and Tools ▸ Expression Text… (⌥⌘E): `{ mode }` says which. */
export function subscribeCommandPaletteRequests(onCommandPaletteRequested: (mode: CommandPaletteMode) => void): () => void {
  return subscribeNativeEvents(native, {
    commandPaletteRequested: (body: unknown) => {
      const mode = typeof body === 'object' && body !== null && (body as { readonly mode?: unknown }).mode === 'expression' ? 'expression' : 'commands';
      onCommandPaletteRequested(mode);
    },
  });
}

/** Edit ▸ Undo / Redo of the menu bar (their key equivalents ⌘Z / ⇧⌘Z in the activated app). */
export interface UndoEventHandlers {
  readonly onUndoRequested: () => void;
  readonly onRedoRequested: () => void;
}

/** Edit ▸ Undo and Redo chosen (or their keys pressed); returns the unsubscribe function. */
export function subscribeUndoRequests(handlers: UndoEventHandlers): () => void {
  return subscribeNativeEvents(native, { undoRequested: handlers.onUndoRequested, redoRequested: handlers.onRedoRequested });
}

/** Enables Edit ▸ Undo / Redo of the menu bar when the shown tab has something to undo / redo. */
export function setUndoState(canUndo: boolean, canRedo: boolean): void {
  native?.setUndoState(canUndo, canRedo);
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
  return subscribeNativeEvents(native, {
    multitrackRequested: handlers.onMultitrackRequested,
    previousTrackRequested: handlers.onPreviousTrackRequested,
    nextTrackRequested: handlers.onNextTrackRequested,
  });
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
  return subscribeNativeEvents(native, {
    closeTabRequested: handlers.onCloseTabRequested,
    nextTabRequested: handlers.onNextTabRequested,
    previousTabRequested: handlers.onPreviousTabRequested,
  });
}
