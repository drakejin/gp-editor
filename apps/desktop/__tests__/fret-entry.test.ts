import { findNote, type Song, type StringAddress } from '@gp-editor/core';
import { DIGIT_WINDOW_MS } from '../src/lib/fret-input';
import { type EditorAction, type EditorState, INITIAL_EDITOR_STATE, editorReducer } from '../src/state/editor';
import { beat, makeSong, note, onStrings } from '../test-support/songs';

/** Bar 1: two quarter-note rests and two notes on string 1; bar 2: one rest. The cursor on bar 1's first beat, string 1. */
function openSong(tune: (song: Song) => Song = (song) => song): EditorState {
  const song = tune(makeSong([[beat(960, []), beat(1920, []), beat(2880, [note(1, 0)]), beat(3840, [note(1, 0)])], [beat(4800, [])]]));
  return editorReducer(INITIAL_EDITOR_STATE, { type: 'loaded', document: { fileName: 'a.gp5', path: '/a.gp5', song } });
}

/** A digit typed as the score's `keyIndex`-th key press at `at` ms. */
const digit = (value: number, at: number, keyIndex: number): EditorAction => ({ type: 'typeFretDigit', press: { digit: value, at, keyIndex } });

const run = (state: EditorState, actions: readonly EditorAction[]): EditorState => actions.reduce(editorReducer, state);
const fretAt = (state: EditorState, at: Partial<StringAddress> = {}): number | undefined =>
  findNote(state.document!.song, { trackIndex: 0, measureIndex: 0, beatIndex: 0, voiceIndex: 0, string: 1, ...at })?.fret;

describe('typed digits: two digits at the same note', () => {
  it('make one fret (1 then 2 → 12), one undo step', () => {
    // Arrange
    const opened = openSong();

    // Act
    const typed = run(opened, [digit(1, 0, 1), digit(2, 300, 2)]);

    // Assert
    expect(fretAt(typed)).toBe(12);
    expect(typed.past).toHaveLength(1);
    expect(fretAt(editorReducer(typed, { type: 'undo' }))).toBeUndefined();
  });

  it('make one fret of a leading 0 and the digit after it (0 then 5 → 5), one undo step', () => {
    const typed = run(openSong(), [digit(0, 0, 1), digit(5, 100, 2)]);
    expect(fretAt(typed)).toBe(5);
    expect(typed.past).toHaveLength(1);
  });

  it('start over after Guitar Pro’s short delay', () => {
    const typed = run(openSong(), [digit(1, 0, 1), digit(2, DIGIT_WINDOW_MS + 1, 2)]);
    expect(fretAt(typed)).toBe(2);
  });

  it('type a drum track’s two-digit General MIDI keys (3 then 8 → 38, the snare)', () => {
    const drums = openSong((song) => onStrings(song, [0, 0, 0, 0, 0, 0], { isPercussion: true }));
    expect(fretAt(run(drums, [digit(3, 0, 1), digit(8, 100, 2)]))).toBe(38);
  });

  it('type a fret on a banjo’s short 5th string from two digits, though its first digit alone is no fret there', () => {
    // Arrange: open G, string 5 the short drone string (frets from the nut: 6 and up).
    const banjo = openSong((song) => onStrings(song, [62, 59, 55, 50, 67], { program: 105 }));
    const onDrone = editorReducer(banjo, { type: 'placeCursor', cursor: { trackIndex: 0, measureIndex: 0, beatIndex: 0, voiceIndex: 0, string: 5 } });

    // Act
    const typed = run(onDrone, [digit(1, 0, 1), digit(2, 100, 2)]);

    // Assert: tab fret 12 is stored from the peg, 5 frets up the neck.
    expect(fretAt(typed, { string: 5 })).toBe(7);
    expect(typed.hint).toBeUndefined();
  });
});

describe('typed digits never carry over to the next note', () => {
  it('a digit typed after → starts a new fret on the next beat (the user’s 1 … 2 → 12 on the next note)', () => {
    // Act
    const typed = run(openSong(), [digit(1, 0, 1), { type: 'moveCursorBeat', step: 1 }, digit(2, 200, 3)]);

    // Assert
    expect(fretAt(typed)).toBe(1);
    expect(fretAt(typed, { beatIndex: 1 })).toBe(2);
  });

  it.each<[string, EditorAction]>([
    ['the cursor on another string', { type: 'moveCursorString', delta: 1 }],
    ['a click on another beat', { type: 'placeCursor', cursor: { trackIndex: 0, measureIndex: 0, beatIndex: 2, voiceIndex: 0, string: 1 } }],
    ['a click on the same note', { type: 'placeCursor', cursor: { trackIndex: 0, measureIndex: 0, beatIndex: 0, voiceIndex: 0, string: 1 } }],
    ['the cursor on another voice', { type: 'selectVoice', voiceIndex: 1 }],
    ['an edit (a dot)', { type: 'edit', edit: { type: 'toggleDot' } }],
    ['a fret set another way (− / =)', { type: 'shiftNoteFret', delta: 1 }],
    ['undo', { type: 'undo' }],
  ])('starts over after %s', (_what, between) => {
    // Act: the second digit comes quickly and as the very next key press, yet something happened in between.
    const typed = run(openSong(), [digit(1, 0, 1), between, digit(2, 100, 2)]);

    // Assert
    const frets = [0, 1, 2, 3].flatMap((beatIndex) => [1, 2].map((string) => fretAt(typed, { beatIndex, string, voiceIndex: typed.cursor!.voiceIndex })));
    expect(frets).not.toContain(12);
    expect(frets).toContain(2);
  });

  it('starts over after another key that does not touch the score (Space, a zoom)', () => {
    const typed = run(openSong(), [digit(1, 0, 1), digit(2, 100, 3)]);
    expect(fretAt(typed)).toBe(2);
  });

  it('starts over after a drum kit hit on a drum track', () => {
    const drums = openSong((song) => onStrings(song, [0, 0, 0, 0, 0, 0], { isPercussion: true }));
    const typed = run(drums, [digit(3, 0, 1), { type: 'toggleDrumNote', key: 42 }, digit(8, 100, 2)]);
    expect(fretAt(typed)).toBe(8);
  });

  it('starts over after a chord played on a MIDI keyboard', () => {
    const typed = run(openSong(), [digit(1, 0, 1), { type: 'enterPlayedNotes', notes: [{ pitch: 64, velocity: 90 }] }, digit(2, 100, 2)]);
    expect(fretAt(typed, { beatIndex: 1 })).toBe(2);
  });

  it('keeps going through what changes nothing it acts on (a hint shown)', () => {
    const typed = run(openSong(), [digit(1, 0, 1), { type: 'showHint', hint: 'Exported.' }, digit(2, 100, 2)]);
    expect(fretAt(typed)).toBe(12);
  });
});
