// Windows (Tauri) twin of gp-files.ts: the same API, on the dialog plugin and the Rust file commands
// (src-tauri/src/commands/files.rs); the menu and keyboard events come through web/app-events.ts.
import { getCurrentWindow } from '@tauri-apps/api/window';
import { base64ToBytes, bytesToBase64 } from '../lib/base64';
import type { FileFormat } from '../lib/file-formats';
import { type ScoreMode, toScoreMode } from '../score/geometry';
import { onAppEvent, unsubscribeAll } from './web/app-events';
import { extensionOf, pathFromUrl, pickFile, pickSavePath, readPath, writePath } from './web/files';
import { isTauri } from './web/tauri';

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

/** What File ▸ Open… offers: the formats gp-core reads. */
const OPEN_FILTERS = [
  { name: 'Guitar Pro, Power Tab, TablEdit and MIDI files', extensions: ['gp', 'gpx', 'gp5', 'gp4', 'gp3', 'gtp', 'ptb', 'tef', 'mid', 'midi'] },
  { name: 'All files', extensions: ['*'] },
];

function opened(file: { name: string; path: string; bytes: Uint8Array }): OpenedFile {
  return { name: file.name, path: file.path, base64: bytesToBase64(file.bytes) };
}

export async function showOpenDialog(): Promise<OpenedFile | null> {
  const file = await pickFile(OPEN_FILTERS, 'Open');
  return file === null ? null : opened(file);
}

export async function readFile(pathOrUrl: string): Promise<OpenedFile> {
  return opened(await readPath(pathFromUrl(pathOrUrl)));
}

/** The chosen format first (Windows preselects the first filter); the file's extension then names the format. */
export async function showSavePanel(options: SavePanelOptions): Promise<ChosenFile | null> {
  const chosen = options.formats.find((format) => format.id === options.formatId) ?? options.formats[0];
  if (chosen === undefined) {
    throw new Error('No file format to save in');
  }
  const ordered = [chosen, ...options.formats.filter((format) => format !== chosen)];
  const path = await pickSavePath(options.suggestedName, ordered.map((format) => ({ name: format.label, extensions: [format.extension] })), 'Save As');
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

/** The window's title bar (and the taskbar): "Song.gp5 — Edited". */
export function setDocumentTitle(title: string): void {
  // Windows title bars name the document, then the app.
  const text = title === '' || title === 'GP Editor' ? 'GP Editor' : `${title} — GP Editor`;
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

export function subscribeFileEvents(handlers: FileEventHandlers): () => void {
  return unsubscribeAll([
    onAppEvent('newRequested', (body) => handlers.onNewRequested(toScoreMode((body as { mode?: unknown }).mode))),
    onAppEvent('openRequested', () => handlers.onOpenRequested()),
    onAppEvent('fileOpened', (body) => {
      const path = pathOf(body);
      if (path !== undefined) {
        handlers.onFileOpened(path);
      }
    }),
    onAppEvent('saveRequested', (body) => handlers.onSaveRequested((body as { saveAs?: unknown }).saveAs === true)),
  ]);
}

export function subscribeImportPdfRequests(onImportPdfRequested: () => void): () => void {
  return onAppEvent('importPdfRequested', () => onImportPdfRequested());
}

export function subscribeExportRequests(onExportRequested: () => void): () => void {
  return onAppEvent('exportRequested', () => onExportRequested());
}

export function subscribeExportPngRequests(onExportPngRequested: () => void): () => void {
  return onAppEvent('exportPngRequested', () => onExportPngRequested());
}

export interface SongExportHandlers {
  readonly onExportMidiRequested: () => void;
  readonly onExportAsciiTabRequested: () => void;
}

export function subscribeSongExportRequests(handlers: SongExportHandlers): () => void {
  return unsubscribeAll([
    onAppEvent('exportMidiRequested', () => handlers.onExportMidiRequested()),
    onAppEvent('exportAsciiTabRequested', () => handlers.onExportAsciiTabRequested()),
  ]);
}

export function subscribePrintRequests(onPrintRequested: () => void): () => void {
  return onAppEvent('printRequested', () => onPrintRequested());
}

export function subscribeSongWriterRequests(onSongWriterRequested: () => void): () => void {
  return onAppEvent('songWriterRequested', () => onSongWriterRequested());
}

export function subscribeHelpRequests(onHelpRequested: () => void): () => void {
  return onAppEvent('helpRequested', () => onHelpRequested());
}

export interface TabEventHandlers {
  readonly onCloseTabRequested: () => void;
  readonly onNextTabRequested: () => void;
  readonly onPreviousTabRequested: () => void;
}

export function subscribeTabRequests(handlers: TabEventHandlers): () => void {
  return unsubscribeAll([
    onAppEvent('closeTabRequested', () => handlers.onCloseTabRequested()),
    onAppEvent('nextTabRequested', () => handlers.onNextTabRequested()),
    onAppEvent('previousTabRequested', () => handlers.onPreviousTabRequested()),
  ]);
}
