import { describe, expect, it } from 'vitest';
import { buildChordVoicings } from '../src/chords/creator';
import { chordSpecPitchClasses } from '../src/chords/spec';
import { buildChordSpec, type ChordSpec } from '../src/chords/spec';
import type { Chord } from '../src/model/song';
import { BASS, EIGHT_STRING, SEVEN_STRING, STANDARD, UKULELE, bassPitchClass, playedPitchClasses, shape, written } from './helpers/chord-shapes';

const C = 0;
const D = 2;
const F = 5;
const G = 7;
const A = 9;
const B = 11;

const shapesOf = (chords: readonly Chord[]): readonly string[] => chords.map((chord) => written(chord.frets));

/** Checks every voicing: only the chord's notes, at least two strings, a reachable span, the chord's name. */
function expectPlayable(chords: readonly Chord[], spec: ChordSpec, tuning: readonly number[], name: string): void {
  expect(chords.length).toBeGreaterThan(0);
  const allowed = new Set([...chordSpecPitchClasses(spec), spec.bass]);
  for (const chord of chords) {
    const fretted = chord.frets.filter((fret) => fret > 0);
    expect(chord.name).toBe(name);
    expect(chord.frets).toHaveLength(tuning.length);
    expect(chord.frets.filter((fret) => fret >= 0).length).toBeGreaterThanOrEqual(2);
    expect([...playedPitchClasses(chord.frets, tuning)].every((pc) => allowed.has(pc)), written(chord.frets)).toBe(true);
    expect(Math.max(0, ...chord.frets) - Math.min(...chord.frets.filter((fret) => fret >= 0))).toBeLessThan(5);
    expect(chord.firstFret).toBeGreaterThanOrEqual(1);
    expect(fretted.every((fret) => fret >= chord.firstFret && fret < chord.firstFret + 5)).toBe(true);
  }
}

describe('buildChordVoicings', () => {
  it('ranks the open C shape first', () => {
    // Arrange
    const spec = buildChordSpec(C, 'M');

    // Act
    const chords = buildChordVoicings(spec, STANDARD);

    // Assert
    expect(written(chords[0]?.frets ?? [])).toBe('x32010');
    expectPlayable(chords, spec, STANDARD, 'C');
  });

  it.each<[string, ChordSpec, string, number]>([
    ['G', buildChordSpec(G, 'M'), '320003', 5],
    ['Am', buildChordSpec(A, 'm'), 'x02210', 3],
    ['F', buildChordSpec(F, 'M'), '133211', 5],
    ['D7', buildChordSpec(D, '7'), 'xx0212', 5],
    ['Bm7b5', buildChordSpec(B, 'm7', { fifth: 'flat' }), 'x2323x', 5],
  ])('finds the known %s shape among the best voicings', (name, spec, known, rank) => {
    // Act
    const chords = buildChordVoicings(spec, STANDARD);

    // Assert
    expect(shapesOf(chords).slice(0, rank)).toContain(known);
    expectPlayable(chords, spec, STANDARD, name);
  });

  it('puts the bass note of a slash chord lowest in its best voicings', () => {
    // Arrange
    const spec = buildChordSpec(C, 'M', { bass: G });

    // Act
    const chords = buildChordVoicings(spec, STANDARD);

    // Assert
    expect(chords.slice(0, 5).every((chord) => bassPitchClass(chord.frets, STANDARD) === G)).toBe(true);
    expectPlayable(chords, spec, STANDARD, 'C/G');
  });

  it('prefers a note other than the root in the bass for inversions', () => {
    const chords = buildChordVoicings(buildChordSpec(C, 'M'), STANDARD, { style: 'inversions' });
    expect(bassPitchClass(chords[0]?.frets ?? [], STANDARD)).not.toBe(C);
  });

  it('includes the extension of a ninth chord', () => {
    const spec = buildChordSpec(G, '7', { extension: '9' });
    const chords = buildChordVoicings(spec, STANDARD);
    expect(playedPitchClasses(chords[0]?.frets ?? [], STANDARD).has(A)).toBe(true);
    expectPlayable(chords, spec, STANDARD, 'G9');
  });

  it('returns at most the voicings asked for, no two the same', () => {
    const chords = buildChordVoicings(buildChordSpec(A, 'm7'), STANDARD, { maxVoicings: 8 });
    expect(chords).toHaveLength(8);
    expect(new Set(shapesOf(chords)).size).toBe(8);
  });

  it('keeps to the frets asked for', () => {
    const chords = buildChordVoicings(buildChordSpec(C, 'M'), STANDARD, { minFret: 7, maxFret: 12 });
    expect(chords.every((chord) => chord.frets.every((fret) => fret < 0 || (fret >= 7 && fret <= 12)))).toBe(true);
  });

  it.each<[string, readonly number[]]>([
    ['a 4-string bass', BASS],
    ['a 7-string guitar', SEVEN_STRING],
    ['an 8-string guitar', EIGHT_STRING],
  ])('builds voicings on %s', (_, tuning) => {
    const spec = buildChordSpec(C, 'M');
    expectPlayable(buildChordVoicings(spec, tuning), spec, tuning, 'C');
  });

  it('finds the ukulele’s open C (0003)', () => {
    const chords = buildChordVoicings(buildChordSpec(C, 'M'), UKULELE);
    expect(shapesOf(chords).slice(0, 3)).toContain('0003');
  });

  // Seven notes on eight strings: the search stops after MAX_COMBINATIONS voicings (a few hundred ms in Node).
  it('builds the extended chords of an 8-string guitar', { timeout: 30_000 }, () => {
    const spec = buildChordSpec(G, '7', { extension: '13' });
    expectPlayable(buildChordVoicings(spec, EIGHT_STRING), spec, EIGHT_STRING, 'G13');
  });

  it('returns no voicings without strings', () => {
    expect(buildChordVoicings(buildChordSpec(C, 'M'), [])).toEqual([]);
  });

  it('spells the name with flats when asked', () => {
    expect(buildChordVoicings(buildChordSpec(10, 'M'), STANDARD, { spelling: 'flat' })[0]?.name).toBe('Bb');
  });

  it('reads shapes the way the tests write them', () => {
    expect(shape('x32010')).toEqual([0, 1, 0, 2, 3, -1]);
  });
});
