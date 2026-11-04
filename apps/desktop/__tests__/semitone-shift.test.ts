import type { Beat, Song, StringAddress } from '@gp-editor/core';
import { type EditorAction, type EditorState, INITIAL_EDITOR_STATE, editorReducer } from '../src/state/editor';
import { beat, makeSong, note, onStrings } from '../test-support/songs';

const BAR = 3840;
const QUARTER_TICKS = 960;
const UP: EditorAction = { type: 'shiftPitch', delta: 1 };
const DOWN: EditorAction = { type: 'shiftPitch', delta: -1 };

const at = (bar: number, quarter: number): number => 960 + bar * BAR + quarter * QUARTER_TICKS;

/**
 * Bar 1: a C chord (C3 E3 G3 C4 on strings 5 4 3 2, a chord name over it), its C4 tied into beat 2, then A3 and A4;
 * bar 2: G3 open, B3 open, and the low E open, then a rest.
 */
function song(): Song {
  const chord: Beat = { ...beat(at(0, 0), [note(5, 3), note(4, 2), note(3, 0), note(2, 1)]), chord: { name: 'C', firstFret: 1, frets: [0, 1, 0, 2, 3, -1] } };
  return makeSong([
    [chord, beat(at(0, 1), [{ ...note(2, 1), isTied: true }]), beat(at(0, 2), [note(3, 2)]), beat(at(0, 3), [note(1, 5)])],
    [beat(at(1, 0), [note(3, 0)]), beat(at(1, 1), [note(2, 0)]), beat(at(1, 2), [note(6, 0)]), beat(at(1, 3), [])],
  ]);
}

function reduce(state: EditorState, ...actions: EditorAction[]): EditorState {
  return actions.reduce(editorReducer, state);
}

function loaded(loadedSong: Song = song()): EditorState {
  return reduce(INITIAL_EDITOR_STATE, { type: 'loaded', document: { fileName: 'a.gp5', path: '/a.gp5', song: loadedSong } });
}

function cursorAt(state: EditorState, measureIndex: number, beatIndex: number, string: number, voiceIndex = 0): EditorState {
  const cursor: StringAddress = { trackIndex: 0, measureIndex, beatIndex, voiceIndex, string };
  return reduce(state, { type: 'placeCursor', cursor });
}

/** Each beat of a bar as "string/fret,…" in voice `voiceIndex`. */
function frets(state: EditorState, measureIndex: number, voiceIndex = 0): string[] {
  const beats = state.document?.song.tracks[0]?.measures[measureIndex]?.beats ?? [];
  return beats.map((each) => each.voices[voiceIndex]?.notes.map((n) => `${n.string}/${n.fret}`).join(',') ?? '');
}

describe('editor: a semitone up or down (⌥⇧↑ / ⌥⇧↓)', () => {
  it('moves the selected notes a semitone per press, one undo step each, the selection kept for the next press', () => {
    // Arrange: beats 3–4 of bar 1 selected.
    const selected = reduce(cursorAt(loaded(), 0, 2, 3), { type: 'extendSelection', step: 1 });

    // Act
    const raised = reduce(selected, UP, UP, UP);
    const undone = reduce(raised, { type: 'undo' }, { type: 'undo' }, { type: 'undo' });

    // Assert
    expect(frets(raised, 0)).toEqual(['5/3,4/2,3/0,2/1', '2/1', '3/5', '1/8']);
    expect(raised.selectionAnchor).toEqual(selected.selectionAnchor);
    expect(raised.past).toHaveLength(selected.past.length + 3);
    expect(raised.hint).toBeUndefined();
    expect(undone.document?.song).toBe(selected.document?.song);
  });

  it('leaves the chord name over a selected beat as it was (Tools ▸ Transpose… moves it)', () => {
    // Arrange: bar 1's first two beats.
    const selected = reduce(cursorAt(loaded(), 0, 0, 2), { type: 'extendSelection', step: 1 });

    // Act
    const lowered = reduce(selected, DOWN);

    // Assert: G3 open goes down to F#3 on the only free string that holds it (strings 2, 4 and 5 keep theirs).
    expect(frets(lowered, 0).slice(0, 2)).toEqual(['2/0,4/1,5/2,6/14', '2/0']);
    expect(lowered.document?.song.tracks[0]?.measures[0]?.beats[0]?.chord?.name).toBe('C');
    expect(lowered.document?.song.tracks[0]?.measures[0]?.keySignature).toBe(0);
  });

  it('moves only the note at the cursor without a selection, and the note tied to it', () => {
    // Arrange
    const state = cursorAt(loaded(), 0, 0, 2);

    // Act
    const raised = reduce(state, UP);

    // Assert
    expect(frets(raised, 0)).toEqual(['2/2,3/0,4/2,5/3', '2/2', '3/2', '1/5']);
    expect(raised.cursor).toEqual(state.cursor);
  });

  it('takes the note to another string when its fret runs out, the cursor going with it', () => {
    // Arrange: G3 open on string 3.
    const state = cursorAt(loaded(), 1, 0, 3);

    // Act
    const lowered = reduce(state, DOWN);
    const again = reduce(lowered, DOWN);

    // Assert: F#3 at fret 4 of string 4, then F3 at fret 3.
    expect(frets(lowered, 1)[0]).toBe('4/4');
    expect(lowered.cursor?.string).toBe(4);
    expect(frets(again, 1)[0]).toBe('4/3');
  });

  it('leaves a note no string holds as it was and says so in the hint strip, with no undo step', () => {
    // Arrange: the low E open has nothing below it.
    const state = cursorAt(loaded(), 1, 2, 6);

    // Act
    const lowered = reduce(state, DOWN);

    // Assert
    expect(lowered.document?.song).toBe(state.document?.song);
    expect(lowered.past).toBe(state.past);
    expect(lowered.hint).toBe('No notes moved. 1 note did not fit on the neck at the new pitch and stayed as it was.');
  });

  it('says why where the cursor’s string has no note', () => {
    // Arrange: A3 is on string 3 of bar 1's third beat.
    const state = cursorAt(loaded(), 0, 2, 1);

    // Act
    const raised = reduce(state, UP);

    // Assert
    expect(raised.document?.song).toBe(state.document?.song);
    expect(raised.hint).toBe('String 1 has no note at the cursor: type a fret (0–9) first.');
  });

  it('says the selected beats have no note to move', () => {
    // Arrange: bar 2's last beat, a rest, selected alone.
    const cursor: StringAddress = { trackIndex: 0, measureIndex: 1, beatIndex: 3, voiceIndex: 0, string: 1 };
    const selected = reduce(loaded(), { type: 'selectBeats', anchor: cursor, cursor });

    // Act
    const raised = reduce(selected, UP);

    // Assert
    expect(raised.hint).toBe('No note to move in the selected beats.');
    expect(raised.document?.song).toBe(selected.document?.song);
  });

  it('moves nothing on a drum track, where a note’s fret is its drum, and says so', () => {
    // Arrange
    const drums = onStrings(makeSong([[beat(at(0, 0), [note(1, 36)])]]), [0, 0, 0, 0, 0, 0], { isPercussion: true });
    const state = cursorAt(loaded(drums), 0, 0, 1);

    // Act
    const raised = reduce(state, UP);

    // Assert
    expect(raised.document?.song).toBe(state.document?.song);
    expect(raised.past).toBe(state.past);
    expect(raised.hint).toBe('Drum notes do not move by semitones: a drum note’s fret is the drum it plays.');
  });

  it('leaves a natural harmonic where it is and says why, at the cursor or in a selection', () => {
    // Arrange: a natural harmonic at fret 12 of string 3, then A3 on string 3.
    const harmonic = makeSong([[beat(at(0, 0), [note(3, 12, { harmonic: { type: 'natural', data: 0 } })]), beat(at(0, 1), [note(3, 2)])]]);
    const state = cursorAt(loaded(harmonic), 0, 0, 3);

    // Act
    const raised = reduce(state, UP);
    const both = reduce(state, { type: 'extendSelection', step: 1 }, UP);

    // Assert
    expect(raised.document?.song).toBe(state.document?.song);
    expect(raised.hint).toBe('No notes moved. 1 natural harmonic stayed where it was: it sounds only at its harmonic fret.');
    expect(frets(both, 0)).toEqual(['3/12', '3/3']);
    expect(both.hint).toBe('Transposed 1 note up 1 semitone. 1 natural harmonic stayed where it was: it sounds only at its harmonic fret.');
  });

  it('moves a tied note with the note it continues, so the tie holds', () => {
    // Arrange: the cursor on beat 2's C4, tied to beat 1's.
    const state = cursorAt(loaded(), 0, 1, 2);

    // Act
    const raised = reduce(state, UP);

    // Assert
    expect(frets(raised, 0).slice(0, 2)).toEqual(['2/2,3/0,4/2,5/3', '2/2']);
    expect(raised.document?.song.tracks[0]?.measures[0]?.beats[1]?.voices[0]?.notes[0]?.isTied).toBe(true);
  });

  it('takes the cursor with its note to another string in a selection too', () => {
    // Arrange: bar 2's G3 and B3 open selected, the cursor on the G3 (string 3).
    const selected = reduce(cursorAt(loaded(), 1, 1, 3), { type: 'extendSelection', step: -1 });

    // Act
    const lowered = reduce(selected, DOWN);

    // Assert: G3 → F#3 at fret 4 of string 4, B3 → B♭3 at fret 3 of string 3.
    expect(frets(lowered, 1).slice(0, 2)).toEqual(['4/4', '3/3']);
    expect(lowered.cursor?.string).toBe(4);
    expect(lowered.selectionAnchor).toBeDefined();
  });

  it('moves by several semitones in one undo step (a note dragged up or down)', () => {
    // Arrange: bar 2's G3 open on string 3.
    const state = cursorAt(loaded(), 1, 0, 3);

    // Act
    const raised = reduce(state, { type: 'shiftPitch', delta: 3 });
    const undone = reduce(raised, { type: 'undo' });

    // Assert: B♭3 at fret 3 of string 3.
    expect(frets(raised, 1)[0]).toBe('3/3');
    expect(raised.past).toHaveLength(state.past.length + 1);
    expect(raised.hint).toBeUndefined();
    expect(undone.document?.song).toBe(state.document?.song);
  });

  it('changes nothing and adds no undo step for no semitones (a drag let go where it began)', () => {
    // Arrange
    const state = cursorAt(loaded(), 1, 0, 3);

    // Act
    const unmoved = reduce(state, { type: 'shiftPitch', delta: 0 });

    // Assert
    expect(unmoved).toBe(state);
  });

  it('moves the selected notes of the selection’s voice only (voice 2 here)', () => {
    // Arrange: two beats, each with a note in voice 1 on string 1 and one in voice 2 on string 5; voice 2's selected.
    const twoVoices = (quarter: number, fret: number): Beat => {
      const first = beat(at(0, quarter), [note(1, fret)]);
      return { ...first, voices: [...first.voices, ...beat(at(0, quarter), [note(5, fret)]).voices] };
    };
    const state = reduce(cursorAt(loaded(makeSong([[twoVoices(0, 3), twoVoices(1, 5)]])), 0, 0, 5, 1), { type: 'extendSelection', step: 1 });

    // Act
    const raised = reduce(state, UP);

    // Assert
    expect(frets(raised, 0, 0)).toEqual(['1/3', '1/5']);
    expect(frets(raised, 0, 1)).toEqual(['5/4', '5/6']);
  });
});
