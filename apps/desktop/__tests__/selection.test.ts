import type { Song } from '@gp-editor/core';
import { type EditorAction, type EditorState, INITIAL_EDITOR_STATE, editorReducer } from '../src/state/editor';
import { selectedFragment, selectionRange, selectionSummary } from '../src/state/selection';
import { beat, makeSong, note } from '../test-support/songs';

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

describe('cutSelection', () => {
  it('deletes the selected beats, pulls the next bar back and puts the cursor where they were', () => {
    // Arrange
    const state = reduce(loaded(), { type: 'moveCursorBeat', step: 1 }, RIGHT);

    // Act
    const cut = reduce(state, { type: 'cutSelection' });

    // Assert
    expect(frets(cut, 0)).toEqual(['0', '3', '4', '5']);
    expect(frets(cut, 1)).toEqual(['6', '7', 'r']);
    expect(cut.cursor).toMatchObject({ measureIndex: 0, beatIndex: 1 });
    expect(cut.selectionAnchor).toBeUndefined();
    expect(cut.past).toHaveLength(1);
    expect(reduce(cut, { type: 'undo' }).document?.song).toBe(state.document?.song);
  });

  it('cuts the cursor beat when nothing is selected', () => {
    const cut = reduce(loaded(), { type: 'cutSelection' });
    expect(frets(cut, 0)).toEqual(['1', '2', '3', '4']);
    expect(cut.cursor).toMatchObject({ measureIndex: 0, beatIndex: 0 });
  });

  it('does nothing without a document', () => {
    expect(reduce(INITIAL_EDITOR_STATE, { type: 'cutSelection' })).toBe(INITIAL_EDITOR_STATE);
  });
});

describe('pasteBeats', () => {
  it('inserts the beats at the cursor as one undo step, the cursor on the first pasted beat', () => {
    // Arrange
    const state = loaded();
    const fragment = selectedFragment(reduce(state, RIGHT))!;
    const atSecondBar = reduce(state, { type: 'placeCursor', cursor: { trackIndex: 0, measureIndex: 1, beatIndex: 2, voiceIndex: 0, string: 1 } });

    // Act
    const pasted = reduce(atSecondBar, { type: 'pasteBeats', fragment });

    // Assert
    expect(frets(pasted, 1)).toEqual(['4', '5', '0', '1']);
    expect(frets(pasted, 2)).toEqual(['6', '7', 'r']);
    expect(pasted.cursor).toMatchObject({ measureIndex: 1, beatIndex: 2 });
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
