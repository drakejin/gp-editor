import type { Chord } from '@gp-editor/core';
import { draftChord, draftFromChord, draftFromNotes, renameDraft, shiftDraftWindow, toggleDraftString } from '../src/lib/chord-grid';
import { note } from '../test-support/songs';

const TUNING = [64, 59, 55, 50, 45, 40];
const EMPTY = draftFromChord(undefined, TUNING);

describe('draftFromChord', () => {
  it('starts empty at the nut without a chord, and takes a chord as it is', () => {
    const chord: Chord = { name: 'D', firstFret: 5, frets: [5, 7, 7, 7, 5, -1] };
    expect(EMPTY).toEqual({ frets: [-1, -1, -1, -1, -1, -1], firstFret: 1, name: '', isNameEdited: false });
    expect(draftFromChord(chord, TUNING)).toEqual({ frets: [5, 7, 7, 7, 5, -1], firstFret: 5, name: 'D', isNameEdited: false });
  });

  it('fits a chord of another track’s strings to these strings', () => {
    expect(draftFromChord({ name: 'G', firstFret: 1, frets: [3, 0, 0, 0] }, TUNING).frets).toEqual([3, 0, 0, 0, -1, -1]);
  });
});

describe('toggleDraftString', () => {
  it('puts a finger on a fret and takes it off again, naming the chord as it goes', () => {
    // Act
    const steps = [
      { string: 5, fret: 3 },
      { string: 4, fret: 2 },
      { string: 2, fret: 1 },
    ].reduce((draft, { string, fret }) => toggleDraftString(draft, string, fret, TUNING), EMPTY);
    const open = [1, 3].reduce((draft, string) => toggleDraftString(draft, string, 'open', TUNING), steps);

    // Assert
    expect(open.frets).toEqual([0, 1, 0, 2, 3, -1]);
    expect(open.name).toBe('C');
    expect(toggleDraftString(open, 2, 1, TUNING).frets).toEqual([0, -1, 0, 2, 3, -1]);
    expect(toggleDraftString(open, 1, 'open', TUNING).frets[0]).toBe(-1);
  });

  it('moves a string’s finger to the fret clicked', () => {
    const fretted = toggleDraftString(EMPTY, 3, 2, TUNING);
    expect(toggleDraftString(fretted, 3, 4, TUNING).frets[2]).toBe(4);
  });

  it('keeps a name the user typed', () => {
    const named = renameDraft(EMPTY, 'Mystery');
    expect(toggleDraftString(named, 1, 'open', TUNING).name).toBe('Mystery');
  });
});

describe('shiftDraftWindow', () => {
  it('moves the window and the fingers with it, as TuxGuitar’s fret scroll does', () => {
    // Arrange
    const barre = draftFromChord({ name: 'F', firstFret: 1, frets: [1, 1, 2, 3, 3, 1] }, TUNING);

    // Act
    const g = shiftDraftWindow(barre, 2, TUNING);

    // Assert
    expect(g).toMatchObject({ firstFret: 3, frets: [3, 3, 4, 5, 5, 3], name: 'G' });
    expect(shiftDraftWindow(barre, -1, TUNING)).toBe(barre);
  });

  it('keeps open and unplayed strings as they are', () => {
    const open = draftFromChord({ name: 'A', firstFret: 1, frets: [0, 2, 2, 2, 0, -1] }, TUNING);
    expect(shiftDraftWindow(open, 1, TUNING).frets).toEqual([0, 3, 3, 3, 0, -1]);
  });
});

describe('draftFromNotes', () => {
  it('takes the beat’s notes, starting the window where they fit', () => {
    expect(draftFromNotes([note(1, 0), note(2, 1), note(5, 3)], TUNING)).toMatchObject({ frets: [0, 1, -1, -1, 3, -1], firstFret: 1 });
    expect(draftFromNotes([note(1, 7), note(2, 8), note(3, 9)], TUNING)).toMatchObject({ firstFret: 7, name: expect.any(String) as string });
  });
});

describe('draftChord', () => {
  it('is the chord to apply: the frets, the first fret and the name trimmed', () => {
    const draft = renameDraft(toggleDraftString(EMPTY, 1, 'open', TUNING), '  E5 ');
    expect(draftChord(draft)).toEqual({ name: 'E5', firstFret: 1, frets: [0, -1, -1, -1, -1, -1] });
  });
});
