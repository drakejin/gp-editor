// Port of TuxGuitar app.tuxguitar.gm.GMChannelRouter (LGPL-2.1): default routes from song channels to MIDI channels.
import { DEFAULT_PERCUSSION_CHANNEL } from '../model/defaults';
import type { Channel } from '../model/song';

/** GMChannelRoute: the MIDI channels a song channel plays on. */
export interface ChannelRoute {
  readonly channelId: number;
  /** Plain notes, controllers and programs. */
  readonly channel1: number;
  /** Notes with pitch effects (bends, slides, vibrato …), so their pitch bends leave other notes alone. */
  readonly channel2: number;
}

/** GMChannelRoute.NULL_VALUE: no free MIDI channel was left. */
export const UNROUTED = -1;
const MIDI_CHANNEL_COUNT = 16;

function freeChannels(routes: readonly ChannelRoute[]): number[] {
  const used = new Set(routes.flatMap((route) => [route.channel1, route.channel2]));
  return Array.from({ length: MIDI_CHANNEL_COUNT }, (_, channel) => channel).filter(
    (channel) => channel !== DEFAULT_PERCUSSION_CHANNEL && !used.has(channel),
  );
}

function buildRoute(channel: Channel, routes: readonly ChannelRoute[], melodicLeft: number): ChannelRoute {
  if (channel.isPercussion) {
    return { channelId: channel.id, channel1: DEFAULT_PERCUSSION_CHANNEL, channel2: DEFAULT_PERCUSSION_CHANNEL };
  }
  const free = freeChannels(routes);
  const [first, second] = free;
  const channel1 = first ?? UNROUTED;
  // A second (bend) channel only while every melodic channel still to come keeps one of its own.
  const canTakeTwo = free.length - 2 >= melodicLeft;
  return { channelId: channel.id, channel1, channel2: canTakeTwo ? second ?? channel1 : channel1 };
}

/**
 * GMChannelRouterConfigurator.configureRouter without custom routes (the model keeps none of the file's MIDI
 * channel assignments): percussion channels share MIDI channel 9, every other channel takes the next two free
 * MIDI channels in song order. Unlike TuxGuitar, which leaves the 9th melodic channel unrouted (it then plays on
 * MIDI channel 0), channels drop their second channel when that is needed for every channel to get one.
 */
export function buildChannelRoutes(channels: readonly Channel[]): ReadonlyMap<number, ChannelRoute> {
  const melodicIds = [...new Set(channels.filter((channel) => !channel.isPercussion).map((channel) => channel.id))];
  const routes = channels.reduce<readonly ChannelRoute[]>((built, channel) => {
    const others = built.filter((route) => route.channelId !== channel.id);
    const melodicLeft = melodicIds.length - 1 - melodicIds.indexOf(channel.id);
    return [...others, buildRoute(channel, others, melodicLeft)];
  }, []);
  return new Map(routes.map((route) => [route.channelId, route]));
}
