// Windows twin of midi-input.ts: MIDI sources and their note messages through the Web MIDI API (WebView2), in place
// of CoreMIDI (GPMidiInput.m). A source's id is a number derived from Web MIDI's port id, so it stays the same from
// run to run as CoreMIDI's unique ids do.
/* eslint-disable no-bitwise -- a hash of the port id, and a MIDI status byte's kind and channel nibbles */
import { t } from '../lib/i18n/i18n';
import { type MidiNoteMessage, type MidiSource, parseMidiNote, parseMidiSources } from '../lib/midi-input';
import { onAppEvent, postAppEvent, unsubscribeAll } from './web/app-events';
import { readSetting, writeSetting } from './web/settings';

const SETTINGS_FILE = 'midi-input.json';

let access: Promise<MIDIAccess | undefined> | undefined;
const listened = new Set<number>();

/** A positive 31-bit number from a port id (FNV-1a). */
export function sourceIdOf(portId: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < portId.length; i++) {
    hash ^= portId.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 1) || 1;
}

/** One MIDI 1.0 message → a note-on or note-off body as GPMidiInput.m sends it (a note-on at velocity 0 is an off). */
export function noteBody(data: Uint8Array): { on: boolean; channel: number; key: number; velocity: number } | undefined {
  const status = data[0] ?? 0;
  const kind = status & 0xf0;
  if ((kind !== 0x90 && kind !== 0x80) || data.length < 3) {
    return undefined;
  }
  const velocity = data[2] ?? 0;
  return { on: kind === 0x90 && velocity > 0, channel: status & 0x0f, key: data[1] ?? 0, velocity };
}

function onMessage(event: MIDIMessageEvent): void {
  const port = event.target as MIDIInput | null;
  if (port === null || !listened.has(sourceIdOf(port.id)) || event.data === null) {
    return;
  }
  const body = noteBody(event.data);
  if (body !== undefined) {
    postAppEvent('midiNote', body);
  }
}

function getAccess(): Promise<MIDIAccess | undefined> {
  if (access === undefined) {
    access =
      typeof navigator.requestMIDIAccess !== 'function'
        ? Promise.resolve(undefined)
        : navigator.requestMIDIAccess({ sysex: false }).then(
            (midi) => {
              midi.onstatechange = () => postAppEvent('midiSourcesChanged');
              return midi;
            },
            () => undefined,
          );
  }
  return access;
}

export async function listMidiSources(): Promise<readonly MidiSource[]> {
  const midi = await getAccess();
  if (midi === undefined) {
    return [];
  }
  return parseMidiSources([...midi.inputs.values()].filter((input) => input.state === 'connected').map((input) => ({ id: sourceIdOf(input.id), name: input.name ?? t('window.windows.midiInput') })));
}

export async function listenToMidiSources(sourceIds: readonly number[]): Promise<number> {
  listened.clear();
  sourceIds.forEach((id) => listened.add(id));
  const midi = await getAccess();
  if (midi === undefined) {
    return 0;
  }
  let count = 0;
  for (const input of midi.inputs.values()) {
    const isListened = listened.has(sourceIdOf(input.id));
    input.onmidimessage = isListened ? onMessage : null;
    count += isListened ? 1 : 0;
  }
  return count;
}

export function loadMidiInputSettings(): Promise<string | null> {
  return readSetting(SETTINGS_FILE);
}

export function saveMidiInputSettings(json: string): Promise<void> {
  return writeSetting(SETTINGS_FILE, json);
}

export interface MidiInputHandlers {
  readonly onNote: (note: MidiNoteMessage) => void;
  readonly onSourcesChanged: () => void;
}

export function subscribeMidiInput(handlers: MidiInputHandlers): () => void {
  return unsubscribeAll([
    onAppEvent('midiNote', (body) => {
      const note = parseMidiNote(body);
      if (note !== undefined) {
        handlers.onNote(note);
      }
    }),
    onAppEvent('midiSourcesChanged', () => handlers.onSourcesChanged()),
  ]);
}
