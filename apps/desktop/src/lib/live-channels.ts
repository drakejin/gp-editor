import { type Channel, type Song, UNROUTED, buildChannelRoutes } from '@gp-editor/core';

/** MIDI controllers the mixer changes live. */
export const MIDI_CONTROLLER = { volume: 7, pan: 10 } as const;

/** A program change or a control change for a channel. */
type ChannelChange =
  | { readonly kind: 'program'; readonly value: number }
  | { readonly kind: 'controller'; readonly controller: number; readonly value: number };

/** A change sent to one MIDI channel of the playing song. */
export type LiveChange = ChannelChange & { readonly midiChannel: number };

/** Channels keep their MIDI channels while their ids, order and percussion flags stay, and tracks keep their channels. */
function hasSameRouting(played: Song, next: Song): boolean {
  const sameChannels =
    played.channels.length === next.channels.length &&
    played.channels.every((channel, index) => channel.id === next.channels[index]?.id && channel.isPercussion === next.channels[index]?.isPercussion);
  const sameTracks =
    played.tracks.length === next.tracks.length && played.tracks.every((track, index) => track.channelId === next.tracks[index]?.channelId);
  return sameChannels && sameTracks;
}

/** Mute and solo decide which tracks the rendered song holds at all. */
export function hasSameMuteAndSolo(played: Song, next: Song): boolean {
  return played.tracks.every((track, index) => track.mute === next.tracks[index]?.mute && track.solo === next.tracks[index]?.solo);
}

function channelChanges(played: Channel | undefined, next: Channel): readonly ChannelChange[] {
  return [
    ...(!next.isPercussion && next.program !== played?.program ? [{ kind: 'program' as const, value: next.program }] : []),
    ...(next.volume !== played?.volume ? [{ kind: 'controller' as const, controller: MIDI_CONTROLLER.volume, value: next.volume }] : []),
    ...(next.balance !== played?.balance ? [{ kind: 'controller' as const, controller: MIDI_CONTROLLER.pan, value: next.balance }] : []),
  ];
}

/**
 * The changes that give the song playing (rendered from `played`) the instruments, volumes and pans of `next`, sent
 * live so they are heard at once; undefined when only a restart can follow — the MIDI channels changed, or a track was
 * muted, unmuted, soloed or unsoloed.
 */
export function liveChannelChanges(played: Song, next: Song): readonly LiveChange[] | undefined {
  if (!hasSameRouting(played, next) || !hasSameMuteAndSolo(played, next)) {
    return undefined;
  }
  const routes = buildChannelRoutes(next.channels);
  return next.channels.flatMap((channel, index) => {
    const route = routes.get(channel.id);
    if (route === undefined) {
      return [];
    }
    const midiChannels = [...new Set([route.channel1, route.channel2])].filter((midiChannel) => midiChannel !== UNROUTED);
    return channelChanges(played.channels[index], channel).flatMap((change) =>
      midiChannels.map((midiChannel): LiveChange => ({ ...change, midiChannel })),
    );
  });
}
