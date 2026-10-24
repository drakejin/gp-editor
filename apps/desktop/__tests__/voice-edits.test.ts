import { type Song, type StringAddress, findNote, findVoice } from '@gp-editor/core';
import { applySongEdit } from '../src/state/song-edits';
import { refusalHint } from '../src/state/edit-hints';
import { beat, makeSong, note } from '../test-support/songs';

/** Bar 1: four quarters in voice 1, the first a chord on strings 1 and 6. */
const SONG: Song = makeSong([[beat(960, [note(1, 3), note(6, 0)]), beat(1920, [note(2, 5)]), beat(2880, [note(3, 2)]), beat(3840, [note(4, 7)])]]);
const ON_CHORD: StringAddress = { trackIndex: 0, measureIndex: 0, beatIndex: 0, voiceIndex: 0, string: 6 };

describe('moving notes to another voice (Guitar Pro 8’s Move Voice)', () => {
  it('moves the note at the cursor, the chord’s other notes staying', () => {
    // Act
    const moved = applySongEdit(SONG, ON_CHORD, { type: 'moveToVoice', voiceIndex: 1 });

    // Assert
    expect(findNote(moved, { ...ON_CHORD, voiceIndex: 1 })?.fret).toBe(0);
    expect(findVoice(moved, ON_CHORD)?.notes.map((n) => n.string)).toEqual([1]);
  });

  it('moves the whole beat when the cursor’s string has no note', () => {
    // Act
    const moved = applySongEdit(SONG, { ...ON_CHORD, string: 4 }, { type: 'moveToVoice', voiceIndex: 2 });

    // Assert
    expect(findVoice(moved, { ...ON_CHORD, voiceIndex: 2 })?.notes.map((n) => n.string)).toEqual([1, 6]);
    expect(findVoice(moved, ON_CHORD)).toMatchObject({ isEmpty: false, notes: [] });
  });

  it('moves every note of the selected beats, from the selection’s start to the cursor', () => {
    // Act: beats 2 to 4 selected, the cursor on the last
    const moved = applySongEdit(SONG, { ...ON_CHORD, beatIndex: 3, string: 1 }, { type: 'moveToVoice', voiceIndex: 3, from: { measureIndex: 0, beatIndex: 1 } });

    // Assert
    const voice4 = moved.tracks[0]!.measures[0]!.beats.flatMap((b) => b.voices[3]?.notes.map((n) => n.fret) ?? []);
    expect(voice4).toEqual([5, 2, 7]);
    expect(findVoice(moved, ON_CHORD)?.notes).toHaveLength(2);
  });

  it('says why nothing moved', () => {
    // Arrange: voice 2 holds a whole note
    const full = applySongEdit(SONG, ON_CHORD, { type: 'moveToVoice', voiceIndex: 1 });
    const onSecondBeat = { ...ON_CHORD, beatIndex: 1, string: 2 };

    // Act / Assert
    expect(applySongEdit(SONG, ON_CHORD, { type: 'moveToVoice', voiceIndex: 0 })).toBe(SONG);
    expect(refusalHint(SONG, ON_CHORD, { type: 'moveToVoice', voiceIndex: 0 })).toBe('The notes are in voice 1 already.');
    const wholeNote = applySongEdit(full, { ...ON_CHORD, voiceIndex: 1 }, { type: 'setNoteValue', value: 1 });
    expect(applySongEdit(wholeNote, onSecondBeat, { type: 'moveToVoice', voiceIndex: 1 })).toBe(wholeNote);
    expect(refusalHint(wholeNote, onSecondBeat, { type: 'moveToVoice', voiceIndex: 1 })).toBe('Voice 2 plays something else there: nothing moved.');
    const rest = applySongEdit(SONG, onSecondBeat, { type: 'makeRest' });
    expect(refusalHint(rest, onSecondBeat, { type: 'moveToVoice', voiceIndex: 1 })).toBe('No note to move: the cursor’s beat is a rest.');
  });

  it('moves the selected beats all together or not at all, and says so', () => {
    // Arrange: voice 2 holds a whole note from beat 1; beats 2 to 4 selected
    const wholeNote = applySongEdit(applySongEdit(SONG, ON_CHORD, { type: 'moveToVoice', voiceIndex: 1 }), { ...ON_CHORD, voiceIndex: 1 }, { type: 'setNoteValue', value: 1 });
    const edit = { type: 'moveToVoice', voiceIndex: 1, from: { measureIndex: 0, beatIndex: 1 } } as const;
    const cursor = { ...ON_CHORD, beatIndex: 3, string: 1 };

    // Act / Assert
    expect(applySongEdit(wholeNote, cursor, edit)).toBe(wholeNote);
    expect(refusalHint(wholeNote, cursor, edit)).toBe('Voice 2 plays something else there: nothing moved.');
    const rests = [1, 2, 3].reduce((song, beatIndex) => applySongEdit(song, { ...cursor, beatIndex }, { type: 'makeRest' }), SONG);
    expect(refusalHint(rests, cursor, edit)).toBe('No note to move in the selected beats.');
  });
});
