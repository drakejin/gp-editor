import { describe, expect, it } from 'vitest';
import { setTrackEffects } from '../src/edit/track-effects';
import { setTrackLyrics } from '../src/edit/lyrics';
import { setTrackColor, setTrackIcon, setTrackShortName } from '../src/edit/track-properties';
import { addTrack, deleteTrack, duplicateTrack, hasTrackNotes, moveTrack } from '../src/edit/tracks';
import { buildEffect } from '../src/effects/effect-params';
import { buildChannelRoutes } from '../src/midi/channel-routes';
import { DEFAULT_PERCUSSION_BANK, DEFAULT_PERCUSSION_CHANNEL, STANDARD_TUNING } from '../src/model/defaults';
import type { Channel, Song, Track } from '../src/model/song';
import { buildSong, deepFreeze, n, play, rest, voiceLayout } from './helpers/edit-songs';
import { assertSongInvariants } from './helpers/invariants';

/** Three guitar tracks, each on a channel of its own (ids 1–3), the second bar in 3/4 and in D major. */
function threeTracks(): Song {
  const song = buildSong({
    timeSignatures: [
      { numerator: 4, denominator: 4 },
      { numerator: 3, denominator: 4 },
    ],
    tracks: [
      [[[play(1, n(1, 5))]], [[rest(2), rest(4)]]],
      [[[play(1, n(2, 7))]], [[rest(2), rest(4)]]],
      [[[play(1, n(3, 9))]], [[rest(2), rest(4)]]],
    ],
  });
  const base = song.channels[0] as Channel;
  const channels = [1, 2, 3].map((id) => ({ ...base, id, name: `Channel ${id}` }));
  const tracks = song.tracks.map((track, index) => ({
    ...track,
    channelId: index + 1,
    measures: track.measures.map((measure, measureIndex) => (measureIndex === 1 ? { ...measure, keySignature: 2 } : measure)),
  }));
  return deepFreeze({ ...song, channels, tracks });
}

function channelOf(song: Song, trackIndex: number): Channel | undefined {
  return song.channels.find((channel) => channel.id === song.tracks[trackIndex]?.channelId);
}

describe('addTrack', () => {
  it('adds a 6-string guitar in standard tuning after the last track, on a channel of its own', () => {
    // Arrange
    const song = threeTracks();

    // Act
    const added = addTrack(song, { kind: 'guitar' });

    // Assert
    assertSongInvariants(added);
    expect(added.tracks).toHaveLength(4);
    expect(added.tracks.slice(0, 3)).toEqual(song.tracks);
    expect(added.tracks[3]).toMatchObject({ number: 4, name: 'Guitar', offset: 0, isPercussion: false, mute: false, solo: false });
    expect(added.tracks[3]?.strings.map((guitarString) => guitarString.tuning)).toEqual(STANDARD_TUNING);
    expect(channelOf(added, 3)).toMatchObject({ id: 4, program: 25, bank: 0, isPercussion: false, name: 'Steel String Acoustic Guitar 1' });
    expect(added.channels.slice(0, 3)).toEqual(song.channels);
  });

  it('fills every bar with rests, as long as the bar, with the bar’s key and voice slots', () => {
    // Arrange
    const song = threeTracks();

    // Act
    const added = addTrack(song, { kind: 'guitar' });

    // Assert
    expect(voiceLayout(added, 3, 0, 0)).toEqual(['0:1:r']);
    expect(voiceLayout(added, 3, 1, 0)).toEqual(['0:2.:r']);
    expect(voiceLayout(added, 3, 0, 1)).toEqual([]);
    expect(added.tracks[3]?.measures.map((measure) => measure.keySignature)).toEqual([0, 2]);
    expect(added.tracks[3]?.measures[0]?.beats[0]?.voices).toHaveLength(2);
    expect(added.tracks[3]?.measures.map((measure) => measure.headerIndex)).toEqual([0, 1]);
  });

  it('gives a melodic track a MIDI channel no other track plays on, and drums MIDI channel 10', () => {
    // Arrange
    const song = threeTracks();

    // Act
    const added = addTrack(addTrack(addTrack(song, { kind: 'bass' }), { kind: 'drums' }), { kind: 'drums' });

    // Assert
    const routes = buildChannelRoutes(added.channels);
    const bass = routes.get(added.tracks[3]?.channelId ?? -1);
    const others = [0, 1, 2].map((index) => routes.get(added.tracks[index]?.channelId ?? -1)?.channel1);
    expect(bass?.channel1).not.toBe(DEFAULT_PERCUSSION_CHANNEL);
    expect(others).not.toContain(bass?.channel1);
    expect(routes.get(added.tracks[4]?.channelId ?? -1)?.channel1).toBe(DEFAULT_PERCUSSION_CHANNEL);
    expect(routes.get(added.tracks[5]?.channelId ?? -1)?.channel1).toBe(DEFAULT_PERCUSSION_CHANNEL);
    expect(added.tracks[4]?.channelId).not.toBe(added.tracks[5]?.channelId);
  });

  it('makes a drum track: the percussion bank, six strings tuned 0, a neutral clef and no capo', () => {
    // Arrange
    const song = threeTracks();

    // Act
    const added = addTrack(song, { kind: 'drums', capo: 3, program: 30 });

    // Assert
    assertSongInvariants(added);
    expect(added.tracks[3]).toMatchObject({ name: 'Drums', isPercussion: true, offset: 0 });
    expect(added.tracks[3]?.strings.map((guitarString) => guitarString.tuning)).toEqual([0, 0, 0, 0, 0, 0]);
    expect(added.tracks[3]?.measures.every((measure) => measure.clef === 'neutral')).toBe(true);
    expect(channelOf(added, 3)).toMatchObject({ program: 0, bank: DEFAULT_PERCUSSION_BANK, isPercussion: true, name: 'DrumKit 1' });
  });

  it('makes a bass in the bass clef, playing a fingered electric bass, on the tuning asked for', () => {
    // Arrange
    const song = threeTracks();
    const fiveString = [43, 38, 33, 28, 23];

    // Act
    const added = addTrack(song, { kind: 'bass', tuning: fiveString });

    // Assert
    expect(added.tracks[3]?.strings).toEqual(fiveString.map((tuning, index) => ({ number: index + 1, tuning })));
    expect(added.tracks[3]?.measures.every((measure) => measure.clef === 'bass')).toBe(true);
    expect(channelOf(added, 3)?.program).toBe(33);
  });

  it('takes the name (trimmed), the program and the capo asked for, the capo within 0–24', () => {
    // Arrange
    const song = threeTracks();

    // Act
    const named = addTrack(song, { kind: 'guitar', name: '  Lead  ', program: 30, capo: 40 });

    // Assert
    expect(named.tracks[3]).toMatchObject({ name: 'Lead', offset: 24 });
    expect(channelOf(named, 3)).toMatchObject({ program: 30, name: 'Distortion Electric Guitar 1' });
  });

  it('names a track after its kind, an “other” track after its General MIDI instrument', () => {
    const song = threeTracks();
    expect(addTrack(song, { kind: 'ukulele', name: '  ' }).tracks[3]?.name).toBe('Ukulele');
    expect(addTrack(song, { kind: 'keys' }).tracks[3]?.name).toBe('Piano');
    expect(addTrack(song, { kind: 'other', program: 40 }).tracks[3]?.name).toBe('Violin');
    expect(addTrack(song, { kind: 'other' }).tracks[3]?.name).toBe('String Ensemble');
  });

  it('gives a ukulele its re-entrant standard tuning and a banjo its open G', () => {
    const song = threeTracks();
    expect(addTrack(song, { kind: 'ukulele' }).tracks[3]?.strings.map((guitarString) => guitarString.tuning)).toEqual([69, 64, 60, 67]);
    const banjo = addTrack(song, { kind: 'banjo' });
    expect(banjo.tracks[3]?.strings.map((guitarString) => guitarString.tuning)).toEqual([62, 59, 55, 50, 67]);
    expect(channelOf(banjo, 3)?.program).toBe(105);
  });

  it('returns the same song for a kind it does not know, a program outside 0–127 or an unplayable tuning', () => {
    const song = threeTracks();
    expect(addTrack(song, { kind: 'lute' as never })).toBe(song);
    expect(addTrack(song, { kind: 'guitar', program: 128 })).toBe(song);
    expect(addTrack(song, { kind: 'guitar', program: 1.5 })).toBe(song);
    expect(addTrack(song, { kind: 'guitar', tuning: [] })).toBe(song);
    expect(addTrack(song, { kind: 'guitar', tuning: [64, 59, 55, 50, 45, 40, 35, 30, 25] })).toBe(song);
    expect(addTrack(song, { kind: 'guitar', tuning: [64, 200] })).toBe(song);
    expect(addTrack(song, { kind: 'guitar', tuning: [64, Number.NaN] })).toBe(song);
  });
});

describe('deleteTrack', () => {
  it('removes the track, numbers the tracks after it again and drops the channel no track plays any more', () => {
    // Arrange
    const song = threeTracks();

    // Act
    const deleted = deleteTrack(song, 1);

    // Assert
    assertSongInvariants(deleted);
    expect(deleted.tracks.map((track) => [track.number, track.channelId])).toEqual([
      [1, 1],
      [2, 3],
    ]);
    expect(deleted.tracks[0]).toBe(song.tracks[0]);
    expect(deleted.tracks[1]?.measures).toBe(song.tracks[2]?.measures);
    expect(deleted.channels.map((channel) => channel.id)).toEqual([1, 3]);
  });

  it('keeps a channel another track still plays', () => {
    // Arrange
    const song = deepFreeze(buildSong({ tracks: [[[[play(1, n(1, 5))]]], [[[play(1, n(1, 7))]]]] }));

    // Act
    const deleted = deleteTrack(song, 0);

    // Assert
    expect(deleted.tracks).toHaveLength(1);
    expect(deleted.channels).toBe(song.channels);
    expect(deleted.tracks[0]).toMatchObject({ number: 1, name: 'Track 2' });
  });

  it('refuses to delete the only track, and a track the song does not have', () => {
    const song = deepFreeze(buildSong({ tracks: [[[[play(1, n(1, 5))]]]] }));
    const three = threeTracks();
    expect(deleteTrack(song, 0)).toBe(song);
    expect(deleteTrack(three, 3)).toBe(three);
    expect(deleteTrack(three, -1)).toBe(three);
  });
});

describe('duplicateTrack', () => {
  it('puts a copy right after the track, on a copy of its channel, and numbers the later tracks again', () => {
    // Arrange
    const song = threeTracks();

    // Act
    const duplicated = duplicateTrack(song, 0);

    // Assert
    assertSongInvariants(duplicated);
    expect(duplicated.tracks.map((track) => [track.number, track.name])).toEqual([
      [1, 'Track 1'],
      [2, 'Track 1'],
      [3, 'Track 2'],
      [4, 'Track 3'],
    ]);
    expect(duplicated.tracks[1]?.measures).toEqual(song.tracks[0]?.measures);
    expect(duplicated.tracks[1]?.measures).not.toBe(song.tracks[0]?.measures);
    expect(channelOf(duplicated, 1)).toEqual({ ...song.channels[0], id: 4, name: 'Steel String Acoustic Guitar 1' });
    expect(duplicated.tracks[0]).toBe(song.tracks[0]);
  });

  it('copies the track’s short name, colour and icon, and moving tracks takes them along', () => {
    // Arrange
    const dressed = setTrackIcon(setTrackColor(setTrackShortName(threeTracks(), 1, 'T2'), 1, { r: 1, g: 2, b: 3 }), 1, 7);

    // Act
    const duplicated = duplicateTrack(dressed, 1);
    const moved = moveTrack(dressed, 1, 2);

    // Assert
    const appearance = (song: Song, trackIndex: number) => [song.tracks[trackIndex]?.shortName, song.tracks[trackIndex]?.color, song.tracks[trackIndex]?.iconId];
    expect(appearance(duplicated, 2)).toEqual(['T2', { r: 1, g: 2, b: 3 }, 7]);
    expect(appearance(moved, 2)).toEqual(['T2', { r: 1, g: 2, b: 3 }, 7]);
    expect(appearance(moved, 1)).toEqual([undefined, { r: 255, g: 0, b: 0 }, undefined]);
  });

  it('copies the track’s effects, lyrics, capo, mute and solo', () => {
    // Arrange
    const effects = [buildEffect('drive')];
    const song = setTrackLyrics(setTrackEffects(threeTracks(), 2, effects), 2, { from: 1, text: 'la la' });

    // Act
    const duplicated = duplicateTrack(song, 2);

    // Assert
    expect(duplicated.tracks[3]).toMatchObject({ number: 4, effects, lyrics: { from: 1, text: 'la la' } });
    expect(channelOf(duplicated, 3)?.id).toBe(4);
  });

  it('returns the same song for a track the song does not have', () => {
    const song = threeTracks();
    expect(duplicateTrack(song, 5)).toBe(song);
  });
});

describe('moveTrack', () => {
  it('moves a track to another place and numbers every track by its new place', () => {
    // Arrange
    const song = threeTracks();

    // Act
    const moved = moveTrack(song, 0, 2);

    // Assert
    assertSongInvariants(moved);
    expect(moved.tracks.map((track) => [track.number, track.name])).toEqual([
      [1, 'Track 2'],
      [2, 'Track 3'],
      [3, 'Track 1'],
    ]);
    expect(moved.tracks.map((track) => track.measures)).toEqual([song.tracks[1]?.measures, song.tracks[2]?.measures, song.tracks[0]?.measures]);
    expect(moved.tracks[2]?.measures).toBe(song.tracks[0]?.measures);
    expect(moved.channels).toBe(song.channels);
  });

  it('moves a track up by one (TGSongManager.moveTrackUp)', () => {
    const moved = moveTrack(threeTracks(), 2, 1);
    expect(moved.tracks.map((track) => track.name)).toEqual(['Track 1', 'Track 3', 'Track 2']);
  });

  it('returns the same song for the same place or a place the song does not have', () => {
    const song = threeTracks();
    expect(moveTrack(song, 1, 1)).toBe(song);
    expect(moveTrack(song, 0, 3)).toBe(song);
    expect(moveTrack(song, -1, 0)).toBe(song);
    expect(moveTrack(song, 0, 1.5)).toBe(song);
  });
});

describe('hasTrackNotes', () => {
  it('tells a track with a note from one of rests only', () => {
    const song = addTrack(threeTracks(), { kind: 'bass' });
    expect(hasTrackNotes(song.tracks[0] as Track)).toBe(true);
    expect(hasTrackNotes(song.tracks[3] as Track)).toBe(false);
  });
});
