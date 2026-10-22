import { describe, expect, it } from 'vitest';
import { MAX_CAPO, setTrackCapo, setTrackName } from '../src/edit/track-properties';
import type { Song } from '../src/model/song';
import { buildSong, deepFreeze, n, play } from './helpers/edit-songs';

/** Two guitar tracks, fret 5 on string 1 in the first. */
function twoTracks(): Song {
  return deepFreeze(buildSong({ tracks: [[[[play(1, n(1, 5))]]], [[[play(1, n(2, 0))]]]] }));
}

describe('setTrackName', () => {
  it('renames the track, trimmed', () => {
    // Arrange
    const song = twoTracks();

    // Act
    const edited = setTrackName(song, 1, '  Bass  ');

    // Assert
    expect(edited.tracks[1]?.name).toBe('Bass');
    expect(edited.tracks[0]).toBe(song.tracks[0]);
    expect(song.tracks[1]?.name).toBe('Track 2');
  });

  it('returns the same song for the same name, a blank name or a missing track', () => {
    const song = twoTracks();
    expect(setTrackName(song, 0, 'Track 1')).toBe(song);
    expect(setTrackName(song, 0, '   ')).toBe(song);
    expect(setTrackName(song, 0, '')).toBe(song);
    expect(setTrackName(song, 3, 'Lead')).toBe(song);
  });
});

describe('setTrackCapo', () => {
  it('puts a capo on the track and keeps the frets as written', () => {
    // Arrange
    const song = twoTracks();

    // Act
    const edited = setTrackCapo(song, 0, 3);

    // Assert
    expect(edited.tracks[0]?.offset).toBe(3);
    expect(edited.tracks[0]?.measures).toBe(song.tracks[0]?.measures);
    expect(edited.tracks[1]).toBe(song.tracks[1]);
  });

  it('keeps the capo on frets 0…24, rounded', () => {
    expect(MAX_CAPO).toBe(24);
    expect(setTrackCapo(twoTracks(), 0, 30).tracks[0]?.offset).toBe(24);
    expect(setTrackCapo(twoTracks(), 0, -2).tracks[0]?.offset).toBe(0);
    expect(setTrackCapo(twoTracks(), 0, 2.6).tracks[0]?.offset).toBe(3);
  });

  it('returns the same song for the same capo, a capo that is not a number, a missing track or a percussion track', () => {
    const song = twoTracks();
    expect(setTrackCapo(song, 0, 0)).toBe(song);
    expect(setTrackCapo(song, 0, Number.NaN)).toBe(song);
    expect(setTrackCapo(song, 5, 2)).toBe(song);
    const drums = deepFreeze({ ...song, tracks: song.tracks.map((track) => ({ ...track, isPercussion: true })) });
    expect(setTrackCapo(drums, 0, 2)).toBe(drums);
  });
});
