import type { Song } from '@gp-editor/core';
import type { PlayingBeat } from '../score/row';

/** The beat of the track sounding at a song position: the last beat starting at or before `tick` in that measure. */
export function playingBeatAt(song: Song, trackIndex: number, position: { readonly headerIndex: number; readonly tick: number }): PlayingBeat | undefined {
  const beats = song.tracks[trackIndex]?.measures[position.headerIndex]?.beats ?? [];
  let beatIndex = -1;
  beats.forEach((beat, index) => {
    if (beat.start <= position.tick) {
      beatIndex = index;
    }
  });
  return beatIndex < 0 ? undefined : { measureIndex: position.headerIndex, beatIndex };
}

export function samePlayingBeat(a: PlayingBeat | undefined, b: PlayingBeat | undefined): boolean {
  return a?.measureIndex === b?.measureIndex && a?.beatIndex === b?.beatIndex;
}

/** The playing beat of each shown track (the multitrack view), by track index. */
export type PlayingTracks = Readonly<Record<number, PlayingBeat | undefined>>;

/** Each track's beat sounding at a song position. */
export function playingTracksAt(song: Song, trackIndexes: readonly number[], position: { readonly headerIndex: number; readonly tick: number }): PlayingTracks {
  return Object.fromEntries(trackIndexes.map((trackIndex) => [trackIndex, playingBeatAt(song, trackIndex, position)]));
}

export function samePlayingTracks(a: PlayingTracks | undefined, b: PlayingTracks | undefined): boolean {
  const keys = Object.keys(a ?? {});
  return keys.length === Object.keys(b ?? {}).length && keys.every((key) => samePlayingBeat(a?.[Number(key)], b?.[Number(key)]));
}
