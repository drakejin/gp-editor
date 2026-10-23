/**
 * The Windows build's stand-in for the native modules' event emitters: the window menu, keyboard shortcuts, dropped
 * files and the Rust side post app events here, and src/native/*.web.ts subscribe as their macOS twins subscribe to
 * NativeEventEmitter. Events posted before anyone listens to them (a file the app was opened with) wait for the first
 * listener, as GPFiles.m keeps its pending paths.
 */

type Listener = (body: unknown) => void;

const listeners = new Map<string, Set<Listener>>();
const pending = new Map<string, unknown[]>();

/** Event names whose events are kept until a listener comes. */
const KEPT_UNTIL_HEARD = new Set(['fileOpened']);

export function postAppEvent(name: string, body: unknown = {}): void {
  const heard = listeners.get(name);
  if (heard === undefined || heard.size === 0) {
    if (KEPT_UNTIL_HEARD.has(name)) {
      pending.set(name, [...(pending.get(name) ?? []), body]);
    }
    return;
  }
  for (const listener of [...heard]) {
    listener(body);
  }
}

/** Listens to an app event; returns the unsubscribe function. */
export function onAppEvent(name: string, listener: Listener): () => void {
  const heard = listeners.get(name) ?? new Set<Listener>();
  heard.add(listener);
  listeners.set(name, heard);
  const waiting = pending.get(name);
  if (waiting !== undefined) {
    pending.delete(name);
    // After the subscriber's effect has finished, as a native event would arrive.
    setTimeout(() => waiting.forEach((body) => listener(body)), 0);
  }
  return () => {
    heard.delete(listener);
  };
}

/** Several subscriptions as one unsubscribe function. */
export function unsubscribeAll(unsubscribes: readonly (() => void)[]): () => void {
  return () => unsubscribes.forEach((unsubscribe) => unsubscribe());
}
