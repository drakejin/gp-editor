import { NativeModules } from 'react-native';
import { type MidiNoteMessage, type MidiSource, parseMidiNote, parseMidiSources } from '../lib/midi-input';
import { subscribeNativeEvents } from './native-events';

interface GPMidiInputModule {
  sources(): Promise<unknown>;
  listen(sourceIds: readonly number[]): Promise<number>;
  stop(): Promise<void>;
  loadSettings(): Promise<string | null>;
  saveSettings(json: string): Promise<void>;
}

/** JS side of macos/GPEditor-macOS/GPMidiInput.m: MIDI sources and their note messages (CoreMIDI). */
const native = NativeModules.GPMidiInput as GPMidiInputModule | undefined;

/** The MIDI sources the Mac has now; none where the module is missing (tests). */
export async function listMidiSources(): Promise<readonly MidiSource[]> {
  return native === undefined ? [] : parseMidiSources(await native.sources());
}

/** Listens to exactly these sources (none = stop); resolves how many are listened to. */
export function listenToMidiSources(sourceIds: readonly number[]): Promise<number> {
  if (native === undefined) {
    return Promise.resolve(0);
  }
  return sourceIds.length === 0 ? native.stop().then(() => 0) : native.listen(sourceIds);
}

/** The settings JSON last saved (untrusted until parsed), or null. */
export function loadMidiInputSettings(): Promise<string | null> {
  return native === undefined ? Promise.resolve(null) : native.loadSettings();
}

export function saveMidiInputSettings(json: string): Promise<void> {
  return native === undefined ? Promise.resolve() : native.saveSettings(json);
}

export interface MidiInputHandlers {
  /** A note-on or note-off, checked (parseMidiNote); malformed messages never get here. */
  readonly onNote: (note: MidiNoteMessage) => void;
  /** A MIDI device came or went. */
  readonly onSourcesChanged: () => void;
}

/** Subscribes to the native MIDI events; returns the unsubscribe function. */
export function subscribeMidiInput(handlers: MidiInputHandlers): () => void {
  return subscribeNativeEvents(native, {
    midiNote: (body: unknown) => {
      const note = parseMidiNote(body);
      if (note !== undefined) {
        handlers.onNote(note);
      }
    },
    midiSourcesChanged: handlers.onSourcesChanged,
  });
}
