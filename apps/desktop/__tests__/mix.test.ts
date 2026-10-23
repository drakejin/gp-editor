import { DEFAULT_MASTER, buildEffect, setMasterMix, setTrackEffects } from '@gp-editor/core';
import { hasSameEffectRouting, isSameMixLayout, mixOf, withPreview } from '../src/lib/mix';
import { beat, makeSong, note } from '../test-support/songs';

const plain = makeSong([[beat(960, [note(1, 0)])]]);
const twoTracks = { ...plain, tracks: [plain.tracks[0]!, { ...plain.tracks[0]!, number: 2 }] };

describe('mixOf', () => {
  it('lists each track’s effects (null for none) and the master, default when the song has none', () => {
    // Arrange
    const song = setTrackEffects(twoTracks, 1, [buildEffect('delay')]);

    // Act
    const mix = mixOf(song);

    // Assert
    expect(mix.tracks).toEqual([null, [buildEffect('delay')]]);
    expect(mix.master).toBe(DEFAULT_MASTER);
  });

  it('gives the song’s own master', () => {
    const master = { ...DEFAULT_MASTER, gainDb: -6 };
    expect(mixOf(setMasterMix(plain, master)).master).toEqual(master);
  });
});

describe('hasSameEffectRouting', () => {
  it('is true while the same tracks have effects, whatever their values', () => {
    const withDelay = setTrackEffects(twoTracks, 1, [buildEffect('delay')]);
    const withReverb = setTrackEffects(twoTracks, 1, [buildEffect('reverb'), buildEffect('eq', false)]);
    expect(hasSameEffectRouting(withDelay, withReverb)).toBe(true);
    expect(hasSameEffectRouting(twoTracks, setMasterMix(twoTracks, { ...DEFAULT_MASTER, gainDb: 3 }))).toBe(true);
  });

  it('is false when a track gets its first effect or loses its last, or tracks come and go', () => {
    const withDelay = setTrackEffects(twoTracks, 1, [buildEffect('delay')]);
    expect(hasSameEffectRouting(twoTracks, withDelay)).toBe(false);
    expect(hasSameEffectRouting(withDelay, twoTracks)).toBe(false);
    expect(hasSameEffectRouting(twoTracks, plain)).toBe(false);
  });
});

describe('withPreview', () => {
  it('puts a chain being dragged in place of a track’s, or a master in place of the song’s', () => {
    // Arrange
    const mix = mixOf(twoTracks);

    // Act
    const track = withPreview(mix, { trackIndex: 0, effects: [buildEffect('chorus')] });
    const master = withPreview(mix, { master: { ...DEFAULT_MASTER, gainDb: 6 } });

    // Assert
    expect(track.tracks).toEqual([[buildEffect('chorus')], null]);
    expect(track.master).toBe(mix.master);
    expect(master.master.gainDb).toBe(6);
    expect(master.tracks).toBe(mix.tracks);
  });
});

describe('isSameMixLayout', () => {
  it('compares the chains and the master by identity: an edit elsewhere in the song keeps them', () => {
    const song = setTrackEffects(twoTracks, 1, [buildEffect('delay')]);
    const renamed = { ...song, tracks: song.tracks.map((track) => ({ ...track, name: 'x' })) };
    expect(isSameMixLayout(mixOf(song), mixOf(renamed))).toBe(true);
    expect(isSameMixLayout(mixOf(song), mixOf(setTrackEffects(song, 1, [buildEffect('reverb')])))).toBe(false);
    expect(isSameMixLayout(mixOf(song), mixOf(setMasterMix(song, { ...DEFAULT_MASTER, gainDb: 1 })))).toBe(false);
  });
});
