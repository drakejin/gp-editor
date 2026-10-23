import { NativeEventEmitter, NativeModules } from 'react-native';

interface GPAudioInputModule {
  start(): Promise<void>;
  stop(): Promise<void>;
}

/**
 * JS side of macos/GPEditor-macOS/GPAudioInput.m: microphone capture for the tuner (mono, decimated to about 6 kHz,
 * a 2048-sample frame about 12 times a second as "audioFrame" events — parseAudioFrame reads them) and the
 * Tools ▸ Tuner… menu command ("tunerRequested").
 */
const native = NativeModules.GPAudioInput as GPAudioInputModule | undefined;

/** Starts capture, asking for microphone access the first time; rejects with code "denied" when access is off. */
export function startAudioInput(): Promise<void> {
  return native === undefined ? Promise.reject(new Error('The microphone is not available on this platform.')) : native.start();
}

/** Stops capture (also done natively when the app quits); a no-op where the module is missing. */
export function stopAudioInput(): Promise<void> {
  return native === undefined ? Promise.resolve() : native.stop();
}

/** Each frame event's body (untrusted until parseAudioFrame checks it); returns the unsubscribe function. */
export function subscribeAudioFrames(onFrame: (body: unknown) => void): () => void {
  if (native === undefined) {
    return () => undefined;
  }
  const subscription = new NativeEventEmitter(NativeModules.GPAudioInput).addListener('audioFrame', onFrame);
  return () => subscription.remove();
}

/** Tools ▸ Tuner…; returns the unsubscribe function. */
export function subscribeTunerRequests(onTunerRequested: () => void): () => void {
  if (native === undefined) {
    return () => undefined;
  }
  const subscription = new NativeEventEmitter(NativeModules.GPAudioInput).addListener('tunerRequested', onTunerRequested);
  return () => subscription.remove();
}
