import { describe, expect, it } from 'vitest';
import { setNoteFret } from '../src/edit/edit-song';
import { isIdentityTrackMap, matchTrackIndexes, remapTrackIndex, remapTrackIndexes } from '../src/edit/track-index-map';
import { addTrack, deleteTrack, duplicateTrack, moveTrack } from '../src/edit/tracks';
import type { Song } from '../src/model/song';
import { buildSong, deepFreeze, n, play } from './helpers/edit-songs';

function threeTracks(): Song {
  return deepFreeze(buildSong({ tracks: [[[[play(1, n(1, 5))]]], [[[play(1, n(2, 7))]]], [[[play(1, n(3, 9))]]]] }));
}

describe('remapTrackIndex', () => {
  it('reads where a track went, and undefined for a deleted track or one the map does not hold', () => {
    const map = [0, undefined, 1];
    expect(remapTrackIndex(map, 0)).toBe(0);
    expect(remapTrackIndex(map, 1)).toBeUndefined();
    expect(remapTrackIndex(map, 2)).toBe(1);
    expect(remapTrackIndex(map, 7)).toBeUndefined();
  });
});

describe('remapTrackIndexes', () => {
  it('follows a list of tracks, leaving the deleted ones out, in the order of their new places', () => {
    expect(remapTrackIndexes([2, 0, 1], [0, 2])).toEqual([1, 2]);
    expect(remapTrackIndexes([0, undefined, 1], [2, 1, 0])).toEqual([0, 1]);
    expect(remapTrackIndexes([0, 1], [])).toEqual([]);
  });
});

describe('isIdentityTrackMap', () => {
  it('tells a map that moves nothing from one that adds, deletes or moves a track', () => {
    expect(isIdentityTrackMap([0, 1, 2], 3)).toBe(true);
    expect(isIdentityTrackMap([0, 1, 2], 4)).toBe(false);
    expect(isIdentityTrackMap([0, undefined, 1], 2)).toBe(false);
    expect(isIdentityTrackMap([1, 0], 2)).toBe(false);
  });
});

describe('matchTrackIndexes', () => {
  it('maps every track to itself when the tracks did not change, or one track’s notes did', () => {
    // Arrange
    const song = threeTracks();
    const edited = setNoteFret(song, { trackIndex: 1, measureIndex: 0, beatIndex: 0, voiceIndex: 0, string: 2 }, 3);

    // Act / Assert
    expect(matchTrackIndexes(song, song)).toEqual([0, 1, 2]);
    expect(matchTrackIndexes(song, edited)).toEqual([0, 1, 2]);
  });

  it('follows a deleted, moved, added or duplicated track, and back for undo', () => {
    // Arrange
    const song = threeTracks();
    const deleted = deleteTrack(song, 1);
    const moved = moveTrack(song, 0, 2);
    const added = addTrack(song, { kind: 'bass' });
    const duplicated = duplicateTrack(song, 0);

    // Act / Assert
    expect(matchTrackIndexes(song, deleted)).toEqual([0, undefined, 1]);
    expect(matchTrackIndexes(deleted, song)).toEqual([0, 2]);
    expect(matchTrackIndexes(song, moved)).toEqual([2, 0, 1]);
    expect(matchTrackIndexes(moved, song)).toEqual([1, 2, 0]);
    expect(matchTrackIndexes(song, added)).toEqual([0, 1, 2]);
    expect(matchTrackIndexes(added, song)).toEqual([0, 1, 2, undefined]);
    expect(matchTrackIndexes(song, duplicated)).toEqual([0, 2, 3]);
    expect(matchTrackIndexes(duplicated, song)).toEqual([0, undefined, 1, 2]);
  });

  it('matches tracks that share one measures list one to one', () => {
    // Arrange
    const song = threeTracks();
    const shared = song.tracks[0]?.measures ?? [];
    const twins: Song = { ...song, tracks: song.tracks.map((track) => ({ ...track, measures: shared })) };

    // Act / Assert
    expect(matchTrackIndexes(twins, { ...twins, tracks: twins.tracks.slice(1) })).toEqual([0, 1, undefined]);
  });
});
