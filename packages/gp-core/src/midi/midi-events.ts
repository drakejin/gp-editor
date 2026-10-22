// Port of TuxGuitar app.tuxguitar.player.base.MidiSequenceHandler / MidiControllers (LGPL-2.1): events of a sequence.

/** MidiControllers: the control change numbers the sequence uses. */
export const CONTROLLER = {
  BANK_SELECT: 0x00,
  DATA_ENTRY_MSB: 0x06,
  VOLUME: 0x07,
  BALANCE: 0x0a,
  EXPRESSION: 0x0b,
  DATA_ENTRY_LSB: 0x26,
  REVERB: 0x5b,
  TREMOLO: 0x5c,
  CHORUS: 0x5d,
  PHASER: 0x5f,
  RPN_LSB: 0x64,
  RPN_MSB: 0x65,
} as const;

/** MidiSequenceParser.DEFAULT_BEND: the pitch-wheel centre (most significant 7 bits). */
export const DEFAULT_BEND = 64;
const MAX_DATA_VALUE = 127;

/**
 * Where a note sounds: its song channel, and whether it goes to the route's second MIDI channel because it
 * carries pitch bends (TuxGuitar's `bendMode`).
 */
export interface NoteOutput {
  readonly channelId: number;
  readonly bendMode: boolean;
}

export interface NoteEvent extends NoteOutput {
  readonly type: 'noteOn' | 'noteOff';
  readonly tick: number;
  readonly key: number;
  readonly velocity: number;
}

export interface PitchBendEvent extends NoteOutput {
  readonly type: 'pitchBend';
  readonly tick: number;
  /** Most significant 7 bits; 64 = centre. */
  readonly value: number;
}

export interface ControlChangeEvent {
  readonly type: 'controlChange';
  readonly tick: number;
  readonly channelId: number;
  readonly controller: number;
  readonly value: number;
}

export interface ProgramChangeEvent {
  readonly type: 'programChange';
  readonly tick: number;
  readonly channelId: number;
  readonly program: number;
}

export interface TempoEvent {
  readonly type: 'tempo';
  readonly tick: number;
  /** Microseconds per quarter note. */
  readonly usq: number;
}

export interface TimeSignatureEvent {
  readonly type: 'timeSignature';
  readonly tick: number;
  readonly numerator: number;
  readonly denominator: number;
}

export interface TrackNameEvent {
  readonly type: 'trackName';
  readonly tick: number;
  readonly name: string;
}

/** Ticks are sequence ticks: song ticks plus the repeat move of the measure. */
export type SequenceEvent =
  | NoteEvent
  | PitchBendEvent
  | ControlChangeEvent
  | ProgramChangeEvent
  | TempoEvent
  | TimeSignatureEvent
  | TrackNameEvent;

/** MidiSequenceParser.fix: clamps a data value to 0…127. */
export function toDataValue(value: number): number {
  return Math.min(MAX_DATA_VALUE, Math.max(0, value));
}

/**
 * MidiSequenceParser.addNote: a note-on and its note-off. TuxGuitar leaves a note without length sounding (no
 * note-off); such a note is dropped here instead, so nothing hangs.
 */
export function noteEvents(
  output: NoteOutput,
  key: number,
  start: number,
  duration: number,
  velocity: number,
): NoteEvent[] {
  if (duration <= 0) {
    return [];
  }
  const fields = { ...output, key: toDataValue(key), velocity: toDataValue(velocity) };
  return [
    { type: 'noteOn', tick: start, ...fields },
    { type: 'noteOff', tick: start + duration, ...fields },
  ];
}

export function pitchBendEvent(output: NoteOutput, tick: number, value: number): PitchBendEvent {
  return { type: 'pitchBend', tick, ...output, value: toDataValue(value) };
}

export function controlChangeEvent(
  channelId: number,
  tick: number,
  controller: number,
  value: number,
): ControlChangeEvent {
  return { type: 'controlChange', tick, channelId, controller, value: toDataValue(value) };
}
