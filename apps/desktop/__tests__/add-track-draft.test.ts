import { GM_INSTRUMENT_NAMES } from '@gp-editor/core';
import {
  defaultTrackName,
  draftTuning,
  initialAddTrackDraft,
  shiftDraftCapo,
  soundChoices,
  toNewTrack,
  withFamily,
  withKind,
  withProgram,
  withStringCount,
  withTuning,
} from '../src/lib/add-track-draft';

describe('the Add Track panel’s draft', () => {
  it('starts as a 6-string guitar in standard tuning, steel strings, no capo', () => {
    // Arrange / Act
    const draft = initialAddTrackDraft();

    // Assert
    expect(draft).toEqual({ kind: 'guitar', stringCount: 6, tuningId: 'guitar-standard', program: 25, name: '', capo: 0 });
    expect(draftTuning(draft)?.tuning).toEqual([64, 59, 55, 50, 45, 40]);
    expect(defaultTrackName(draft)).toBe('Guitar');
  });

  it('takes another kind’s strings, tuning and sound, keeping a typed name', () => {
    // Arrange
    const draft = { ...initialAddTrackDraft(), name: 'Low end', capo: 2 };

    // Act
    const bass = withKind(draft, 'bass');

    // Assert
    expect(bass).toEqual({ kind: 'bass', stringCount: 4, tuningId: 'bass-standard', program: 33, name: 'Low end', capo: 2 });
  });

  it('gives drums no strings, tuning, sound or capo', () => {
    // Arrange / Act
    const drums = withKind({ ...initialAddTrackDraft(), capo: 3 }, 'drums');

    // Assert
    expect(drums).toMatchObject({ kind: 'drums', stringCount: 0, tuningId: '', capo: 0 });
    expect(soundChoices(drums)).toEqual([]);
    expect(toNewTrack(drums)).toEqual({ kind: 'drums', name: undefined });
  });

  it('changes the string count to the first tuning of that count, and ignores a count the kind does not have', () => {
    // Arrange
    const draft = initialAddTrackDraft();

    // Act
    const seven = withStringCount(draft, 7);

    // Assert
    expect(seven).toMatchObject({ stringCount: 7, tuningId: 'guitar-7-standard' });
    expect(withStringCount(draft, 5)).toBe(draft);
  });

  it('picks a tuning of the draft’s string count only', () => {
    const draft = initialAddTrackDraft();
    expect(withTuning(draft, 'guitar-drop-d').tuningId).toBe('guitar-drop-d');
    expect(withTuning(draft, 'bass-standard')).toBe(draft);
  });

  it('offers the eight sounds of the program’s General MIDI family; Other browses every family', () => {
    // Arrange
    const other = withKind(initialAddTrackDraft(), 'other');

    // Act
    const brass = withFamily(other, 7);

    // Assert
    expect(soundChoices(initialAddTrackDraft())).toEqual([24, 25, 26, 27, 28, 29, 30, 31]);
    expect(brass.program).toBe(56);
    expect(defaultTrackName(brass)).toBe(GM_INSTRUMENT_NAMES[56]);
    expect(withFamily(other, 16)).toBe(other);
    expect(withProgram(other, 130)).toBe(other);
    expect(withProgram(other, 40).program).toBe(40);
  });

  it('keeps the capo within 0–24 and gives the new track what the draft says', () => {
    // Arrange
    const draft = shiftDraftCapo(shiftDraftCapo({ ...initialAddTrackDraft(), name: ' Lead ' }, 1), 1);

    // Act
    const newTrack = toNewTrack(withTuning(draft, 'guitar-drop-d'));

    // Assert
    expect(shiftDraftCapo(initialAddTrackDraft(), -1).capo).toBe(0);
    expect(newTrack).toEqual({ kind: 'guitar', name: 'Lead', program: 25, tuning: [64, 59, 55, 50, 45, 38], capo: 2 });
  });
});
