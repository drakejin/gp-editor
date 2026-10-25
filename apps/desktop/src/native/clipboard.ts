import { NativeEventEmitter, NativeModules } from 'react-native';

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

/** Edit ▸ Cut / Copy / Paste for the score. */
export type ClipboardCommand = 'cut' | 'copy' | 'paste';

const CLIPBOARD_COMMANDS: readonly ClipboardCommand[] = ['cut', 'copy', 'paste'];

/** The command a "clipboardCommandRequested" event names (`{ command }`); undefined for anything else. */
export function toClipboardCommand(body: unknown): ClipboardCommand | undefined {
  const command = typeof body === 'object' && body !== null ? (body as { readonly command?: unknown }).command : undefined;
  return CLIPBOARD_COMMANDS.find((each) => each === command);
}

/**
 * Edit ▸ Cut / Copy / Paste chosen while no text field has the keyboard, or ⌘X / ⌘C / ⌘V pressed then (the menu bar
 * sees them before the score: EditMenu.swift); returns the unsubscribe function.
 */
export function subscribeClipboardRequests(onClipboardRequested: (command: ClipboardCommand) => void): () => void {
  if (native === undefined) {
    return () => undefined;
  }
  const subscription = new NativeEventEmitter(NativeModules.GPClipboard).addListener('clipboardCommandRequested', (body: unknown) => {
    const command = toClipboardCommand(body);
    if (command !== undefined) {
      onClipboardRequested(command);
    }
  });
  return () => subscription.remove();
}
