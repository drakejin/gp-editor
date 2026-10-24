// Port of TuxGuitar app.tuxguitar.io.midi.MidiSequenceHandlerImpl and MidiMessageUtils (LGPL-2.1): events → bytes.
import type { ChannelRoute } from './channel-routes';
import { utf8Bytes, variableLength } from './midi-bytes';
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

/** Status + data bytes of an event, one entry per MIDI channel it is sent on (none when its channel has no route). */
function encode(event: SequenceEvent, routes: ReadonlyMap<number, ChannelRoute>): number[][] {
  switch (event.type) {
    case 'tempo':
      return [tempoData(event.usq)];
    case 'timeSignature':
      return [timeSignatureData(event.numerator, event.denominator)];
    case 'trackName':
      return [meta(META_TYPE.TRACK_NAME, utf8Bytes(event.name))];
    default:
      return encodeChannelEvent(event, routes);
  }
}

type ChannelEvent = Exclude<SequenceEvent, { type: 'tempo' | 'timeSignature' | 'trackName' }>;

function encodeChannelEvent(event: ChannelEvent, routes: ReadonlyMap<number, ChannelRoute>): number[][] {
  const route = routes.get(event.channelId);
  if (route === undefined) {
    return [];
  }
  switch (event.type) {
    case 'noteOn':
    case 'noteOff': {
      const status = event.type === 'noteOn' ? STATUS.NOTE_ON : STATUS.NOTE_OFF;
      const channel = toMidiChannel(event.bendMode ? route.channel2 : route.channel1);
      return [[status | channel, event.key, event.velocity]];
    }
    case 'pitchBend':
      return [[STATUS.PITCH_BEND | toMidiChannel(event.bendMode ? route.channel2 : route.channel1), 0, event.value]];
    case 'controlChange':
      return routeChannels(route).map((channel) => [STATUS.CONTROL_CHANGE | channel, event.controller, event.value]);
    case 'programChange':
      return routeChannels(route).map((channel) => [STATUS.PROGRAM_CHANGE | channel, event.program]);
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
    const tick = Math.max(0, toMidiTick(event.tick - origin));
    for (const data of encode(event, routes)) {
      messages.push({ tick, data });
    }
  }
  return messages;
}
