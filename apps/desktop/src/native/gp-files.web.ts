// Windows (Tauri) twin of gp-files.ts: the same API, on the dialog plugin and the Rust file commands
// (src-tauri/src/commands/files.rs); the menu and keyboard events come through web/app-events.ts.
import { getCurrentWindow } from '@tauri-apps/api/window';
import { base64ToBytes, bytesToBase64 } from '../lib/base64';
import type { FileFormat } from '../lib/file-formats';
import { t } from '../lib/i18n/i18n';
import { type ScoreMode, toScoreMode } from '../score/geometry';
import { subscribeNativeEvents } from './native-events';
import { setMenuItemsEnabled } from './web/app-menu';
import { extensionOf, pathFromUrl, pickFile, pickSavePath, readPath, writePath } from './web/files';
import { isTauri } from './web/tauri';

/** The window menu's events have no native module behind them (native-events.web.ts ignores the module). */
const WINDOW_MENU = undefined;

export interface OpenedFile {
  readonly name: string;
  readonly path: string;
  readonly base64: string;
}

export interface SavedFile {
  readonly name: string;
  readonly path: string;
}

export interface SavePanelOptions {
  readonly suggestedName: string;
  readonly formats: readonly FileFormat[];
  readonly formatId: string;
}

export interface ChosenFile extends SavedFile {
  readonly formatId: string;
}

/** What File ▸ Open… offers: the formats gp-core reads (GPFiles.m's open panel), in the language shown. */
function openFilters() {
  return [
    { name: t('window.windows.openFilter'), extensions: ['gp', 'gpx', 'gp5', 'gp4', 'gp3', 'gtp', 'ptb', 'tef', 'mid', 'midi', 'musicxml', 'mxl', 'xml'] },
    { name: t('window.windows.allFiles'), extensions: ['*'] },
  ];
}

function opened(file: { name: string; path: string; bytes: Uint8Array }): OpenedFile {
  return { name: file.name, path: file.path, base64: bytesToBase64(file.bytes) };
}

export async function showOpenDialog(): Promise<OpenedFile | null> {
  const file = await pickFile(openFilters(), t('window.windows.openTitle'));
  return file === null ? null : opened(file);
}

export async function readFile(pathOrUrl: string): Promise<OpenedFile> {
  return opened(await readPath(pathFromUrl(pathOrUrl)));
}

/** The chosen format first (Windows preselects the first filter); the file's extension then names the format. */
export async function showSavePanel(options: SavePanelOptions): Promise<ChosenFile | null> {
  const chosen = options.formats.find((format) => format.id === options.formatId) ?? options.formats[0];
  if (chosen === undefined) {
    throw new Error(t('window.windows.noSaveFormat'));
  }
  const ordered = [chosen, ...options.formats.filter((format) => format !== chosen)];
  const path = await pickSavePath(options.suggestedName, ordered.map((format) => ({ name: format.label, extensions: [format.extension] })), t('window.windows.saveAsTitle'));
  if (path === null) {
    return null;
  }
  const format = options.formats.find((each) => each.extension === extensionOf(path));
  const fullPath = format === undefined ? `${path}.${chosen.extension}` : path;
  const saved = { name: fullPath.slice(Math.max(fullPath.lastIndexOf('\\'), fullPath.lastIndexOf('/')) + 1), path: fullPath };
  return { ...saved, formatId: (format ?? chosen).id };
}

export function writeFile(path: string, base64: string): Promise<SavedFile> {
  return writePath(path, base64ToBytes(base64));
}

export function writeTextFile(path: string, text: string): Promise<SavedFile> {
  return writePath(path, new TextEncoder().encode(text), 'text/plain;charset=utf-8');
}

const APP_NAME = 'GP Editor'; // i18n-exempt: the app's name

/** The window's title bar (and the taskbar): "Song.gp5 — Edited". */
export function setDocumentTitle(title: string): void {
  // Windows title bars name the document, then the app.
  // i18n-exempt: the app's name
  const text = title === '' || title === APP_NAME ? APP_NAME : `${title} — ${APP_NAME}`;
  document.title = text;
  if (isTauri()) {
    getCurrentWindow().setTitle(text).catch(() => undefined);
  }
}

export interface FileEventHandlers {
  readonly onNewRequested: (mode: ScoreMode) => void;
  readonly onOpenRequested: () => void;
  readonly onFileOpened: (path: string) => void;
  readonly onSaveRequested: (saveAs: boolean) => void;
}

function pathOf(body: unknown): string | undefined {
  const path = typeof body === 'object' && body !== null ? (body as { path?: unknown }).path : undefined;
  return typeof path === 'string' ? path : undefined;
}

/** The window menu's, the shortcuts' and dropped files' events (native-events.web.ts: app-events.ts). */
export function subscribeFileEvents(handlers: FileEventHandlers): () => void {
  return subscribeNativeEvents(WINDOW_MENU, {
    newRequested: (event: { mode?: unknown }) => handlers.onNewRequested(toScoreMode(event.mode)),
    openRequested: handlers.onOpenRequested,
    fileOpened: (body: unknown) => {
      const path = pathOf(body);
      if (path !== undefined) {
        handlers.onFileOpened(path);
      }
    },
    saveRequested: (event: { saveAs?: unknown }) => handlers.onSaveRequested(event.saveAs === true),
  });
}

/** A menu command posted as the event `event` (no body): subscribing returns the unsubscribe function. */
function menuRequests(event: string): (listener: () => void) => () => void {
  return (listener) => subscribeNativeEvents(WINDOW_MENU, { [event]: listener });
}

/** File ▸ Import PDF… (Ctrl+Shift+I). */
export const subscribeImportPdfRequests = menuRequests('importPdfRequested');
/** File ▸ Export PDF… (Ctrl+Shift+E), the same as the Export… button. */
export const subscribeExportRequests = menuRequests('exportRequested');
/** File ▸ Export PNG…. */
export const subscribeExportPngRequests = menuRequests('exportPngRequested');
/** File ▸ Export Audio… (not in the Windows menu: no offline renderer yet). */
export const subscribeExportAudioRequests = menuRequests('exportAudioRequested');
/** File ▸ Print… (Ctrl+P). */
export const subscribePrintRequests = menuRequests('printRequested');
/** Edit ▸ AI Wizard ▸ Song Writer…. */
export const subscribeSongWriterRequests = menuRequests('songWriterRequested');
/** Tools ▸ Transpose…. */
export const subscribeTransposeRequests = menuRequests('transposeRequested');
/** Edit ▸ Lyrics…. */
export const subscribeLyricsRequests = menuRequests('lyricsRequested');
/** Edit ▸ Annotation…: the annotation of the cursor's beat. */
export const subscribeAnnotationRequests = menuRequests('annotationRequested');
/** Tools ▸ Scales…. */
export const subscribeScalesRequests = menuRequests('scalesRequested');
/** Help ▸ Keyboard Shortcuts (F1). */
export const subscribeHelpRequests = menuRequests('helpRequested');
/** View ▸ Focus / Unfocus (Ctrl+Shift+F). */
export const subscribeFocusRequests = menuRequests('focusRequested');
/** View ▸ Drum Key. */
export const subscribeDrumKeyRequests = menuRequests('drumKeyRequested');

export interface SongExportHandlers {
  readonly onExportMidiRequested: () => void;
  readonly onExportAsciiTabRequested: () => void;
  readonly onExportMusicXmlRequested: () => void;
  readonly onExportCompressedMusicXmlRequested: () => void;
}

/** File ▸ Export MIDI…, Export ASCII Tab…, Export MusicXML… and Export Compressed MusicXML…. */
export function subscribeSongExportRequests(handlers: SongExportHandlers): () => void {
  return subscribeNativeEvents(WINDOW_MENU, {
    exportMidiRequested: handlers.onExportMidiRequested,
    exportAsciiTabRequested: handlers.onExportAsciiTabRequested,
    exportMusicXmlRequested: handlers.onExportMusicXmlRequested,
    exportCompressedMusicXmlRequested: handlers.onExportCompressedMusicXmlRequested,
  });
}

/** What the palette opens on: its commands, or Expression Text (the field starts with “>”). */
export type CommandPaletteMode = 'commands' | 'expression';

/** Tools ▸ Command Palette… (Ctrl+Shift+P) and Tools ▸ Expression Text… (Ctrl+Alt+E): `{ mode }` says which. */
export function subscribeCommandPaletteRequests(onCommandPaletteRequested: (mode: CommandPaletteMode) => void): () => void {
  return subscribeNativeEvents(WINDOW_MENU, {
    commandPaletteRequested: (body: unknown) => {
      const mode = typeof body === 'object' && body !== null && (body as { readonly mode?: unknown }).mode === 'expression' ? 'expression' : 'commands';
      onCommandPaletteRequested(mode);
    },
  });
}

/** Edit ▸ Undo / Redo of the window menu (Ctrl+Z / Ctrl+Y on the score go through its own keys). */
export interface UndoEventHandlers {
  readonly onUndoRequested: () => void;
  readonly onRedoRequested: () => void;
}

export function subscribeUndoRequests(handlers: UndoEventHandlers): () => void {
  return subscribeNativeEvents(WINDOW_MENU, { undoRequested: handlers.onUndoRequested, redoRequested: handlers.onRedoRequested });
}

/** Enables Edit ▸ Undo / Redo of the window menu when the shown tab has something to undo / redo. */
export function setUndoState(canUndo: boolean, canRedo: boolean): void {
  setMenuItemsEnabled({ undo: canUndo, redo: canRedo });
}

const DELETE_COMMAND_NAMES = ['notes', 'bars'] as const;

/** Edit ▸ Delete Notes or Delete Bars (Ctrl+D). */
export type DeleteCommand = (typeof DELETE_COMMAND_NAMES)[number];

/** What a "deleteRequested" event deletes (`{ what }`); undefined for anything else. */
export function toDeleteCommand(body: unknown): DeleteCommand | undefined {
  const what = typeof body === 'object' && body !== null ? (body as { readonly what?: unknown }).what : undefined;
  return DELETE_COMMAND_NAMES.find((each) => each === what);
}

export function subscribeDeleteRequests(onDeleteRequested: (command: DeleteCommand) => void): () => void {
  return subscribeNativeEvents(WINDOW_MENU, {
    deleteRequested: (body: unknown) => {
      const command = toDeleteCommand(body);
      if (command !== undefined) {
        onDeleteRequested(command);
      }
    },
  });
}

export interface TrackViewEventHandlers {
  /** View ▸ Multitrack (F3). */
  readonly onMultitrackRequested: () => void;
  /** View ▸ Previous Track / Next Track. */
  readonly onPreviousTrackRequested: () => void;
  readonly onNextTrackRequested: () => void;
}

export function subscribeTrackViewRequests(handlers: TrackViewEventHandlers): () => void {
  return subscribeNativeEvents(WINDOW_MENU, {
    multitrackRequested: handlers.onMultitrackRequested,
    previousTrackRequested: handlers.onPreviousTrackRequested,
    nextTrackRequested: handlers.onNextTrackRequested,
  });
}

export interface TabEventHandlers {
  readonly onCloseTabRequested: () => void;
  readonly onNextTabRequested: () => void;
  readonly onPreviousTabRequested: () => void;
}

/** File ▸ Close Tab, Next Tab and Previous Tab. */
export function subscribeTabRequests(handlers: TabEventHandlers): () => void {
  return subscribeNativeEvents(WINDOW_MENU, {
    closeTabRequested: handlers.onCloseTabRequested,
    nextTabRequested: handlers.onNextTabRequested,
    previousTabRequested: handlers.onPreviousTabRequested,
  });
}