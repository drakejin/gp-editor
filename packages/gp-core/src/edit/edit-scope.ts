// What an edit over many notes takes (Tools ▸ Transpose…, AI Edit's easy fingering): the song, one track, or a run of
// beats in one voice of one track.
import type { Song, Track } from '../model/song';
import type { BeatAddress } from './addresses';

/** What moves: the whole song, one track, or the beats from one address to another (either order) in one voice of one track. */
export type NoteScope =
  | { readonly kind: 'song' }
  | { readonly kind: 'track'; readonly trackIndex: number }
  | { readonly kind: 'beats'; readonly from: BeatAddress; readonly to: BeatAddress };

/** One track's part of a scope. */
export interface ScopedTrack {
  /** True when the notes of this voice of this beat are in the scope. */
  readonly includes: (measureIndex: number, beatIndex: number, voiceIndex: number) => boolean;
  /** True when this beat is in the scope (in any voice). */
  readonly includesBeat: (measureIndex: number, beatIndex: number) => boolean;
  /** The whole track (a song or track scope), not a run of its beats. */
  readonly isWhole: boolean;
}

const WHOLE_TRACK: ScopedTrack = { includes: () => true, includesBeat: () => true, isWhole: true };

/** A drum track: its own flag, or a channel on the percussion bank. */
export function isPercussionTrack(song: Song, track: Track): boolean {
  return track.isPercussion || song.channels.some((channel) => channel.id === track.channelId && channel.isPercussion);
}

function beatOrder(at: Pick<BeatAddress, 'measureIndex' | 'beatIndex'>): readonly [number, number] {
  return [at.measureIndex, at.beatIndex];
}

function isAtOrAfter(measureIndex: number, beatIndex: number, [m, b]: readonly [number, number]): boolean {
  return measureIndex > m || (measureIndex === m && beatIndex >= b);
}

function beatRun(from: BeatAddress, to: BeatAddress): ScopedTrack {
  const [first, last] = isAtOrAfter(to.measureIndex, to.beatIndex, beatOrder(from)) ? [from, to] : [to, from];
  const includesBeat = (measureIndex: number, beatIndex: number) =>
    isAtOrAfter(measureIndex, beatIndex, beatOrder(first)) && !isAtOrAfter(measureIndex, beatIndex - 1, beatOrder(last));
  const includes = (measureIndex: number, beatIndex: number, voiceIndex: number) => voiceIndex === from.voiceIndex && includesBeat(measureIndex, beatIndex);
  return { includes, includesBeat, isWhole: false };
}

/**
 * The tracks a scope touches and, per track, which beats and voices; undefined for a scope that names no track (a
 * missing track, a run of beats across tracks). Drum tracks are among them: what an edit does to drums is its own.
 */
export function scopedTracks(song: Song, scope: NoteScope): ReadonlyMap<number, ScopedTrack> | undefined {
  if (scope.kind === 'song') {
    return new Map(song.tracks.map((_, trackIndex) => [trackIndex, WHOLE_TRACK]));
  }
  if (scope.kind === 'track') {
    return song.tracks[scope.trackIndex] === undefined ? undefined : new Map([[scope.trackIndex, WHOLE_TRACK]]);
  }
  const { from, to } = scope;
  if (from.trackIndex !== to.trackIndex || song.tracks[from.trackIndex] === undefined) {
    return undefined;
  }
  return new Map([[from.trackIndex, beatRun(from, to)]]);
}
