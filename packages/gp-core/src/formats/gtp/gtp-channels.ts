// Port of TuxGuitar app.tuxguitar.io.gtp.GP3InputStream/GP4InputStream/GP5InputStream shared parts (LGPL-2.1): the 64 MIDI channel settings of the file header and the song channels tracks name.
import type { ByteReader } from '../../io/byte-reader';
import { DEFAULT_PERCUSSION_BANK, DEFAULT_PERCUSSION_CHANNEL } from '../../model/defaults';
import type { Channel } from '../../model/song';
import { createChannelName } from '../common/channels';

const GTP_CHANNEL_COUNT = 64;

/** One of the 64 MIDI channel settings stored in the file header. */
export type ChannelSlot = Omit<Channel, 'id' | 'name'>;

function toChannelValue(value: number): number {
  return Math.max(value * 8 - 1, 0);
}

export function readChannelSlots(reader: ByteReader): readonly ChannelSlot[] {
  return Array.from({ length: GTP_CHANNEL_COUNT }, (_, index) => {
    const program = reader.readInt();
    const [volume, balance, chorus, reverb, phaser, tremolo] = Array.from({ length: 6 }, () =>
      toChannelValue(reader.readByte()),
    );
    reader.skip(2);
    const bank = index === DEFAULT_PERCUSSION_CHANNEL ? DEFAULT_PERCUSSION_BANK : 0;
    return {
      program: Math.max(0, program),
      bank,
      volume: volume ?? 0,
      balance: balance ?? 0,
      chorus: chorus ?? 0,
      reverb: reverb ?? 0,
      phaser: phaser ?? 0,
      tremolo: tremolo ?? 0,
      isPercussion: bank === DEFAULT_PERCUSSION_BANK,
    };
  });
}

/** Song channels created so far, with the GM channel (0-based) each was made for. */
export interface ChannelRegistry {
  readonly channels: readonly Channel[];
  /** Channel id → GM channel 1 (TuxGuitar's PARAMETER_GM_CHANNEL_1). */
  readonly gmChannels: ReadonlyMap<number, number>;
}

export const EMPTY_REGISTRY: ChannelRegistry = { channels: [], gmChannels: new Map() };

/** TGTrack's channel id when the file names no valid channel. */
const NO_CHANNEL = -1;

/**
 * Tracks on the same GM channel share one song channel (TuxGuitar's readChannel).
 * The port number is ignored, as in TuxGuitar: channel N of any port uses slot N.
 */
function assignChannel(
  registry: ChannelRegistry,
  slots: readonly ChannelSlot[],
  gmChannel: number,
): { readonly registry: ChannelRegistry; readonly channelId: number } {
  const slot = gmChannel >= 0 ? slots[gmChannel] : undefined;
  if (slot === undefined) {
    return { registry, channelId: NO_CHANNEL };
  }
  const existing = [...registry.gmChannels].filter(([, gm]) => gm === gmChannel).pop();
  if (existing !== undefined) {
    return { registry, channelId: existing[0] };
  }
  const id = registry.channels.length + 1;
  const channel: Channel = { id, name: createChannelName(registry.channels, slot.program, slot.isPercussion), ...slot };
  return {
    registry: { channels: [...registry.channels, channel], gmChannels: new Map([...registry.gmChannels, [id, gmChannel]]) },
    channelId: id,
  };
}

/** Reads the two GM channel numbers of a track and assigns its song channel. */
export function readTrackChannel(
  reader: ByteReader,
  slots: readonly ChannelSlot[],
  registry: ChannelRegistry,
): { readonly registry: ChannelRegistry; readonly channelId: number; readonly isPercussion: boolean } {
  const gmChannel = reader.readInt() - 1;
  reader.readInt(); // effect channel (TuxGuitar's GM channel 2) — no place in the model
  const assigned = assignChannel(registry, slots, gmChannel);
  const channel = assigned.registry.channels.find((candidate) => candidate.id === assigned.channelId);
  return { ...assigned, isPercussion: channel?.isPercussion ?? false };
}
