import { describe, expect, it } from 'vitest';
import { setTrackProgram } from '../src/edit/track-sound';
import { GM_INSTRUMENT_FAMILIES, GM_INSTRUMENT_NAMES, gmFamilyIndex } from '../src/formats/common/channels';
import type { Channel, Song } from '../src/model/song';
import { readSong } from '../src/read-song';
import { writeSong } from '../src/write';
import { buildSong, deepFreeze, n, play } from './helpers/edit-songs';
import { loadFixture } from './helpers/fixtures';

/** Two tracks; `shared` makes both use channel 1. */
function twoTracks(shared: boolean): Song {
  const song = buildSong({ tracks: [[[[play(4, n(1, 0))]]], [[[play(4, n(1, 2))]]]] });
  const channel: Channel = { ...(song.channels[0] as Channel), id: 1 };
  const channels = shared ? [channel] : [channel, { ...channel, id: 2, name: 'Other' }];
  const tracks = song.tracks.map((track, index) => ({ ...track, channelId: shared ? 1 : index + 1 }));
  return deepFreeze({ ...song, channels, tracks });
}

describe('General MIDI sound names', () => {
  it('groups the 128 programs into 16 families of 8', () => {
    expect(GM_INSTRUMENT_NAMES).toHaveLength(128);
    expect(GM_INSTRUMENT_FAMILIES).toHaveLength(16);
    expect(GM_INSTRUMENT_FAMILIES[3]).toBe('Guitar');
    expect(gmFamilyIndex(30)).toBe(3);
    expect(gmFamilyIndex(0)).toBe(0);
    expect(gmFamilyIndex(127)).toBe(15);
  });
});

describe('setTrackProgram', () => {
  it('changes the program of the track’s own channel', () => {
    // Arrange
    const song = twoTracks(false);

    // Act
    const edited = setTrackProgram(song, 0, 30);

    // Assert
    expect(edited.channels.find((channel) => channel.id === 1)?.program).toBe(30);
    expect(edited.channels.find((channel) => channel.id === 2)).toEqual(song.channels[1]);
    expect(edited.tracks).toBe(song.tracks);
  });

  it('gives the track a channel of its own when another track shares it, leaving that track’s sound alone', () => {
    // Arrange
    const song = twoTracks(true);

    // Act
    const edited = setTrackProgram(song, 1, 30);

    // Assert
    const own = edited.channels.find((channel) => channel.id === edited.tracks[1]?.channelId);
    expect(edited.tracks[1]?.channelId).not.toBe(1);
    expect(own).toMatchObject({ program: 30, volume: song.channels[0]?.volume, isPercussion: false });
    expect(edited.channels.find((channel) => channel.id === 1)).toEqual(song.channels[0]);
    expect(edited.tracks[0]).toBe(song.tracks[0]);
  });

  it('returns the same song for the same program, a program outside 0–127 or a missing track', () => {
    const song = twoTracks(false);
    const current = song.channels[0]?.program ?? 0;
    expect(setTrackProgram(song, 0, current)).toBe(song);
    expect(setTrackProgram(song, 0, 128)).toBe(song);
    expect(setTrackProgram(song, 0, -1)).toBe(song);
    expect(setTrackProgram(song, 0, 2.5)).toBe(song);
    expect(setTrackProgram(song, 5, 30)).toBe(song);
  });

  it('keeps the program through a GP5 save, and leaves percussion tracks alone', () => {
    // Arrange
    const song = readSong(loadFixture('guitarpro5', 'nightwish.gp5'));
    const drums = song.tracks.findIndex((track) => track.isPercussion);

    // Act
    const saved = readSong(writeSong(setTrackProgram(song, 0, 30), 'gp5'));

    // Assert
    expect(saved.channels.find((channel) => channel.id === saved.tracks[0]?.channelId)?.program).toBe(30);
    expect(setTrackProgram(song, drums, 16)).toBe(song);
  });
});
