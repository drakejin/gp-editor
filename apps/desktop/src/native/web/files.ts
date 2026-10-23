import { open, save } from '@tauri-apps/plugin-dialog';
import { bytesToBase64 } from '../../lib/base64';
import { call, callBytes, fileNameOf, isTauri } from './tauri';

/** A file dialog filter: its label and extensions (no dots). */
export interface DialogFilter {
  readonly name: string;
  readonly extensions: readonly string[];
}

/** A file the user picked: where it is and its bytes. */
export interface PickedFile {
  readonly name: string;
  readonly path: string;
  readonly bytes: Uint8Array;
}

/**
 * file:///C:/Songs/a.gp5 → C:\Songs\a.gp5 (Windows), file:///home/a.gp5 → /home/a.gp5; a plain path is kept.
 */
export function pathFromUrl(pathOrUrl: string): string {
  if (!pathOrUrl.startsWith('file:')) {
    return pathOrUrl;
  }
  const url = new URL(pathOrUrl);
  const path = decodeURIComponent(url.pathname);
  if (/^\/[A-Za-z]:\//.test(path)) {
    return path.slice(1).replace(/\//g, '\\');
  }
  return url.host === '' ? path : `\\\\${url.host}${path.replace(/\//g, '\\')}`;
}

/** Without Tauri (a browser): the page's own file picker. */
function pickInBrowser(filters: readonly DialogFilter[]): Promise<PickedFile | null> {
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = filters.flatMap((filter) => filter.extensions.filter((ext) => ext !== '*').map((ext) => `.${ext}`)).join(',');
    input.addEventListener('change', () => {
      const file = input.files?.[0];
      if (file === undefined) {
        resolve(null);
        return;
      }
      void file.arrayBuffer().then((buffer) => resolve({ name: file.name, path: file.name, bytes: new Uint8Array(buffer) }));
    });
    input.addEventListener('cancel', () => resolve(null));
    input.click();
  });
}

/** The open dialog for one file; null when cancelled. */
export async function pickFile(filters: readonly DialogFilter[], title?: string): Promise<PickedFile | null> {
  if (!isTauri()) {
    return pickInBrowser(filters);
  }
  const path = await pickFilePath(filters, title);
  return path === null ? null : readPath(path);
}

/** The open dialog for one file, without reading it; null when cancelled. */
export async function pickFilePath(filters: readonly DialogFilter[], title?: string): Promise<string | null> {
  const chosen = await open({ multiple: false, directory: false, title, filters: filters.map((filter) => ({ name: filter.name, extensions: [...filter.extensions] })) });
  return typeof chosen === 'string' ? chosen : null;
}

/** A folder dialog; null when cancelled. */
export async function pickFolder(title: string): Promise<string | null> {
  if (!isTauri()) {
    return null;
  }
  const chosen = await open({ multiple: false, directory: true, title });
  return typeof chosen === 'string' ? chosen : null;
}

/** The save dialog; null when cancelled. */
export async function pickSavePath(suggestedName: string, filters: readonly DialogFilter[], title?: string): Promise<string | null> {
  if (!isTauri()) {
    return suggestedName;
  }
  const chosen = await save({ defaultPath: suggestedName, title, filters: filters.map((filter) => ({ name: filter.name, extensions: [...filter.extensions] })) });
  return typeof chosen === 'string' && chosen !== '' ? chosen : null;
}

export async function readPath(path: string): Promise<PickedFile> {
  const bytes = await callBytes('read_file', { path });
  return { name: fileNameOf(path), path, bytes };
}

/** Without Tauri the "path" is a file name: the browser downloads the file. */
function downloadInBrowser(name: string, bytes: Uint8Array, type: string): void {
  const url = URL.createObjectURL(new Blob([bytes.slice().buffer], { type }));
  const link = document.createElement('a');
  link.href = url;
  link.download = name;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** Writes (or overwrites) a file. */
export async function writePath(path: string, bytes: Uint8Array, type = 'application/octet-stream'): Promise<{ name: string; path: string }> {
  if (!isTauri()) {
    downloadInBrowser(fileNameOf(path), bytes, type);
    return { name: fileNameOf(path), path };
  }
  await call('write_file', { path, base64: bytesToBase64(bytes) });
  return { name: fileNameOf(path), path };
}

/** The extension of a path, lower case, without the dot; '' when it has none. */
export function extensionOf(path: string): string {
  const name = fileNameOf(path);
  const dot = name.lastIndexOf('.');
  return dot <= 0 ? '' : name.slice(dot + 1).toLowerCase();
}
