import { NativeModules } from 'react-native';

/** This run of the app as the native side knows it: its process id and the Mac's boot (kern.bootsessionuuid). */
export interface NativeSession {
  readonly pid: number;
  readonly bootId: string;
}

interface GPAutosaveModule {
  sessionInfo(): Promise<unknown>;
  writeSnapshot(folder: string, base64: string, manifest: string): Promise<void>;
  writeManifest(folder: string, manifest: string): Promise<void>;
  listSnapshots(): Promise<unknown>;
  readSnapshot(folder: string): Promise<string>;
  removeDaysBefore(day: string): Promise<number>;
  runningProcesses(pids: readonly number[]): Promise<unknown>;
  revealFolder(): Promise<void>;
}

/** JS side of macos/GPEditor-macOS/GPAutosave.m: Application Support/GPEditor/Autosave/<day>/<document>/. */
const native = NativeModules.GPAutosave as GPAutosaveModule | undefined;

function requireNative(): GPAutosaveModule {
  if (native === undefined) {
    // i18n-exempt: a developer's diagnostic naming the native module
    throw new Error('GPAutosave native module is not available on this platform');
  }
  return native;
}

/** Whether this build autosaves (the Mac app; not Windows yet, nor Jest without the module). */
export function isAutosaveAvailable(): boolean {
  return native !== undefined;
}

/**
 * This app's process id and boot: the sessions' manifests name them, so a later launch can tell a crash (or a power
 * cut: another boot) from an app still running. A pid of 0 when the answer is not one.
 */
export async function currentSession(): Promise<NativeSession> {
  const info = await requireNative().sessionInfo();
  const record = typeof info === 'object' && info !== null ? (info as Readonly<Record<string, unknown>>) : {};
  const { processId, bootId } = record;
  const pid = typeof processId === 'number' && Number.isInteger(processId) && processId > 0 ? processId : 0;
  return { pid, bootId: typeof bootId === 'string' ? bootId : '' };
}

/** The snapshot (a .gp file's bytes in base64), then its manifest, each written whole in place of the last. */
export function writeSnapshot(folder: string, base64: string, manifest: string): Promise<void> {
  return requireNative().writeSnapshot(folder, base64, manifest);
}

/** A snapshot's manifest rewritten (its new status). */
export function writeManifest(folder: string, manifest: string): Promise<void> {
  return requireNative().writeManifest(folder, manifest);
}

/** Every snapshot's folder and manifest text, the newest days first; untrusted (parseEntries). */
export function listSnapshots(): Promise<unknown> {
  return requireNative().listSnapshots();
}

/** A snapshot's bytes, base64. */
export function readSnapshot(folder: string): Promise<string> {
  return requireNative().readSnapshot(folder);
}

/** Removes the day folders before `day` (`2026-10-28`); resolves how many went. */
export function removeDaysBefore(day: string): Promise<number> {
  return requireNative().removeDaysBefore(day);
}

/** For each process id, whether it still runs. */
export async function runningProcesses(pids: readonly number[]): Promise<readonly boolean[]> {
  const answer = await requireNative().runningProcesses(pids);
  return Array.isArray(answer) ? pids.map((_, index) => answer[index] === true) : pids.map(() => false);
}

/** The autosave folder in Finder. */
export function revealAutosaveFolder(): Promise<void> {
  return requireNative().revealFolder();
}
