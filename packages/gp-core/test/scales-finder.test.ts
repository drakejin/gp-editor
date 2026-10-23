import { describe, expect, it } from 'vitest';
import { EMPTY_NOTE_EFFECT } from '../src/model/defaults';
import type { Track } from '../src/model/song';
import { MAX_SCALE_MATCHES, findScales, trackPitches } from '../src/scales/finder';
import { SCALE_ROOTS, scaleTitle } from '../src/scales/notes';
import { buildSong, deepFreeze, n, play, rest } from './helpers/edit-songs';

const titles = (pitches: readonly number[], limit?: number): string[] => findScales(pitches, limit).map((match) => scaleTitle(match.choice));

describe('findScales', () => {
  it('ranks first the scales the notes fill, led by the one on the most played note', () => {
    // Arrange: an A minor pentatonic lick that keeps coming back to A
    const lick = [57, 60, 62, 64, 67, 69, 69, 57, 64];

    // Act
    const found = findScales(lick);

    // Assert
    expect(scaleTitle(found[0]!.choice)).toBe('A Pentatonic Minor Scale');
    expect(found[0]).toMatchObject({ unusedNotes: 0, rootShare: 4 / 9 });
    expect(titles(lick).slice(0, 3)).toContain('C Pentatonic Major Scale');
  });

  it('only lists scales that hold every note, tighter fits first', () => {
    // Act: C E G
    const found = findScales([60, 64, 67, 72], 500);

    // Assert
    expect(scaleTitle(found[0]!.choice)).toBe('C Major Arpeggio');
    expect(found.every((match, i, all) => i === 0 || match.unusedNotes >= (all[i - 1]?.unusedNotes ?? 0))).toBe(true);
    expect(found.some((match) => scaleTitle(match.choice) === 'C Major Scale')).toBe(true);
    expect(found.some((match) => scaleTitle(match.choice) === 'C Minor Scale')).toBe(false);
  });

  it('lists the same notes on the same root once, with the other names as aliases', () => {
    // Act: the C major scale
    const found = findScales([60, 62, 64, 65, 67, 69, 71]);

    // Assert
    const cMajor = found.find((match) => scaleTitle(match.choice) === 'C Major Scale');
    expect(cMajor?.aliases).toContain('Ionian Mode');
    expect(found.some((match) => scaleTitle(match.choice) === 'C Ionian Mode')).toBe(false);
    expect(found.some((match) => scaleTitle(match.choice) === 'A Minor Scale')).toBe(true);
  });

  it('names a black-key root as its key is usually written', () => {
    const found = findScales([63, 65, 67, 68, 70, 72, 74, 63]);
    expect(SCALE_ROOTS[found[0]!.choice.rootIndex]?.name).toBe('Eb');
  });

  it('keeps to the limit and has nothing for no notes', () => {
    expect(findScales([60])).toHaveLength(MAX_SCALE_MATCHES);
    expect(findScales([60, 64], 3)).toHaveLength(3);
    expect(findScales([])).toEqual([]);
    expect(findScales([Number.NaN, 1.5])).toEqual([]);
  });
});

describe('trackPitches', () => {
  /** Bar 1: E2 open, rest, G on string 1 at fret 3; bar 2: a chord of B and D, then a dead note. */
  function guitar(offset = 0): Track {
    const dead = { ...n(4, 0), effect: { ...EMPTY_NOTE_EFFECT, deadNote: true } };
    const song = buildSong({ tracks: [[[[play(4, n(6, 0)), rest(4), play(4, n(1, 3)), rest(4)]], [[play(2, n(3, 4), n(2, 3)), play(2, dead)]]]] });
    return deepFreeze({ ...song.tracks[0]!, offset });
  }

  it('gives the sounding pitch of every note of the track, capo counted, dead notes left out', () => {
    expect(trackPitches(guitar())).toEqual([40, 67, 59, 62]);
    expect(trackPitches(guitar(2))).toEqual([42, 69, 61, 64]);
  });

  it('gives the notes of the beats from first to last, across bars', () => {
    expect(trackPitches(guitar(), { measureIndex: 0, beatIndex: 2 }, { measureIndex: 1, beatIndex: 0 })).toEqual([67, 59, 62]);
    expect(trackPitches(guitar(), { measureIndex: 1, beatIndex: 0 }, { measureIndex: 0, beatIndex: 2 })).toEqual([67, 59, 62]);
  });

  it('has nothing for a drum track', () => {
    expect(trackPitches({ ...guitar(), isPercussion: true })).toEqual([]);
  });
});
