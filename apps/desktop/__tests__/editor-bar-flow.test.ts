import { type Beat, type Song, type StringAddress } from '@gp-editor/core';
import { type EditorAction, type EditorState, INITIAL_EDITOR_STATE, editorReducer } from '../src/state/editor';
import { beat, makeSong, note } from '../test-support/songs';

// The editor's beat edits ripple across bar lines (gp-core flowVoiceOn / pullVoiceBack): one undo step, the cursor on
// the edited beat (or the beat that took its place), and a hint that says what moved.

const BAR = 3840;
const QUARTER_TICKS = 960;

/** Bar `index` of quarters on string 1 with these frets; undefined = a quarter rest. */
function bar(index: number, played: readonly (number | undefined)[]): Beat[] {
  return played.map((fret, i) => beat(960 + index * BAR + i * QUARTER_TICKS, fret === undefined ? [] : [note(1, fret)]));
}

function loaded(...bars: readonly (readonly (number | undefined)[])[]): EditorState {
  const song = makeSong(bars.map((played, index) => bar(index, played)));
  return editorReducer(INITIAL_EDITOR_STATE, { type: 'loaded', document: { fileName: 'a.gp5', path: '/a.gp5', song } });
}

function at(measureIndex: number, beatIndex: number): StringAddress {
  return { trackIndex: 0, measureIndex, beatIndex, voiceIndex: 0, string: 1 };
}

function reduce(state: EditorState, ...actions: EditorAction[]): EditorState {
  return actions.reduce(editorReducer, state);
}

const place = (cursor: StringAddress): EditorAction => ({ type: 'placeCursor', cursor });
const insertBeat: EditorAction = { type: 'edit', edit: { type: 'insertBeat' } };
const erase: EditorAction = { type: 'edit', edit: { type: 'erase' } };
const deleteBeat: EditorAction = { type: 'edit', edit: { type: 'deleteBeat' } };
const halfNote: EditorAction = { type: 'edit', edit: { type: 'setNoteValue', value: 2 } };

const song = (state: EditorState): Song => state.document!.song;

/** The frets (r = rest, ~ = tied) of bar `measureIndex`, voice 1. */
function frets(state: EditorState, measureIndex: number): string[] {
  return (song(state).tracks[0]?.measures[measureIndex]?.beats ?? []).map((entry) => {
    const notes = entry.voices[0]?.notes ?? [];
    return notes.length === 0 ? 'r' : notes.map((played) => `${played.fret}${played.isTied ? '~' : ''}`).join(',');
  });
}

describe('beat edits that move music across bar lines', () => {
  it('moves the last note of a full bar on into the next bar when a beat is inserted, in one undo step', () => {
    // Arrange
    const start = reduce(loaded([0, 1, 2, 3], [4, 5, undefined, undefined]), place(at(0, 0)));

    // Act
    const inserted = reduce(start, insertBeat);

    // Assert
    expect(frets(inserted, 0)).toEqual(['0', 'r', '1', '2']);
    expect(frets(inserted, 1)).toEqual(['3', '4', '5', 'r']);
    expect(inserted.cursor).toMatchObject({ measureIndex: 0, beatIndex: 1 });
    expect(inserted.hint).toBe('1 note moved on into bar 2.');
    expect(inserted.past).toHaveLength(1);
    expect(song(reduce(inserted, { type: 'undo' }))).toBe(song(start));
  });

  it('puts the cursor on the beat inserted after a full bar’s last beat, in the next bar', () => {
    const inserted = reduce(loaded([0, 1, 2, 3], [4, 5, undefined, undefined]), place(at(0, 3)), insertBeat);
    expect(frets(inserted, 1)).toEqual(['r', '4', '5', 'r']);
    expect(inserted.cursor).toMatchObject({ measureIndex: 1, beatIndex: 0 });
    expect(inserted.hint).toBe('Rests moved on into bar 2.');
  });

  it('says how far the ripple went and that bars were added at the end', () => {
    const inserted = reduce(loaded([0, 1, 2, 3], [4, 5, 6, 7]), place(at(0, 0)), insertBeat);
    expect(frets(inserted, 2)).toEqual(['7', 'r']);
    expect(inserted.hint).toBe('1 note moved on into bar 2; the voice moved later up to bar 3. A bar was added at the end.');
  });

  it('moves a longer note’s excess on as a tied note, the cursor staying on it', () => {
    const longer = reduce(loaded([0, 1, 2, 3], [undefined, undefined, undefined, undefined]), place(at(0, 3)), halfNote);
    expect(frets(longer, 1)[0]).toBe('3~');
    expect(longer.cursor).toMatchObject({ measureIndex: 0, beatIndex: 3 });
    expect(longer.hint).toBe('1 note moved on into bar 2.');
  });

  it('pulls the next bar’s first note back when a rest is deleted (⌫), in one undo step', () => {
    // Arrange
    const start = reduce(loaded([0, undefined, 2, 3], [4, 5, 6, undefined]), place(at(0, 1)));

    // Act
    const erased = reduce(start, erase);

    // Assert
    expect(frets(erased, 0)).toEqual(['0', '2', '3', '4']);
    expect(frets(erased, 1)).toEqual(['5', '6', 'r', 'r']);
    expect(erased.cursor).toMatchObject({ measureIndex: 0, beatIndex: 1 });
    expect(erased.hint).toBe('1 note pulled back from bar 2.');
    expect(song(reduce(erased, { type: 'undo' }))).toBe(song(start));
  });

  it('pulls back through several bars when a beat is deleted (⇧⌫)', () => {
    const deleted = reduce(loaded([0, 1, 2, 3], [4, 5, 6, 7], [8, undefined, undefined, undefined]), place(at(0, 0)), deleteBeat);
    expect(frets(deleted, 1)).toEqual(['5', '6', '7', '8']);
    expect(deleted.hint).toBe('1 note pulled back from bar 2; the voice moved earlier up to bar 3.');
  });

  it('leaves no hint when the bar’s own rests take the edit', () => {
    const inserted = reduce(loaded([0, 1, undefined, undefined], [4, 5, 6, 7]), place(at(0, 0)), insertBeat);
    expect(frets(inserted, 1)).toEqual(['4', '5', '6', '7']);
    expect(inserted.hint).toBeUndefined();
  });
});
