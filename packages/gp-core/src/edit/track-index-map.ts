import type { Song } from '../model/song';

/**
 * Where each track of a song went after an edit of its tracks (added, deleted, duplicated, moved): `map[oldIndex]` is
 * the track's new index, undefined when it was deleted. Anything that holds a track index follows it with remapTrackIndex.
 */
export type TrackIndexMap = readonly (number | undefined)[];

/** The track's index after the edit `map` describes; undefined when it was deleted (or the map does not hold it). */
export function remapTrackIndex(map: TrackIndexMap, trackIndex: number): number | undefined {
  return map[trackIndex];
}

/** A list of track indexes after the edit: the deleted ones left out, the rest in the order of their new places. */
export function remapTrackIndexes(map: TrackIndexMap, trackIndexes: readonly number[]): readonly number[] {
  return trackIndexes.flatMap((trackIndex) => remapTrackIndex(map, trackIndex) ?? []).sort((a, b) => a - b);
}

/** True when `map` leaves every one of `trackCount` tracks where it was (nothing added, deleted or moved). */
export function isIdentityTrackMap(map: TrackIndexMap, trackCount: number): boolean {
  return map.length === trackCount && map.every((trackIndex, oldIndex) => trackIndex === oldIndex);
}

/**
 * How the tracks of `before` map onto those of `after`, one step of the undo history apart. Track edits keep a track's
 * list of measures (the same array object) wherever the track goes, while a new or duplicated track gets a new one; so a
 * track is found by that list — at its own index first — and a track whose notes changed (a new list) stays at its index
 * when no other track took that index (the same number of tracks, or tracks added after the last one in the same step,
 * as Compose from Here does). Each track of `after` is matched once.
 */
export function matchTrackIndexes(before: Song, after: Song): TrackIndexMap {
  const used = new Set<number>();
  const take = (index: number): number => {
    used.add(index);
    return index;
  };
  const atOwnIndex = before.tracks.map((track, index) => (after.tracks[index]?.measures === track.measures ? take(index) : undefined));
  const byMeasures = atOwnIndex.map((matched, index) => {
    const measures = before.tracks[index]?.measures;
    const found = after.tracks.findIndex((track, candidate) => !used.has(candidate) && track.measures === measures);
    return matched ?? (found < 0 ? undefined : take(found));
  });
  return byMeasures.map((matched, index) => matched ?? (index < after.tracks.length && !used.has(index) ? take(index) : undefined));
}
