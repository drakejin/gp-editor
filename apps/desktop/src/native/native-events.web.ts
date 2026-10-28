// Windows twin of native-events.ts: there are no native modules in the Windows build; the window menu, its shortcuts and
// the Rust side post the same events by name on web/app-events.ts, so every module's subscriptions (written for the Mac,
// `subscribeNativeEvents(NativeModules.X, …)`) listen there whatever module they name.
import { onAppEvent, unsubscribeAll } from './web/app-events';

/** What a native event's listener takes: the body the module sent, checked by the listener where it is untrusted. */
export type NativeEventListener = (body: never) => void;

/** Listens to the app events named in `listeners`; returns the unsubscribe function. `module` is the Mac's, ignored. */
export function subscribeNativeEvents(module: object | undefined, listeners: Readonly<Record<string, NativeEventListener>>): () => void {
  void module;
  return unsubscribeAll(Object.entries(listeners).map(([event, listener]) => onAppEvent(event, listener as (body: unknown) => void)));
}
