// Port of TuxGuitar app.tuxguitar.io.midi.MidiSongReader (LGPL-2.1): checkChannels and checkTracks, song channels from the MIDI channels that play notes.
import { DEFAULT_CHANNEL, DEFAULT_PERCUSSION_BANK, DEFAULT_PERCUSSION_CHANNEL } from '../../model/defaults';
import type { Channel } from '../../model/song';
import { createChannelName } from '../common/channels';
import type { TempChannel } from './midi-track-parser';

/** GMChannelRoute: the MIDI channels a song channel was read from. */
interface Route {
  readonly channelId: number;
  readonly channel1: number;
  readonly channel2: number;
}

export interface SongChannels {
  readonly channels: readonly Channel[];
  /** checkTracks: the channel of a track, by track number; undefined for a track that plays no note. */
  readonly channelIdOf: (trackNumber: number) => number | undefined;
}

function isSameSet(a: ReadonlySet<number>, b: ReadonlySet<number> | undefined): boolean {
  return b !== undefined && a.size === b.size && [...a].every((value) => b.has(value));
}

/**
 * The song channel for a MIDI channel. TuxGuitar names it "#<id>"; the import names it after its program, as the
 * Guitar Pro readers do.
 */
function buildChannel(tempChannel: TempChannel, id: number, existing: readonly Channel[]): Channel {
  const isPercussion = tempChannel.channel === DEFAULT_PERCUSSION_CHANNEL;
  return {
    ...DEFAULT_CHANNEL,
    id,
    name: createChannelName(existing, tempChannel.program, isPercussion),
    program: tempChannel.program,
    volume: tempChannel.volume,
    balance: tempChannel.balance,
    bank: isPercussion ? DEFAULT_PERCUSSION_BANK : DEFAULT_CHANNEL.bank,
    isPercussion,
  };
}

/**
 * checkChannels: one song channel per MIDI channel that plays notes, in the order the channels were first used. Two
 * MIDI channels played by exactly the same tracks (as TuxGuitar writes a channel and its bend channel) make one song
 * channel; a third such channel is dropped. checkTracks then gives each track the channel read from its first MIDI
 * channel (the last match wins).
 */
export function buildSongChannels(tempChannels: readonly TempChannel[]): SongChannels {
  const trackSets = tempChannels.map((tempChannel) => new Set(tempChannel.tracks));
  const channels: Channel[] = [];
  const routes: Route[] = [];
  tempChannels.forEach((tempChannel, index) => {
    const tracks = trackSets[index] ?? new Set<number>();
    const isRouted = routes.some((route) => route.channel1 === tempChannel.channel || route.channel2 === tempChannel.channel);
    if (tracks.size === 0 || isRouted) {
      return;
    }
    let channel2 = tempChannel.channel;
    for (let aux = index + 1; aux < tempChannels.length; aux++) {
      const other = tempChannels[aux];
      if (other !== undefined && isSameSet(tracks, trackSets[aux])) {
        if (channel2 === tempChannel.channel) {
          channel2 = other.channel;
        } else {
          trackSets[aux] = new Set();
        }
      }
    }
    const id = channels.length + 1;
    // GMChannelRouter.configureRoutes: percussion always plays on MIDI channel 9
    const isPercussion = tempChannel.channel === DEFAULT_PERCUSSION_CHANNEL;
    routes.push({ channelId: id, channel1: tempChannel.channel, channel2: isPercussion ? DEFAULT_PERCUSSION_CHANNEL : channel2 });
    channels.push(buildChannel(tempChannel, id, channels));
  });
  const channelIdOf = (trackNumber: number): number | undefined => {
    let channelId: number | undefined;
    tempChannels.forEach((tempChannel, index) => {
      if (trackSets[index]?.has(trackNumber) === true) {
        channelId = routes.filter((route) => route.channel1 === tempChannel.channel).pop()?.channelId ?? channelId;
      }
    });
    return channelId;
  };
  return { channels, channelIdOf };
}
