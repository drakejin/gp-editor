// Windows twin of autosave.ts: autosave is macOS only for now. The Rust side has no command that makes folders in the
// app's data folder, lists them or removes old ones (src-tauri/src/commands: files, settings), and the port takes no
// Rust change here — WINDOWS_PORT.md. Nothing is written, nothing is offered back.

export interface NativeSession {
  readonly pid: number;
  readonly bootId: string;
}

export function isAutosaveAvailable(): boolean {
  return false;
}

export function currentSession(): Promise<NativeSession> {
  return Promise.resolve({ pid: 0, bootId: '' });
}

export function writeSnapshot(_folder: string, _base64: string, _manifest: string): Promise<void> {
  return Promise.resolve();
}

export function writeManifest(_folder: string, _manifest: string): Promise<void> {
  return Promise.resolve();
}

export function listSnapshots(): Promise<unknown> {
  return Promise.resolve([]);
}

export function readSnapshot(_folder: string): Promise<string> {
  // i18n-exempt: never shown — nothing is listed to read on Windows
  return Promise.reject(new Error('autosave is not on Windows yet'));
}

export function removeDaysBefore(_day: string): Promise<number> {
  return Promise.resolve(0);
}

export function runningProcesses(pids: readonly number[]): Promise<readonly boolean[]> {
  return Promise.resolve(pids.map(() => false));
}

export function revealAutosaveFolder(): Promise<void> {
  return Promise.resolve();
}
