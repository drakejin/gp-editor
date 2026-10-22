import { describe, expect, it } from 'vitest';
import { setTrackBalance, setTrackMute, setTrackProgram, setTrackSolo, setTrackVolume } from '../src/edit/track-sound';
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

  it('names the copied channel after its program, keeping the other mixer values', () => {
    // Arrange
    const song = twoTracks(true);

    // Act
    const edited = setTrackProgram(song, 0, 0);

    // Assert
    const own = edited.channels.find((channel) => channel.id === edited.tracks[0]?.channelId);
    expect(own).toMatchObject({ id: 2, name: 'Acoustic Grand Piano 1', program: 0, balance: 64 });
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

function channelOf(song: Song, trackIndex: number): Channel | undefined {
  return song.channels.find((channel) => channel.id === song.tracks[trackIndex]?.channelId);
}

describe.each([
  ['setTrackVolume', setTrackVolume, 'volume'],
  ['setTrackBalance', setTrackBalance, 'balance'],
] as const)('%s', (_name, setValue, field) => {
  it(`sets the ${field} of the track’s own channel, rounded`, () => {
    // Arrange
    const song = twoTracks(false);

    // Act
    const edited = setValue(song, 1, 99.6);

    // Assert
    expect(channelOf(edited, 1)?.[field]).toBe(100);
    expect(edited.channels[0]).toBe(song.channels[0]);
    expect(edited.tracks).toBe(song.tracks);
  });

  it(`keeps the ${field} in 0…127`, () => {
    expect(channelOf(setValue(twoTracks(false), 0, -5), 0)?.[field]).toBe(0);
    expect(channelOf(setValue(twoTracks(false), 0, 300), 0)?.[field]).toBe(127);
  });

  it('gives the track a copy of a channel another track shares, as setTrackProgram does', () => {
    // Arrange
    const song = twoTracks(true);

    // Act
    const edited = setValue(song, 1, 20);

    // Assert
    expect(edited.tracks[1]?.channelId).toBe(2);
    expect(channelOf(edited, 1)).toMatchObject({ id: 2, name: 'Steel String Acoustic Guitar 1', [field]: 20, program: 25 });
    expect(channelOf(edited, 0)).toEqual(song.channels[0]);
  });

  it('works on a percussion track too', () => {
    // Arrange
    const song = readSong(loadFixture('guitarpro5', 'nightwish.gp5'));
    const drums = song.tracks.findIndex((track) => track.isPercussion);

    // Act
    const edited = setValue(song, drums, 40);

    // Assert
    expect(channelOf(edited, drums)?.[field]).toBe(40);
  });

  it('returns the same song for the same value, a value that is not a number, or a track or channel that is missing', () => {
    const song = twoTracks(false);
    const current = song.channels[0]?.[field] ?? 0;
    expect(setValue(song, 0, current)).toBe(song);
    expect(setValue(song, 0, Number.NaN)).toBe(song);
    expect(setValue(song, 4, 20)).toBe(song);
    const withoutChannels: Song = { ...song, channels: [] };
    expect(setValue(withoutChannels, 0, 20)).toBe(withoutChannels);
  });
});

describe('setTrackMute and setTrackSolo', () => {
  it('mutes and unmutes a track', () => {
    // Arrange
    const song = twoTracks(false);

    // Act
    const muted = setTrackMute(song, 1, true);

    // Assert
    expect(muted.tracks[1]).toMatchObject({ mute: true, solo: false });
    expect(muted.tracks[0]).toBe(song.tracks[0]);
    expect(setTrackMute(muted, 1, false).tracks[1]?.mute).toBe(false);
  });

  it('turns solo off when the track is muted, and mute off when it plays solo (TGTrackManager.changeMute / changeSolo)', () => {
    const soloed = setTrackSolo(twoTracks(false), 0, true);
    expect(soloed.tracks[0]).toMatchObject({ mute: false, solo: true });
    const muted = setTrackMute(soloed, 0, true);
    expect(muted.tracks[0]).toMatchObject({ mute: true, solo: false });
    expect(setTrackSolo(muted, 0, true).tracks[0]).toMatchObject({ mute: false, solo: true });
  });

  it('returns the same song when nothing changes or the track is missing', () => {
    const song = twoTracks(false);
    expect(setTrackMute(song, 0, false)).toBe(song);
    expect(setTrackSolo(song, 0, false)).toBe(song);
    expect(setTrackMute(song, 2, true)).toBe(song);
    expect(setTrackSolo(song, -1, true)).toBe(song);
  });
});
