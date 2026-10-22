import { type Song, UNROUTED, buildChannelRoutes } from '@gp-editor/core';

/** A program change for one MIDI channel of the playing song. */
export interface ProgramChange {
  readonly midiChannel: number;
  readonly program: number;
}

/** Channels keep their MIDI channels while their ids, order and percussion flags stay, and tracks keep their channels. */
function hasSameRouting(played: Song, next: Song): boolean {
  const sameChannels =
    played.channels.length === next.channels.length &&
    played.channels.every((channel, index) => channel.id === next.channels[index]?.id && channel.isPercussion === next.channels[index]?.isPercussion);
  const sameTracks =
    played.tracks.length === next.tracks.length && played.tracks.every((track, index) => track.channelId === next.tracks[index]?.channelId);
  return sameChannels && sameTracks;
}

/**
 * The program changes that give the song playing (rendered from `played`) the instruments of `next`, sent live so
 * the change is heard at once; undefined when the MIDI channels themselves changed, which only a restart can follow.
 */
export function liveProgramChanges(played: Song, next: Song): readonly ProgramChange[] | undefined {
  if (!hasSameRouting(played, next)) {
    return undefined;
  }
  const routes = buildChannelRoutes(next.channels);
  return next.channels.flatMap((channel, index) => {
    const route = routes.get(channel.id);
    if (channel.isPercussion || channel.program === played.channels[index]?.program || route === undefined) {
      return [];
    }
    const midiChannels = [...new Set([route.channel1, route.channel2])].filter((midiChannel) => midiChannel !== UNROUTED);
    return midiChannels.map((midiChannel) => ({ midiChannel, program: channel.program }));
  });
}
