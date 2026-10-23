import { describe, expect, it } from 'vitest';
import { recognizeChord } from '../src/chords/recognizer';
import { BASS, DROP_D, SEVEN_STRING, STANDARD, UKULELE, shape } from './helpers/chord-shapes';

const firstName = (frets: readonly number[], tuning: readonly number[]) => recognizeChord(frets, tuning)[0]?.name;

describe('recognizeChord', () => {
  it.each<[string, string]>([
    ['x32010', 'C'],
    ['320003', 'G'],
    ['x02210', 'Am'],
    ['133211', 'F'],
    ['xx0232', 'D'],
    ['022000', 'Em'],
    ['xx0212', 'D7'],
    ['x02020', 'A7'],
    ['x2323x', 'Bm7b5'],
    ['x32000', 'Cmaj7'],
    ['x02230', 'Asus4'],
    ['xx0230', 'Dsus2'],
    ['x32030', 'Cadd9'],
  ])('names %s on a standard-tuned guitar %s', (written, name) => {
    expect(firstName(shape(written), STANDARD)).toBe(name);
  });

  it.each<[string, string]>([
    ['332010', 'C/G'],
    ['2x0232', 'D/F#'],
    ['x20003', 'G/B'],
    ['032010', 'C/E'],
  ])('names the slash chord %s as %s', (written, name) => {
    expect(firstName(shape(written), STANDARD)).toBe(name);
  });

  it('names a drop-D power shape by the open strings it adds', () => {
    expect(firstName(shape('000232'), DROP_D)).toBe('D');
    expect(firstName(shape('000xxx'), DROP_D)).toBe('D5');
  });

  it('names chords on 4- and 7-string instruments', () => {
    expect(firstName([3, 0, 0, 0], UKULELE)).toBe('C');
    expect(firstName([-1, -1, 5, 3], BASS)).toBe('G5');
    expect(firstName([0, 1, 0, 2, 3, -1, -1], SEVEN_STRING)).toBe('C');
  });

  it('rates a complete chord 100% and lists other readings after it', () => {
    // Act
    const proposals = recognizeChord(shape('x02210'), STANDARD);

    // Assert
    expect(proposals[0]?.completeness).toBe(100);
    expect(proposals.map((proposal) => proposal.name)).toContain('C6/A');
    expect(new Set(proposals.map((proposal) => proposal.name)).size).toBe(proposals.length);
  });

  it('spells names with flats when asked', () => {
    expect(recognizeChord(shape('x13331'), STANDARD, { spelling: 'flat' })[0]?.name).toBe('Bb');
  });

  it('gives no names without played strings, and ignores frets that are not frets', () => {
    expect(recognizeChord([-1, -1, -1, -1, -1, -1], STANDARD)).toEqual([]);
    expect(recognizeChord([], STANDARD)).toEqual([]);
    expect(firstName([0, 1, 0, 2, 3, Number.NaN], STANDARD)).toBe('C');
  });
});
