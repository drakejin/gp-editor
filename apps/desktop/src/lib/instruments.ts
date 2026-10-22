import { GM_INSTRUMENT_NAMES, type Song } from '@gp-editor/core';

export interface TrackInstrument {
  /** General MIDI program 0–127 of the track's channel. */
  readonly program: number;
  readonly name: string;
  readonly isPercussion: boolean;
}

/** What a track sounds like: its channel's General MIDI instrument, or drums. Undefined without track or channel. */
export function trackInstrument(song: Song, trackIndex: number): TrackInstrument | undefined {
  const track = song.tracks[trackIndex];
  const channel = song.channels.find((candidate) => candidate.id === track?.channelId);
  if (track === undefined || channel === undefined) {
    return undefined;
  }
  const isPercussion = track.isPercussion || channel.isPercussion;
  const name = isPercussion ? 'Drums' : GM_INSTRUMENT_NAMES[channel.program] ?? `Program ${channel.program + 1}`;
  return { program: channel.program, name, isPercussion };
}
