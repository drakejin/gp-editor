import { QUARTER, type Song } from '@gp-editor/core';
import { type EditorAction, type EditorState, INITIAL_EDITOR_STATE, editorReducer } from '../src/state/editor';
import { isInSelection, selectedFragment, selectionBars, selectionRange, selectionSummary } from '../src/state/selection';
import { beat, makeSong, note, withTrack } from '../test-support/songs';

const BAR = 3840;
const QUARTER_TICKS = 960;

/** Two 4/4 bars of quarter notes on string 1: frets 0–3, then 4–7. */
function twoBars(): Song {
  const bar = (index: number) => [0, 1, 2, 3].map((i) => beat(960 + index * BAR + i * QUARTER_TICKS, [note(1, index * 4 + i)]));
  return makeSong([bar(0), bar(1)]);
}

function reduce(state: EditorState, ...actions: EditorAction[]): EditorState {
  return actions.reduce(editorReducer, state);
}

function loaded(song: Song = twoBars()): EditorState {
  return reduce(INITIAL_EDITOR_STATE, { type: 'loaded', document: { fileName: 'a.gp5', path: '/a.gp5', song } });
}

/** Frets of a bar's beats, `r` for a rest. */
function frets(state: EditorState, measureIndex: number): string[] {
  const beats = state.document?.song.tracks[0]?.measures[measureIndex]?.beats ?? [];
  return beats.map((b) => b.voices[0]?.notes.map((n) => String(n.fret)).join(',') || 'r');
}

const RIGHT: EditorAction = { type: 'extendSelection', step: 1 };

describe('selection', () => {
  it('grows from where the cursor was while the cursor moves with shift', () => {
    // Arrange
    const state = loaded();

    // Act
    const once = reduce(state, RIGHT);
    const twice = reduce(once, RIGHT);

    // Assert
    expect(once.selectionAnchor).toEqual(state.cursor);
    expect(twice.selectionAnchor).toEqual(state.cursor);
    expect(twice.cursor).toMatchObject({ measureIndex: 0, beatIndex: 2 });
    expect(selectionRange(twice)).toEqual({ first: { measureIndex: 0, beatIndex: 0 }, last: { measureIndex: 0, beatIndex: 2 } });
  });

  it('gives the bars a selection spans, first to last, for the loop; nothing without a selection', () => {
    // Arrange: from bar 2's second beat back across the bar line into bar 1
    const placed = reduce(loaded(), { type: 'placeCursor', cursor: { trackIndex: 0, measureIndex: 1, beatIndex: 1, voiceIndex: 0, string: 1 } });
    const backwards = reduce(placed, { type: 'extendSelection', step: -1 }, { type: 'extendSelection', step: -1 });

    // Act / Assert
    expect(selectionBars(backwards)).toEqual({ fromMeasureIndex: 0, toMeasureIndex: 1 });
    expect(selectionBars(placed)).toBeUndefined();
  });

  it('orders the range when it grows backwards across a bar line', () => {
    const state = reduce(loaded(), { type: 'placeCursor', cursor: { trackIndex: 0, measureIndex: 1, beatIndex: 1, voiceIndex: 0, string: 1 } }, { type: 'extendSelection', step: -1 }, { type: 'extendSelection', step: -1 }, { type: 'extendSelection', step: -1 });
    expect(selectionRange(state)).toEqual({ first: { measureIndex: 0, beatIndex: 2 }, last: { measureIndex: 1, beatIndex: 1 } });
  });

  it.each<EditorAction>([
    { type: 'moveCursorBeat', step: 1 },
    { type: 'moveCursorString', delta: 1 },
    { type: 'placeCursor', cursor: { trackIndex: 0, measureIndex: 1, beatIndex: 0, voiceIndex: 0, string: 1 } },
    { type: 'selectTrack', trackIndex: 0 },
    { type: 'clearSelection' },
    { type: 'setNoteFret', fret: 9 },
    { type: 'undo' },
  ])('is cleared by %j', (action) => {
    // Arrange: a selection, and an edit to undo
    const selected = reduce(loaded(), { type: 'setNoteFret', fret: 5 }, RIGHT);

    // Act
    const after = reduce(selected, action);

    // Assert
    expect(selected.selectionAnchor).toBeDefined();
    expect(after.selectionAnchor).toBeUndefined();
  });

  it('stays through actions that neither move the cursor nor edit', () => {
    const selected = reduce(loaded(), RIGHT);
    const after = reduce(selected, { type: 'setMode', mode: 'tab' }, { type: 'dismissHint' }, { type: 'dismissError' });
    expect(after.selectionAnchor).toEqual(selected.selectionAnchor);
  });

  it('lifts the selected beats, or the cursor beat without a selection', () => {
    // Arrange
    const state = loaded();

    // Act
    const selected = selectedFragment(reduce(state, RIGHT, RIGHT));
    const single = selectedFragment(state);

    // Assert
    expect(selected?.items.map((item) => item.notes[0]?.fret)).toEqual([0, 1, 2]);
    expect(single?.items.map((item) => item.notes[0]?.fret)).toEqual([0]);
    expect(selectedFragment(INITIAL_EDITOR_STATE)).toBeUndefined();
  });

  it('says how many beats from which bars were copied', () => {
    // Arrange
    const state = reduce(loaded(), { type: 'placeCursor', cursor: { trackIndex: 0, measureIndex: 0, beatIndex: 2, voiceIndex: 0, string: 1 } });
    const across = reduce(state, RIGHT, RIGHT, RIGHT);

    // Act
    const one = selectionSummary(state, selectedFragment(state)!);
    const four = selectionSummary(across, selectedFragment(across)!);

    // Assert
    expect(one).toBe('1 beat from bar 1');
    expect(four).toBe('4 beats from bars 1–2');
  });
});

describe('selectTo (a mouse drag, a shift-click)', () => {
  const to = (measureIndex: number, beatIndex: number): EditorAction => ({ type: 'selectTo', cursor: { trackIndex: 0, measureIndex, beatIndex, voiceIndex: 0, string: 1 } });

  it('selects from where the cursor was to the beat dragged to, across a bar line', () => {
    // Act
    const dragged = reduce(loaded(), to(1, 1));

    // Assert
    expect(selectionRange(dragged)).toEqual({ first: { measureIndex: 0, beatIndex: 0 }, last: { measureIndex: 1, beatIndex: 1 } });
    expect(dragged.cursor).toMatchObject({ measureIndex: 1, beatIndex: 1 });
  });

  it('keeps where the drag began while it goes on, and selects nothing back on that beat', () => {
    // Act
    const back = reduce(loaded(), to(1, 1), to(0, 2));
    const home = reduce(back, to(0, 0));

    // Assert
    expect(selectionRange(back)).toEqual({ first: { measureIndex: 0, beatIndex: 0 }, last: { measureIndex: 0, beatIndex: 2 } });
    expect(home.selectionAnchor).toBeUndefined();
    expect(home.cursor).toMatchObject({ measureIndex: 0, beatIndex: 0 });
  });

  it('keeps the selection a drag made until the cursor moves some other way', () => {
    const dragged = reduce(loaded(), to(0, 3));
    expect(reduce(dragged, { type: 'moveCursorString', delta: 1 }).selectionAnchor).toBeUndefined();
    expect(reduce(dragged, to(1, 0)).selectionAnchor).toMatchObject({ measureIndex: 0, beatIndex: 0 });
  });
});

describe('isInSelection (a drag on a selected note moves them all)', () => {
  const at = (measureIndex: number, beatIndex: number, voiceIndex = 0, trackIndex = 0) => ({ trackIndex, measureIndex, beatIndex, voiceIndex });

  it('takes a beat from the selection’s first to its last, across a bar line, in the selection’s track and voice', () => {
    // Arrange: from bar 1's third beat to bar 2's second, selected backwards.
    const placed = reduce(loaded(), { type: 'placeCursor', cursor: { trackIndex: 0, measureIndex: 1, beatIndex: 1, voiceIndex: 0, string: 1 } });
    const selected = reduce(placed, { type: 'extendSelection', step: -1 }, { type: 'extendSelection', step: -1 }, { type: 'extendSelection', step: -1 });

    // Act + Assert
    expect([at(0, 2), at(0, 3), at(1, 0), at(1, 1)].map((each) => isInSelection(selected, each))).toEqual([true, true, true, true]);
    expect([at(0, 1), at(1, 2)].map((each) => isInSelection(selected, each))).toEqual([false, false]);
    expect(isInSelection(selected, at(0, 3, 1))).toBe(false);
    expect(isInSelection(selected, at(0, 3, 0, 1))).toBe(false);
  });

  it('takes nothing without a selection, not even the cursor’s beat', () => {
    expect(isInSelection(loaded(), at(0, 0))).toBe(false);
  });
});

describe('cutSelection', () => {
  it('takes the selected beats out of the track, rests in their place: nothing after them moves', () => {
    // Arrange: a second track; beats 2–3 of bar 1 selected
    const state = reduce(loaded(withTrack(twoBars(), [[beat(960, [note(2, 9)])], []])), { type: 'moveCursorBeat', step: 1 }, RIGHT);

    // Act
    const cut = reduce(state, { type: 'cutSelection' });

    // Assert
    expect(frets(cut, 0)).toEqual(['0', 'r', 'r', '3']);
    expect(frets(cut, 1)).toEqual(['4', '5', '6', '7']);
    expect(cut.document?.song.tracks[1]).toBe(state.document?.song.tracks[1]);
    expect(cut.document?.song.measureHeaders).toBe(state.document?.song.measureHeaders);
    expect(cut.cursor).toMatchObject({ measureIndex: 0, beatIndex: 1 });
    expect(cut.selectionAnchor).toBeUndefined();
    expect(cut.past).toHaveLength(1);
    expect(reduce(cut, { type: 'undo' }).document?.song).toBe(state.document?.song);
  });

  it('cuts the cursor beat when nothing is selected', () => {
    const cut = reduce(loaded(), { type: 'cutSelection' });
    expect(frets(cut, 0)).toEqual(['r', '1', '2', '3']);
    expect(cut.cursor).toMatchObject({ measureIndex: 0, beatIndex: 0 });
  });

  it('gives the song back when the cut beats are pasted where they were (⌘X, then ⌘V)', () => {
    // Arrange: bar 1's last two beats and bar 2's first two selected
    const state = reduce(loaded(), { type: 'moveCursorBeat', step: 1 }, { type: 'moveCursorBeat', step: 1 }, RIGHT, RIGHT, RIGHT);
    const fragment = selectedFragment(state)!;

    // Act
    const cut = reduce(state, { type: 'cutSelection' });
    const pasted = reduce(cut, { type: 'pasteBeats', fragment });

    // Assert
    expect(frets(cut, 0)).toEqual(['0', '1', 'r', 'r']);
    expect(frets(cut, 1)).toEqual(['r', 'r', '6', '7']);
    expect(pasted.document?.song).toEqual(state.document?.song);
    expect(pasted.hint).toBe('4 beats pasted over bars 1–2 of Guitar.');
  });

  it('does nothing without a document', () => {
    expect(reduce(INITIAL_EDITOR_STATE, { type: 'cutSelection' })).toBe(INITIAL_EDITOR_STATE);
  });
});

describe('selectBeats', () => {
  it('selects the beats as given, a single beat too, which a drag back onto its beat does not', () => {
    // Arrange
    const beat3 = { trackIndex: 0, measureIndex: 0, beatIndex: 2, voiceIndex: 0, string: 1 };

    // Act
    const one = reduce(loaded(), { type: 'selectBeats', anchor: beat3, cursor: beat3 });

    // Assert
    expect(selectionRange(one)).toEqual({ first: { measureIndex: 0, beatIndex: 2 }, last: { measureIndex: 0, beatIndex: 2 } });
    expect(selectedFragment(one)?.items).toHaveLength(1);
    expect(reduce(loaded(), { type: 'selectTo', cursor: { ...beat3, beatIndex: 0 } }).selectionAnchor).toBeUndefined();
  });
});

describe('pasteBeats', () => {
  it('writes the beats over the bar from the cursor as one undo step (Guitar Pro 8), the cursor on the first pasted beat', () => {
    // Arrange
    const state = loaded();
    const fragment = selectedFragment(reduce(state, RIGHT))!;
    const atSecondBar = reduce(state, { type: 'placeCursor', cursor: { trackIndex: 0, measureIndex: 1, beatIndex: 2, voiceIndex: 0, string: 1 } });

    // Act
    const pasted = reduce(atSecondBar, { type: 'pasteBeats', fragment });

    // Assert: nothing moves on, so the track keeps time with the others
    expect(frets(pasted, 1)).toEqual(['4', '5', '0', '1']);
    expect(pasted.document?.song.measureHeaders).toHaveLength(2);
    expect(pasted.cursor).toMatchObject({ measureIndex: 1, beatIndex: 2 });
    expect(pasted.past).toHaveLength(1);
    expect(pasted.hint).toBe('2 beats pasted over bar 2 of Guitar.');
  });

  it('pastes beats longer than a bar over this track’s bars from the cursor: no bar added, the other tracks untouched', () => {
    // Arrange: a second track; five beats copied (bar 1 and the first beat of bar 2), the cursor on bar 1, beat 2
    const state = loaded(withTrack(twoBars(), [[beat(960, [note(2, 9)], { ...QUARTER, value: 1 })], []]));
    const fragment = selectedFragment(reduce(state, RIGHT, RIGHT, RIGHT, RIGHT))!;
    const atBeat2 = reduce(state, { type: 'placeCursor', cursor: { trackIndex: 0, measureIndex: 0, beatIndex: 1, voiceIndex: 0, string: 1 } });

    // Act
    const pasted = reduce(atBeat2, { type: 'pasteBeats', fragment });

    // Assert
    expect(frets(pasted, 0)).toEqual(['0', '0', '1', '2']);
    expect(frets(pasted, 1)).toEqual(['3', '4', '6', '7']);
    expect(pasted.document?.song.measureHeaders).toBe(state.document?.song.measureHeaders);
    expect(pasted.document?.song.tracks[1]).toBe(state.document?.song.tracks[1]);
    expect(pasted.cursor).toMatchObject({ measureIndex: 0, beatIndex: 1 });
    expect(pasted.hint).toBe('5 beats pasted over bars 1–2 of Guitar.');
    expect(pasted.past).toHaveLength(1);
    expect(reduce(pasted, { type: 'undo' }).document?.song).toBe(state.document?.song);
  });

  it('adds bars at the end only when the paste runs past the last bar, and says so', () => {
    // Arrange: five beats copied, the cursor on bar 2, beat 2
    const state = loaded();
    const fragment = selectedFragment(reduce(state, RIGHT, RIGHT, RIGHT, RIGHT))!;
    const atSecondBar = reduce(state, { type: 'placeCursor', cursor: { trackIndex: 0, measureIndex: 1, beatIndex: 1, voiceIndex: 0, string: 1 } });

    // Act
    const pasted = reduce(atSecondBar, { type: 'pasteBeats', fragment });

    // Assert
    expect(frets(pasted, 1)).toEqual(['4', '0', '1', '2']);
    expect(frets(pasted, 2)).toEqual(['3', '4', 'r']);
    expect(pasted.cursor).toMatchObject({ measureIndex: 1, beatIndex: 1 });
    expect(pasted.hint).toBe('5 beats pasted over bars 2–3 of Guitar. A bar was added at the end of the song (rests in the other tracks).');
    expect(pasted.past).toHaveLength(1);
  });

  it('leaves the song alone and says why when drum beats are pasted into a guitar track', () => {
    // Arrange
    const state = loaded();
    const drums = { isPercussion: true, items: selectedFragment(state)!.items };

    // Act
    const refused = reduce(state, { type: 'pasteBeats', fragment: drums });

    // Assert
    expect(refused.document).toBe(state.document);
    expect(refused.past).toHaveLength(0);
    expect(refused.hint).toBe('Beats copied from a drum track paste into drum tracks only.');
  });

  it('says so when a paste changes nothing (beats that cannot be written there)', () => {
    const state = loaded();
    const pasted = reduce(state, { type: 'pasteBeats', fragment: { isPercussion: false, items: [] } });
    expect(pasted.document?.song).toBe(state.document?.song);
    expect(pasted.hint).toBe('Nothing changed: the copied beats cannot be written here, or are here already.');
  });

  it('says why guitar beats do not paste into a drum track', () => {
    const song = twoBars();
    const drumSong = { ...song, tracks: song.tracks.map((track) => ({ ...track, isPercussion: true })) };
    const state = loaded(drumSong);
    const guitar = { isPercussion: false, items: selectedFragment(state)!.items };
    expect(reduce(state, { type: 'pasteBeats', fragment: guitar }).hint).toBe('Only beats copied from a drum track paste into a drum track.');
  });

  it('does nothing without a document', () => {
    const fragment = selectedFragment(loaded())!;
    expect(reduce(INITIAL_EDITOR_STATE, { type: 'pasteBeats', fragment })).toBe(INITIAL_EDITOR_STATE);
  });
});

describe('clipboardFailed', () => {
  it('shows the failure in the error banner', () => {
    const state = reduce(loaded(), { type: 'clipboardFailed', message: 'pasteboard busy' });
    expect(state.error).toBe('Could not use the clipboard: pasteboard busy');
  });
});
