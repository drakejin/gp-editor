// Port of TuxGuitar GP5OutputStream#makeChannels / GTPOutputStream#getChannelRoute (LGPL-2.1): song channels → the 64 GM channel slots.
import { buildChannelRoutes, type ChannelRoute } from '../midi/channel-routes';
import type { Channel } from '../model/song';
import type { ByteWriter } from './byte-writer';
import { channelValueToGp } from './gp-units';

const SLOT_COUNT = 64;
const CHANNELS_PER_PORT = 16;
const PERCUSSION_SLOT_IN_PORT = 9;
/** TuxGuitar's getChannelRoute fallback for a channel without a MIDI channel of its own. */
const FALLBACK_GM_CHANNEL = 15;

/** One of the 64 channel settings in a GP3–GP5 header, in file units (bytes 0…16 for the mixer values). */
interface Slot {
  readonly program: number;
  readonly volume: number;
  readonly balance: number;
  readonly chorus: number;
  readonly reverb: number;
  readonly phaser: number;
  readonly tremolo: number;
}

/** Guitar Pro's empty slot: steel-string guitar (drums on channel 10), volume 13, pan 8 (centre). */
function defaultSlot(index: number): Slot {
  const program = index % CHANNELS_PER_PORT === PERCUSSION_SLOT_IN_PORT ? 0 : 25;
  return { program, volume: 13, balance: 8, chorus: 0, reverb: 0, phaser: 0, tremolo: 0 };
}

function slotOf(channel: Channel): Slot {
  return {
    program: channel.program,
    volume: channelValueToGp(channel.volume),
    balance: channelValueToGp(channel.balance),
    chorus: channelValueToGp(channel.chorus),
    reverb: channelValueToGp(channel.reverb),
    phaser: channelValueToGp(channel.phaser),
    tremolo: channelValueToGp(channel.tremolo),
  };
}

/** The GM channels (0-based) a track on a song channel names in the file. */
export interface TrackChannels {
  readonly channel1: number;
  readonly channel2: number;
}

export interface ChannelTable {
  readonly slots: readonly Slot[];
  readonly routes: ReadonlyMap<number, ChannelRoute>;
}

/**
 * Routes every song channel to its own GM channel (percussion on channel 10, as the readers expect) and
 * fills the slots it uses — the effect channel too — with its settings. The readers rebuild the song
 * channels from these slots, in the order the tracks first use them. When channels have to share a slot
 * (more than 15 melodic ones, or several percussion ones), the first keeps its settings.
 */
export function buildChannelTable(channels: readonly Channel[]): ChannelTable {
  const routes = buildChannelRoutes(channels);
  const slots = Array.from({ length: SLOT_COUNT }, (_, index) => defaultSlot(index));
  const claimed = new Set<number>();
  for (const channel of channels) {
    const route = trackChannels({ slots, routes }, channel.id);
    for (const slot of [route.channel1, route.channel2].filter((index) => !claimed.has(index))) {
      slots[slot] = slotOf(channel);
      claimed.add(slot);
    }
  }
  return { slots, routes };
}

/** GTPOutputStream#getChannelRoute: a channel that got no MIDI channel (more than 15) falls back to channel 16. */
export function trackChannels(table: ChannelTable, channelId: number): TrackChannels {
  const route = table.routes.get(channelId);
  if (route === undefined || route.channel1 < 0 || route.channel2 < 0) {
    const channel = route !== undefined && route.channel1 >= 0 ? route.channel1 : FALLBACK_GM_CHANNEL;
    return { channel1: channel, channel2: channel };
  }
  return { channel1: route.channel1, channel2: route.channel2 };
}

/** The 64 slots: program (int), six mixer bytes, two blank bytes. */
export function writeChannelTable(writer: ByteWriter, table: ChannelTable): void {
  for (const slot of table.slots) {
    writer
      .writeInt(slot.program)
      .writeBytes([slot.volume, slot.balance, slot.chorus, slot.reverb, slot.phaser, slot.tremolo])
      .skipBytes(2);
  }
}
