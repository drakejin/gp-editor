import { invoke } from '@tauri-apps/api/core';
import { t } from '../../lib/i18n/i18n';

/**
 * The Windows build runs in Tauri's WebView2 window; the Rust side (src-tauri/src/) does what a page cannot (files
 * anywhere on disk, the API key, sound banks, project folders). In a plain browser (`npm run web:dev`, the smoke test)
 * there is no Tauri: callers fall back to what a page can do, or report the feature as unavailable.
 */
export function isTauri(): boolean {
  return typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;
}

/** An error the Rust side returned (its message), or anything else thrown, as an Error with an optional code. */
export class NativeError extends Error {
  readonly code: string | undefined;

  constructor(message: string, code?: string) {
    super(message);
    this.name = 'NativeError'; // i18n-exempt: the error class's name
    this.code = code;
  }
}

/** "code: message" from the Rust side becomes a NativeError with that code. */
function toNativeError(error: unknown): NativeError {
  const text = typeof error === 'string' ? error : error instanceof Error ? error.message : String(error);
  const match = /^([a-z_]+): ([\s\S]*)$/.exec(text);
  return match === null ? new NativeError(text) : new NativeError(match[2] ?? text, match[1]);
}

/** Calls a Rust command (src-tauri/src/commands/); rejects with a NativeError. */
export async function call<T>(command: string, args?: Record<string, unknown>): Promise<T> {
  if (!isTauri()) {
    throw new NativeError(t('window.windows.desktopOnly'), 'unavailable');
  }
  try {
    return await invoke<T>(command, args);
  } catch (error) {
    throw toNativeError(error);
  }
}

/** A Rust command answering raw bytes (tauri::ipc::Response). */
export async function callBytes(command: string, args?: Record<string, unknown>): Promise<Uint8Array> {
  const answer = await call<ArrayBuffer | number[]>(command, args);
  return answer instanceof ArrayBuffer ? new Uint8Array(answer) : Uint8Array.from(answer);
}

/** The last path component, for "\" and "/" separated paths alike. */
export function fileNameOf(path: string): string {
  return path.slice(Math.max(path.lastIndexOf('/'), path.lastIndexOf('\\')) + 1);
}

/** The folder of a path, for "\" and "/" separated paths alike. */
export function folderOf(path: string): string {
  return path.slice(0, Math.max(path.lastIndexOf('/'), path.lastIndexOf('\\')));
}
