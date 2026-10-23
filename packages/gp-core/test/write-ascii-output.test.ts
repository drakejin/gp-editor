import { describe, expect, it } from 'vitest';
import { bendMovements, noteText } from '../src/write/ascii/ascii-output';
import { buildNote } from './helpers/write-song-builder';

const bendOf = (...values: number[]) => ({ points: values.map((value, index) => ({ position: index * 3, value })) });

describe('bendMovements', () => {
  it.each([
    [[0, 4], [4]],
    [[4, 0], [-4]],
    [[0, 4, 0], [4, -4]],
    [[0, 2, 4, 4, 0], [4, -4]],
    [[4, 4], []],
    [[4], []],
    [[], []],
  ])('turns the bend values %j into the movements %j', (values, movements) => {
    // Act / Assert
    expect(bendMovements(bendOf(...values).points)).toEqual(movements);
  });
});

describe('noteText', () => {
  it('is empty without a note, the fret otherwise', () => {
    // Act / Assert
    expect(noteText(undefined, undefined)).toBe('');
    expect(noteText(buildNote(1, 12), undefined)).toBe('12');
  });

  it('marks a hammer-on, a pull-off or a slide only when the string has a note in the next beat', () => {
    // Arrange
    const hammer = buildNote(1, 5, { effect: { hammer: true } });
    const slide = buildNote(1, 5, { effect: { slides: ['shift'] } });

    // Act / Assert
    expect([noteText(hammer, buildNote(1, 7)), noteText(hammer, buildNote(1, 3)), noteText(hammer, undefined)]).toEqual(['5h', '5p', '5']);
    expect([noteText(slide, buildNote(1, 7)), noteText(slide, buildNote(1, 5)), noteText(slide, undefined)]).toEqual(['5/', '5\\', '5']);
  });

  it('writes no slide mark for a slide into or out of the note', () => {
    // Arrange
    const slideOut = buildNote(1, 5, { effect: { slides: ['outDownwards', 'intoFromBelow'] } });

    // Act / Assert
    expect(noteText(slideOut, buildNote(1, 7))).toBe('5');
  });

  it('writes the bend’s first movement in half steps, rounded down', () => {
    // Arrange
    const bendRelease = buildNote(2, 7, { effect: { bend: bendOf(0, 4, 0) } });
    const quarterToneOver = buildNote(2, 7, { effect: { bend: bendOf(0, 3) } });

    // Act / Assert
    expect(noteText(bendRelease, undefined)).toBe('7b9');
    expect(noteText(quarterToneOver, undefined)).toBe('7b8');
  });

  it('writes an X for a dead note, keeping its hammer mark', () => {
    // Arrange
    const dead = buildNote(3, 0, { effect: { deadNote: true, hammer: true } });

    // Act / Assert
    expect(noteText(dead, buildNote(3, 2))).toBe('Xh');
  });
});
