import { describe, expect, it } from 'vitest';
import { DEFAULT_MASTER, setMasterGain, toggleEffect } from '../src/effects/effect-chain';
import { buildEffect, effectParamSpec } from '../src/effects/effect-params';
import { parseEffectChain, parseMasterMix } from '../src/effects/effects-json';
import { SONG_EFFECTS_VERSION, readSongEffects, songEffectsToJson } from '../src/effects/song-effects';
import { setMasterMix, setTrackEffects } from '../src/edit/track-effects';
import type { Song } from '../src/model/song';
import { buildSong, deepFreeze, n, play } from './helpers/edit-songs';

function twoTracks(): Song {
  return deepFreeze(buildSong({ tracks: [[[[play(1, n(1, 5))]]], [[[play(1, n(2, 0))]]]] }));
}

describe('parseEffectChain', () => {
  it('keeps valid effects as they are', () => {
    // Arrange
    const effects = [buildEffect('drive'), buildEffect('reverb', false)];

    // Act
    const parsed = parseEffectChain(JSON.parse(JSON.stringify(effects)));

    // Assert
    expect(parsed).toEqual(effects);
  });

  it('drops what is not an effect, fills missing parameters and clamps the others', () => {
    // Arrange
    const raw = [
      { type: 'drive', isEnabled: true, params: { gain: 999, bogus: 3, tone: 'loud' } },
      { type: 'flanger', isEnabled: true, params: {} },
      { type: 'limiter', isEnabled: true, params: {} },
      'reverb',
      null,
      { type: 'delay', params: { time: 100 } },
    ];

    // Act
    const parsed = parseEffectChain(raw);

    // Assert
    expect(parsed.map((effect) => effect.type)).toEqual(['drive', 'delay']);
    expect(parsed[0]?.params.gain).toBe(effectParamSpec('drive', 'gain')?.max);
    expect(parsed[0]?.params.tone).toBe(effectParamSpec('drive', 'tone')?.defaultValue);
    expect(parsed[0]?.params).not.toHaveProperty('bogus');
    expect(parsed[1]?.isEnabled).toBe(true);
    expect(parsed[1]?.params.time).toBe(100);
  });

  it('keeps at most eight effects and reads anything but a list as no effects', () => {
    expect(parseEffectChain(Array.from({ length: 12 }, () => buildEffect('eq')))).toHaveLength(8);
    expect(parseEffectChain({ type: 'eq' })).toEqual([]);
    expect(parseEffectChain(undefined)).toEqual([]);
  });

  it('does not read parameters from an object prototype', () => {
    const raw = JSON.parse('[{"type":"eq","isEnabled":true,"params":{"__proto__":{"lowGain":12}}}]') as unknown;
    expect(parseEffectChain(raw)[0]?.params.lowGain).toBe(effectParamSpec('eq', 'lowGain')?.defaultValue);
  });
});

describe('parseMasterMix', () => {
  it('reads the master strip in its fixed order, filling what is missing', () => {
    // Arrange
    const raw = { gainDb: -6, effects: [{ type: 'reverb', isEnabled: true, params: { mix: 40 } }, { type: 'eq', isEnabled: true, params: {} }] };

    // Act
    const master = parseMasterMix(raw);

    // Assert
    expect(master.effects.map((effect) => [effect.type, effect.isEnabled])).toEqual([
      ['eq', true],
      ['compressor', false],
      ['reverb', true],
      ['limiter', true],
    ]);
    expect(master.effects[2]?.params.mix).toBe(40);
    expect(master.gainDb).toBe(-6);
  });

  it('reads anything else as the default master', () => {
    expect(parseMasterMix('loud')).toEqual(DEFAULT_MASTER);
    expect(parseMasterMix({ gainDb: 'x' }).gainDb).toBe(0);
    expect(parseMasterMix({ gainDb: 99 }).gainDb).toBe(12);
  });
});

describe('songEffectsToJson / readSongEffects', () => {
  it('has nothing to write for a song without effects and a default master', () => {
    expect(songEffectsToJson(twoTracks())).toBeUndefined();
  });

  it('round-trips track effects and the master mix', () => {
    // Arrange
    const withEffects = setTrackEffects(twoTracks(), 1, [buildEffect('drive'), buildEffect('cabinet')]);
    const song = setMasterMix(withEffects, setMasterGain({ ...DEFAULT_MASTER, effects: toggleEffect(DEFAULT_MASTER.effects, 2) }, -3));

    // Act
    const json = songEffectsToJson(song);
    const read = readSongEffects(twoTracks(), json ?? '');

    // Assert
    expect(JSON.parse(json ?? '{}')).toMatchObject({ version: SONG_EFFECTS_VERSION });
    expect(read.tracks[0]?.effects).toBeUndefined();
    expect(read.tracks[1]?.effects).toEqual(song.tracks[1]?.effects);
    expect(read.master).toEqual(song.master);
  });

  it('leaves the song as it is for text that is not our effects, or tracks it does not have', () => {
    // Arrange
    const song = twoTracks();

    // Act / Assert
    expect(readSongEffects(song, 'not json')).toBe(song);
    expect(readSongEffects(song, '[1,2]')).toBe(song);
    expect(readSongEffects(song, JSON.stringify({ version: 99, tracks: [] }))).toBe(song);
    const stray = readSongEffects(song, JSON.stringify({ version: 1, tracks: [{ trackIndex: 7, effects: [buildEffect('eq')] }, { trackIndex: 'x' }] }));
    expect(stray.tracks).toBe(song.tracks);
  });
});
