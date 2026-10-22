import { NativeModules } from 'react-native';

interface GPClipboardModule {
  writeBeats(json: string, summary: string): Promise<void>;
  readBeats(): Promise<string | null>;
}

/** JS side of macos/GPEditor-macOS/GPClipboard.m: copied beats on the system pasteboard. */
const native = NativeModules.GPClipboard as GPClipboardModule | undefined;

/** Puts copied beats (`json`, the app's own pasteboard type) and a plain-text summary on the pasteboard; a no-op where the module is missing (tests). */
export function writeBeats(json: string, summary: string): Promise<void> {
  return native === undefined ? Promise.resolve() : native.writeBeats(json, summary);
}

/** The copied beats' JSON on the pasteboard (untrusted); null when it holds none or the module is missing. */
export function readBeats(): Promise<string | null> {
  return native === undefined ? Promise.resolve(null) : native.readBeats();
}
