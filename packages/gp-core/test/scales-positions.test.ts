import { describe, expect, it } from 'vitest';
import type { GuitarString } from '../src/model/song';
import { SCALE_ROOTS, scaleIndexNamed } from '../src/scales/notes';
import { MAX_SCALE_STRINGS, MIN_SCALE_STRINGS, SCALE_BOX_FRETS, scaleBoxes, scaleFretPositions } from '../src/scales/positions';

const strings = (...tuning: number[]): GuitarString[] => tuning.map((open, i) => ({ number: i + 1, tuning: open }));
const GUITAR = strings(64, 59, 55, 50, 45, 40);
const BASS = strings(43, 38, 33, 28);
const SEVEN_STRING = strings(64, 59, 55, 50, 45, 40, 35);
const choice = (rootName: string, scaleName: string) => ({
  rootIndex: SCALE_ROOTS.findIndex((root) => root.name === rootName),
  scaleIndex: scaleIndexNamed(scaleName) ?? -1,
});
const A_MINOR_PENTATONIC = choice('A', 'Pentatonic Minor Scale');

/** Frets of the scale on one string, roots marked with "R". */
function onString(positions: ReturnType<typeof scaleFretPositions>, string: number): string[] {
  return positions.filter((position) => position.string === string).map((position) => `${position.fret}${position.isRoot ? 'R' : ''}`);
}

describe('scaleFretPositions', () => {
  it('finds A minor pentatonic on all 24 frets of a six-string guitar, the roots marked', () => {
    // Act
    const positions = scaleFretPositions(A_MINOR_PENTATONIC, GUITAR);

    // Assert
    expect(onString(positions, 6)).toEqual(['0', '3', '5R', '8', '10', '12', '15', '17R', '20', '22', '24']);
    expect(onString(positions, 1)).toEqual(['0', '3', '5R', '8', '10', '12', '15', '17R', '20', '22', '24']);
    expect(onString(positions, 3)).toEqual(['0', '2R', '5', '7', '9', '12', '14R', '17', '19', '21', '24']);
    expect(positions.find((position) => position.string === 5 && position.fret === 0)).toEqual({ string: 5, fret: 0, pitch: 45, isRoot: true });
  });

  it('follows a four-string bass and a seven-string guitar', () => {
    const bass = scaleFretPositions(A_MINOR_PENTATONIC, BASS);
    expect(onString(bass, 4)).toEqual(['0', '3', '5R', '8', '10', '12', '15', '17R', '20', '22', '24']);
    expect(onString(bass, 1)).toEqual(['0', '2R', '5', '7', '9', '12', '14R', '17', '19', '21', '24']);
    expect(onString(scaleFretPositions(A_MINOR_PENTATONIC, SEVEN_STRING), 7)).toEqual(['1', '3', '5', '8', '10R', '13', '15', '17', '20', '22R']);
  });

  it('takes 3 to 10 strings and up to 24 frets', () => {
    expect([MIN_SCALE_STRINGS, MAX_SCALE_STRINGS]).toEqual([3, 10]);
    expect(scaleFretPositions(A_MINOR_PENTATONIC, strings(67, 62, 55)).length).toBeGreaterThan(0);
    const tenStrings = strings(64, 59, 55, 50, 45, 40, 35, 30, 25, 20);
    expect(new Set(scaleFretPositions(A_MINOR_PENTATONIC, tenStrings).map((position) => position.string)).size).toBe(10);
    expect(scaleFretPositions(A_MINOR_PENTATONIC, strings(64, 59))).toEqual([]);
    expect(scaleFretPositions(A_MINOR_PENTATONIC, [...tenStrings, { number: 11, tuning: 15 }])).toEqual([]);
    expect(Math.max(...scaleFretPositions(A_MINOR_PENTATONIC, GUITAR, 12).map((position) => position.fret))).toBe(12);
    expect(Math.max(...scaleFretPositions(A_MINOR_PENTATONIC, GUITAR, 30).map((position) => position.fret))).toBe(24);
  });

  it('has no positions for no scale', () => {
    expect(scaleFretPositions({ rootIndex: 0, scaleIndex: -1 }, GUITAR)).toEqual([]);
  });
});

describe('scaleBoxes', () => {
  it('cuts the neck into one five-fret box per scale note on the lowest string, from the root up', () => {
    // Act
    const boxes = scaleBoxes(A_MINOR_PENTATONIC, GUITAR);

    // Assert: the five pentatonic boxes, starting on A at fret 5
    expect(SCALE_BOX_FRETS).toBe(5);
    expect(boxes.map((box) => [box.firstFret, box.lastFret])).toEqual([[4, 8], [7, 11], [9, 13], [11, 15], [14, 18]]);
    const first = boxes[0]!.positions;
    expect(onString(first, 6)).toEqual(['5R', '8']);
    expect(onString(first, 3)).toEqual(['5', '7']);
    expect(onString(first, 1)).toEqual(['5R', '8']);
  });

  it('gives a bass its boxes from its own lowest string', () => {
    const boxes = scaleBoxes(choice('E', 'Major Scale'), BASS);
    expect(boxes).toHaveLength(7);
    expect(boxes[0]).toMatchObject({ firstFret: 0, lastFret: 4 });
    expect(onString(boxes[0]!.positions, 4)).toEqual(['0R', '2', '4']);
  });

  it('moves a box that would run past the last fret an octave down', () => {
    const boxes = scaleBoxes(choice('D#', 'Major Scale'), GUITAR);
    expect(boxes.every((box) => box.lastFret <= 24 && box.firstFret >= 0)).toBe(true);
    expect(boxes.at(-1)).toMatchObject({ firstFret: 9, lastFret: 13 });
  });

  it('keeps one box where two start at the nut, and has none without a scale', () => {
    const phrygian = scaleBoxes(choice('E', 'Phrygian Mode'), GUITAR);
    expect(phrygian.filter((box) => box.firstFret === 0)).toHaveLength(1);
    expect(scaleBoxes({ rootIndex: 0, scaleIndex: -1 }, GUITAR)).toEqual([]);
  });
});
