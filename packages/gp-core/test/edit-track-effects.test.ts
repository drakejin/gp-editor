import { describe, expect, it } from 'vitest';
import { DEFAULT_MASTER, setMasterGain } from '../src/effects/effect-chain';
import { buildEffect, effectParamSpec } from '../src/effects/effect-params';
import { setMasterMix, setTrackEffects } from '../src/edit/track-effects';
import { readSong } from '../src/read-song';
import { writeSong } from '../src/write';
import type { Effect, Song } from '../src/model/song';
import { buildSong, deepFreeze, n, play } from './helpers/edit-songs';

function twoTracks(): Song {
  return deepFreeze(buildSong({ tracks: [[[[play(1, n(1, 5))]]], [[[play(1, n(2, 0))]]]] }));
}

describe('setTrackEffects', () => {
  it('gives one track an effect chain and leaves the other tracks alone', () => {
    // Arrange
    const song = twoTracks();
    const effects = [buildEffect('compressor'), buildEffect('delay')];

    // Act
    const edited = setTrackEffects(song, 0, effects);

    // Assert
    expect(edited.tracks[0]?.effects).toEqual(effects);
    expect(edited.tracks[0]?.measures).toBe(song.tracks[0]?.measures);
    expect(edited.tracks[1]).toBe(song.tracks[1]);
    expect(song.tracks[0]?.effects).toBeUndefined();
  });

  it('checks the chain: clamps values and drops what a track cannot hold', () => {
    // Arrange
    const loud: Effect = { type: 'drive', isEnabled: true, params: { ...buildEffect('drive').params, gain: 500 } };

    // Act
    const edited = setTrackEffects(twoTracks(), 0, [loud, buildEffect('limiter')]);

    // Assert
    expect(edited.tracks[0]?.effects?.map((effect) => effect.type)).toEqual(['drive']);
    expect(edited.tracks[0]?.effects?.[0]?.params.gain).toBe(effectParamSpec('drive', 'gain')?.max);
  });

  it('removes the chain when it is emptied, and returns the same song when nothing changes', () => {
    // Arrange
    const song = twoTracks();
    const withChain = setTrackEffects(song, 1, [buildEffect('reverb')]);

    // Act
    const cleared = setTrackEffects(withChain, 1, []);

    // Assert
    expect(cleared.tracks[1]).not.toHaveProperty('effects');
    expect(setTrackEffects(song, 0, [])).toBe(song);
    expect(setTrackEffects(song, 4, [buildEffect('eq')])).toBe(song);
    expect(setTrackEffects(withChain, 1, [buildEffect('reverb')])).toBe(withChain);
  });
});

describe('setMasterMix', () => {
  it('sets the master mix, and removes it when it is the default again', () => {
    // Arrange
    const song = twoTracks();
    const quieter = setMasterGain(DEFAULT_MASTER, -6);

    // Act
    const edited = setMasterMix(song, quieter);
    const reset = setMasterMix(edited, DEFAULT_MASTER);

    // Assert
    expect(edited.master).toEqual(quieter);
    expect(reset).not.toHaveProperty('master');
    expect(setMasterMix(song, DEFAULT_MASTER)).toBe(song);
    expect(setMasterMix(edited, quieter)).toBe(edited);
  });
});

describe('effects in saved files', () => {
  it('keeps track effects and the master mix in a Guitar Pro 7 file', () => {
    // Arrange
    const withChain = setTrackEffects(twoTracks(), 1, [buildEffect('chorus'), buildEffect('cabinet', false)]);
    const song = setMasterMix(withChain, setMasterGain(DEFAULT_MASTER, 3));

    // Act
    const read = readSong(writeSong(song, 'gp'));

    // Assert
    expect(read.tracks[0]?.effects).toBeUndefined();
    expect(read.tracks[1]?.effects).toEqual(song.tracks[1]?.effects);
    expect(read.master).toEqual(song.master);
  });

  it('leaves effects out of GP5, which cannot hold them', () => {
    const song = setTrackEffects(twoTracks(), 0, [buildEffect('drive')]);
    const read = readSong(writeSong(song, 'gp5'));
    expect(read.tracks[0]?.effects).toBeUndefined();
    expect(read.master).toBeUndefined();
  });
});
