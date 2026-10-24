import { NativeEventEmitter } from 'react-native';

/** What a native event's listener takes: the body the module sent, checked by the listener where it is untrusted. */
export type NativeEventListener = (body: never) => void;

/** One emitter per module (an emitter is only a view of the device's events by name). */
const emitters = new WeakMap<object, NativeEventEmitter>();

function emitterOf(module: object): NativeEventEmitter {
  const known = emitters.get(module);
  if (known !== undefined) {
    return known;
  }
  // Every module given here is an RCTEventEmitter on the native side: it has addListener / removeListeners.
  const emitter = new NativeEventEmitter(module as ConstructorParameters<typeof NativeEventEmitter>[0]);
  emitters.set(module, emitter);
  return emitter;
}

/**
 * Listens to a native module's events (`listeners` by event name); returns the unsubscribe function. Nothing listens
 * where the module is missing (tests, other platforms).
 */
export function subscribeNativeEvents(module: object | undefined, listeners: Readonly<Record<string, NativeEventListener>>): () => void {
  if (module === undefined) {
    return () => undefined;
  }
  const emitter = emitterOf(module);
  const subscriptions = Object.entries(listeners).map(([event, listener]) => emitter.addListener(event, listener as (body: unknown) => void));
  return () => subscriptions.forEach((subscription) => subscription.remove());
}
