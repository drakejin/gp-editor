import type { Beat, Measure, Note } from '@gp-editor/core';
import {
  nextNoteOnString,
  previousNoteOnString,
} from '../src/score/symbols/links';
import { beat, note } from '../test-support/songs';

function measureOf(beats: Beat[]): Measure {
  return { headerIndex: 0, clef: 'treble', keySignature: 0, beats };
}

function twoVoices(start: number, first: Note[], second: Note[]): Beat {
  const base = beat(start, first);
  return {
    ...base,
    voices: [base.voices[0]!, { ...base.voices[0]!, notes: second }],
  };
}

const emptySecondVoice = (b: Beat): Beat => ({
  ...b,
  voices: [b.voices[0]!, { ...b.voices[0]!, notes: [], isEmpty: true }],
});

describe('nextNoteOnString', () => {
  it('finds the next note on the same string later in the measure, skipping beats that do not play it', () => {
    // Arrange
    const measure = measureOf([
      beat(960, [note(2, 5)]),
      beat(1920, [note(3, 7)]),
      beat(2880, [note(2, 7)]),
    ]);

    // Act
    const next = nextNoteOnString(measure, 0, 0, 2);

    // Assert
    expect(next).toMatchObject({ beatIndex: 2, isInOtherMeasure: false });
    expect(next?.note.fret).toBe(7);
  });

  it('stops at a rest and ignores beats where the voice is empty', () => {
    const rest = measureOf([
      beat(960, [note(2, 5)]),
      beat(1920, []),
      beat(2880, [note(2, 7)]),
    ]);
    expect(nextNoteOnString(rest, 0, 0, 2)).toBeUndefined();
    const empty = measureOf([
      beat(960, [note(2, 5)]),
      emptySecondVoice(beat(1920, [note(2, 6)])),
    ]);
    expect(nextNoteOnString(empty, 0, 1, 2)).toBeUndefined();
  });

  it('looks into the next measure when the string is not played again in this one', () => {
    // Arrange
    const measure = measureOf([beat(960, [note(1, 3)])]);
    const following = measureOf([beat(4800, [note(1, 5)])]);

    // Act
    const next = nextNoteOnString(measure, 0, 0, 1, following);

    // Assert
    expect(next).toMatchObject({ beatIndex: 0, isInOtherMeasure: true });
    expect(nextNoteOnString(measure, 0, 0, 1)).toBeUndefined();
  });

  it('keeps to its voice', () => {
    const measure = measureOf([
      twoVoices(960, [note(1, 3)], [note(4, 2)]),
      twoVoices(1920, [note(4, 5)], [note(4, 4)]),
    ]);
    expect(nextNoteOnString(measure, 0, 1, 4)?.note.fret).toBe(4);
  });
});

describe('previousNoteOnString', () => {
  it('finds the previous note on the string, in this measure or at the end of the previous one', () => {
    // Arrange
    const previous = measureOf([
      beat(960, [note(2, 1)]),
      beat(1920, [note(2, 3)]),
    ]);
    const measure = measureOf([
      beat(4800, [note(3, 0)]),
      beat(5760, [note(2, 5)]),
      beat(6720, [note(2, 7)]),
    ]);

    // Act
    const inMeasure = previousNoteOnString(measure, 2, 0, 2, previous);
    const fromPrevious = previousNoteOnString(measure, 1, 0, 2, previous);

    // Assert
    expect(inMeasure).toMatchObject({ beatIndex: 1, isInOtherMeasure: false });
    expect(fromPrevious).toMatchObject({
      beatIndex: 1,
      isInOtherMeasure: true,
    });
    expect(fromPrevious?.note.fret).toBe(3);
    expect(previousNoteOnString(measure, 1, 0, 2)).toBeUndefined();
  });

  it('stops at a rest', () => {
    const measure = measureOf([
      beat(960, [note(2, 5)]),
      beat(1920, []),
      beat(2880, [note(2, 7)]),
    ]);
    expect(previousNoteOnString(measure, 2, 0, 2)).toBeUndefined();
  });
});
