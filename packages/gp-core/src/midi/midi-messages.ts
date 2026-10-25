// Port of TuxGuitar app.tuxguitar.io.midi.MidiSequenceHandlerImpl and MidiMessageUtils (LGPL-2.1): events → bytes.
import { encodeUtf8 } from '../io/text';
import type { ChannelRoute } from './channel-routes';
import { variableLength } from './midi-bytes';
import type { SequenceEvent } from './midi-events';
import type { MidiMessage } from './midi-file';
import { toMidiTick } from './midi-ticks';

const STATUS = { NOTE_OFF: 0x80, NOTE_ON: 0x90, CONTROL_CHANGE: 0xb0, PROGRAM_CHANGE: 0xc0, PITCH_BEND: 0xe0 } as const;
const META = 0xff;
const META_TYPE = { TRACK_NAME: 0x03, TEMPO: 0x51, TIME_SIGNATURE: 0x58 } as const;
const MAX_MIDI_CHANNEL = 15;
/** MIDI clocks per metronome click are 96 / denominator; 8 notated 32nd notes per quarter. */
const CLOCKS_PER_WHOLE = 96;
const THIRTY_SECONDS_PER_QUARTER = 8;

/** MidiMessageUtils.fixChannel: an unrouted channel (-1) ends up on channel 0, as in TuxGuitar. */
function toMidiChannel(channel: number): number {
  return Math.min(MAX_MIDI_CHANNEL, Math.max(0, channel));
}

function meta(type: number, data: readonly number[]): number[] {
  return [META, type, ...variableLength(data.length), ...data];
}

function tempoData(usq: number): number[] {
  return meta(META_TYPE.TEMPO, [(usq >> 16) & 0xff, (usq >> 8) & 0xff, usq & 0xff]);
}

function timeSignatureData(numerator: number, denominator: number): number[] {
  const denominatorPower = Math.round(Math.log2(denominator));
  return meta(META_TYPE.TIME_SIGNATURE, [
    numerator,
    denominatorPower,
    Math.floor(CLOCKS_PER_WHOLE / denominator),
    THIRTY_SECONDS_PER_QUARTER,
  ]);
}

/** The event's status + data bytes added to `messages` at `tick`: one message per MIDI channel it is sent on. */
function addEncoded(messages: MidiMessage[], tick: number, event: SequenceEvent, routes: ReadonlyMap<number, ChannelRoute>): void {
  switch (event.type) {
    case 'tempo':
      messages.push({ tick, data: tempoData(event.usq) });
      return;
    case 'timeSignature':
      messages.push({ tick, data: timeSignatureData(event.numerator, event.denominator) });
      return;
    case 'trackName':
      messages.push({ tick, data: meta(META_TYPE.TRACK_NAME, Array.from(encodeUtf8(event.name))) });
      return;
    default:
      addChannelEvent(messages, tick, event, routes);
  }
}

type ChannelEvent = Exclude<SequenceEvent, { type: 'tempo' | 'timeSignature' | 'trackName' }>;
type VoiceEvent = Extract<ChannelEvent, { type: 'noteOn' | 'noteOff' | 'pitchBend' }>;

/** A channel event's messages; none when its channel has no route. */
function addChannelEvent(messages: MidiMessage[], tick: number, event: ChannelEvent, routes: ReadonlyMap<number, ChannelRoute>): void {
  const route = routes.get(event.channelId);
  if (route === undefined) {
    return;
  }
  switch (event.type) {
    case 'noteOn':
    case 'noteOff':
    case 'pitchBend':
      messages.push({ tick, data: voiceData(event, route) });
      return;
    case 'controlChange':
      for (const channel of routeChannels(route)) {
        messages.push({ tick, data: [STATUS.CONTROL_CHANGE | channel, event.controller, event.value] });
      }
      return;
    case 'programChange':
      for (const channel of routeChannels(route)) {
        messages.push({ tick, data: [STATUS.PROGRAM_CHANGE | channel, event.program] });
      }
  }
}

/** A note or pitch bend on the route's first MIDI channel, or its second (bend mode). */
function voiceData(event: VoiceEvent, route: ChannelRoute): number[] {
  const channel = toMidiChannel(event.bendMode ? route.channel2 : route.channel1);
  switch (event.type) {
    case 'noteOn':
      return [STATUS.NOTE_ON | channel, event.key, event.velocity];
    case 'noteOff':
      return [STATUS.NOTE_OFF | channel, event.key, event.velocity];
    case 'pitchBend':
      return [STATUS.PITCH_BEND | channel, 0, event.value];
  }
}

/** Controllers and programs go to both MIDI channels of a route. */
function routeChannels(route: ChannelRoute): number[] {
  const first = toMidiChannel(route.channel1);
  const second = toMidiChannel(route.channel2);
  return first === second ? [first] : [first, second];
}

/** MidiSequenceHandlerImpl: route and encode events; `origin` (a sequence tick) becomes MIDI file tick 0. */
export function toMidiMessages(
  events: readonly SequenceEvent[],
  routes: ReadonlyMap<number, ChannelRoute>,
  origin: number,
): MidiMessage[] {
  const messages: MidiMessage[] = [];
  for (const event of events) {
    addEncoded(messages, Math.max(0, toMidiTick(event.tick - origin)), event, routes);
  }
  return messages;
}
