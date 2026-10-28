import { type Song, UNROUTED, buildChannelRoutes } from '@gp-editor/core';

/** Where a previewed note sounds: the MIDI channel and program the track's playback uses. */
export interface PreviewSound {
  readonly midiChannel: number;
  readonly program: number;
}

/** How a hovered key or fret sounds: a medium-loud note this long. */
export const PREVIEW_NOTE = { velocity: 95, durationMs: 450 } as const;

/**
 * The track's sound for a preview: its channel's program on the first MIDI channel playback routes it to (the same as
 * while playing, so a preview during playback changes nothing); undefined for a track without a channel.
 */
export function previewSound(song: Song, trackIndex: number): PreviewSound | undefined {
  const track = song.tracks[trackIndex];
  const channel = track === undefined ? undefined : song.channels.find((candidate) => candidate.id === track.channelId);
  const route = channel === undefined ? undefined : buildChannelRoutes(song.channels).get(channel.id);
  if (channel === undefined || route === undefined || route.channel1 === UNROUTED) {
    return undefined;
  }
  return { midiChannel: route.channel1, program: channel.program };
}
