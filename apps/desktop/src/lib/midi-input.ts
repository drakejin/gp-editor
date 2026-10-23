import type { PlayedNote } from '@gp-editor/core';

/** Notes struck within this many milliseconds of the first form one chord (one beat). */
export const CHORD_WINDOW_MS = 50;

const MIDI_CHANNELS = 16;
const MIDI_DATA_MAX = 127;

/** A note-on or note-off from a MIDI source. `channel` is 0–15 (MIDI channel 1–16). */
export interface MidiNoteMessage {
  readonly isOn: boolean;
  readonly channel: number;
  readonly key: number;
  readonly velocity: number;
}

/** A MIDI source the Mac knows: CoreMIDI's unique id (kept across launches) and its name. */
export interface MidiSource {
  readonly id: number;
  readonly name: string;
}

/** Settings → MIDI input, kept in user defaults. */
export interface MidiInputSettings {
  readonly isEnabled: boolean;
  /** The source listened to; undefined = every source. */
  readonly sourceId?: number;
  /** MIDI guitar: each string on its own channel (channel 1 = string 1), as Guitar Pro's MIDI guitar input. */
  readonly isGuitarMode: boolean;
  /** The note's velocity is how hard it was struck (else the default dynamic). */
  readonly usesVelocity: boolean;
}

export const DEFAULT_MIDI_INPUT: MidiInputSettings = { isEnabled: false, isGuitarMode: false, usesVelocity: false };

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isWhole(value: unknown, lowest: number, highest: number): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= lowest && value <= highest;
}

/** A note message from the native side (untrusted: it comes from outside the app); undefined when malformed. */
export function parseMidiNote(body: unknown): MidiNoteMessage | undefined {
  if (!isRecord(body) || typeof body.on !== 'boolean') {
    return undefined;
  }
  const { channel, key, velocity } = body;
  if (!isWhole(channel, 0, MIDI_CHANNELS - 1) || !isWhole(key, 0, MIDI_DATA_MAX) || !isWhole(velocity, 0, MIDI_DATA_MAX)) {
    return undefined;
  }
  return { isOn: body.on, channel, key, velocity };
}

/** The source list from the native side; malformed entries are dropped. */
export function parseMidiSources(body: unknown): readonly MidiSource[] {
  if (!Array.isArray(body)) {
    return [];
  }
  return body.flatMap((entry: unknown) => (isRecord(entry) && Number.isInteger(entry.id) && typeof entry.id === 'number' && typeof entry.name === 'string' ? [{ id: entry.id, name: entry.name }] : []));
}

/** Settings saved by serializeMidiInputSettings; a field that cannot be read keeps its default. */
export function parseMidiInputSettings(json: string | null): MidiInputSettings {
  let value: unknown;
  try {
    value = json === null ? undefined : JSON.parse(json);
  } catch {
    return DEFAULT_MIDI_INPUT;
  }
  if (!isRecord(value)) {
    return DEFAULT_MIDI_INPUT;
  }
  const flag = (name: keyof MidiInputSettings, fallback: boolean) => (typeof value[name] === 'boolean' ? value[name] : fallback);
  const sourceId = typeof value.sourceId === 'number' && Number.isInteger(value.sourceId) ? value.sourceId : undefined;
  return {
    isEnabled: flag('isEnabled', DEFAULT_MIDI_INPUT.isEnabled),
    ...(sourceId === undefined ? {} : { sourceId }),
    isGuitarMode: flag('isGuitarMode', DEFAULT_MIDI_INPUT.isGuitarMode),
    usesVelocity: flag('usesVelocity', DEFAULT_MIDI_INPUT.usesVelocity),
  };
}

export function serializeMidiInputSettings(settings: MidiInputSettings): string {
  return JSON.stringify(settings);
}

/** The sources to listen to: none when off, the chosen one while it is connected, else every source. */
export function listenedSourceIds(settings: Pick<MidiInputSettings, 'isEnabled' | 'sourceId'>, sources: readonly MidiSource[]): readonly number[] {
  if (!settings.isEnabled) {
    return [];
  }
  return sources.filter((source) => settings.sourceId === undefined || source.id === settings.sourceId).map((source) => source.id);
}

/** Notes struck together so far, and when the first was. */
export interface PendingChord {
  readonly notes: readonly MidiNoteMessage[];
  readonly startedAt: number;
}

/**
 * A note-on joins the chord being gathered when it comes within CHORD_WINDOW_MS of its first note; otherwise that chord
 * is ready (to enter as one beat) and the note starts the next.
 */
export function addNoteOn(pending: PendingChord | undefined, note: MidiNoteMessage, now: number): { readonly pending: PendingChord; readonly ready?: readonly MidiNoteMessage[] } {
  if (pending === undefined) {
    return { pending: { notes: [note], startedAt: now } };
  }
  if (now - pending.startedAt <= CHORD_WINDOW_MS) {
    return { pending: { ...pending, notes: [...pending.notes, note] } };
  }
  return { pending: { notes: [note], startedAt: now }, ready: pending.notes };
}

/** A struck chord as notes to enter: the pitch, the velocity when asked for, and on a MIDI guitar the channel's string. */
export function toPlayedNotes(notes: readonly MidiNoteMessage[], settings: MidiInputSettings): readonly PlayedNote[] {
  return notes.map((note) => ({
    pitch: note.key,
    ...(settings.usesVelocity ? { velocity: note.velocity } : {}),
    ...(settings.isGuitarMode ? { string: note.channel + 1 } : {}),
  }));
}
