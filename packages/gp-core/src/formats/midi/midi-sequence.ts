// Port of TuxGuitar app.tuxguitar.io.midi.base (MidiSequence, MidiTrack, MidiEvent, MidiMessage), LGPL-2.1: a Standard MIDI File as read.

/** MidiMessage's channel message commands (the status byte's high nibble). */
export const MIDI_COMMAND = {
  NOTE_OFF: 0x80,
  NOTE_ON: 0x90,
  CONTROL_CHANGE: 0xb0,
  PROGRAM_CHANGE: 0xc0,
} as const;

/** Meta event types the import reads (MidiMessage.TRACK_NAME, TEMPO_CHANGE, TIME_SIGNATURE_CHANGE, and the key signature). */
export const META_TYPE = {
  TRACK_NAME: 0x03,
  END_OF_TRACK: 0x2f,
  TEMPO: 0x51,
  TIME_SIGNATURE: 0x58,
  KEY_SIGNATURE: 0x59,
} as const;

/** MidiMessage.TYPE_SHORT: a channel message. `data2` is 0 for the one-data-byte messages (program change, channel pressure). */
export interface ShortMessage {
  readonly kind: 'short';
  /** Ticks of the file's own resolution from the start of the track. */
  readonly tick: number;
  readonly command: number;
  /** 0–15 */
  readonly channel: number;
  readonly data1: number;
  readonly data2: number;
}

/** MidiMessage.TYPE_META: a meta event with its raw data. */
export interface MetaMessage {
  readonly kind: 'meta';
  readonly tick: number;
  readonly type: number;
  readonly data: Uint8Array;
}

export type MidiEvent = ShortMessage | MetaMessage;

/** One MTrk chunk's events in file order (ticks never go down). */
export type MidiTrackEvents = readonly MidiEvent[];

export interface MidiSequence {
  /** 0 (one track) or 1 (several tracks played together). */
  readonly format: 0 | 1;
  /** Ticks per quarter note (MidiSequence.PPQ; SMPTE files are converted at 120 bpm). */
  readonly resolution: number;
  readonly tracks: readonly MidiTrackEvents[];
}

/** True for a note-off: a NOTE_OFF message or a NOTE_ON with velocity 0 (MidiSongReader.isNoteOff). */
export function isNoteOff(event: MidiEvent): boolean {
  if (event.kind !== 'short') {
    return false;
  }
  return event.command === MIDI_COMMAND.NOTE_OFF || (event.command === MIDI_COMMAND.NOTE_ON && event.data2 === 0);
}

/**
 * A format 0 file's single track as format 1 tracks: first everything that is not a channel message, then one track
 * per MIDI channel, lowest channel first. TuxGuitar keeps the one track (all its channels become one guitar track); the
 * import splits it so drums and each instrument get a track of their own. Format 1 sequences are returned unchanged.
 */
export function splitFormat0(sequence: MidiSequence): readonly MidiTrackEvents[] {
  const [track] = sequence.tracks;
  if (sequence.format !== 0 || track === undefined) {
    return sequence.tracks;
  }
  const channels = [...new Set(track.flatMap((event) => (event.kind === 'short' ? [event.channel] : [])))].sort((a, b) => a - b);
  if (channels.length <= 1) {
    return sequence.tracks;
  }
  const others = track.filter((event) => event.kind !== 'short');
  return [others, ...channels.map((channel) => track.filter((event) => event.kind === 'short' && event.channel === channel))];
}
