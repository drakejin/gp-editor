import { DEFAULT_STYLESHEET, setBarWidthScale, setBeatOffset, setSystemBars } from '@gp-editor/core';
import { type EditorState, INITIAL_EDITOR_STATE, editorReducer } from '../src/state/editor';
import { applyLayoutAction, isLayoutAction } from '../src/state/layout-edits';
import { beat, header, makeSong, note, toTux } from '../test-support/songs';

function sixBars() {
  return makeSong(Array.from({ length: 6 }, (_, i) => [beat(toTux(header(i + 1).start), [note(1, i)])]));
}

function loaded(): EditorState {
  return editorReducer(INITIAL_EDITOR_STATE, { type: 'loaded', document: { fileName: 'a.gp', path: '/a.gp', song: sixBars() } });
}

describe('layout actions in the editor', () => {
  it('sets the stylesheet as one undo step, and undo takes it back', () => {
    // Arrange
    const state = loaded();

    // Act
    const styled = editorReducer(state, { type: 'setStylesheet', stylesheet: { ...DEFAULT_STYLESHEET, scale: 1.5 } });
    const undone = editorReducer(styled, { type: 'undo' });

    // Assert
    expect(styled.document?.song.stylesheet?.scale).toBe(1.5);
    expect(styled.past).toHaveLength(1);
    expect(undone.document?.song.stylesheet).toBeUndefined();
  });

  it('records nothing when the action changes nothing', () => {
    const state = loaded();
    expect(editorReducer(state, { type: 'setStylesheet', stylesheet: DEFAULT_STYLESHEET })).toBe(state);
  });

  it('turns Design Mode on and off, as view state (no undo step)', () => {
    const on = editorReducer(loaded(), { type: 'toggleDesignMode' });
    expect(on.isDesignMode).toBe(true);
    expect(on.past).toHaveLength(0);
    expect(editorReducer(on, { type: 'toggleDesignMode' }).isDesignMode).toBe(false);
  });

  it('knows its own actions', () => {
    expect(isLayoutAction({ type: 'resetPositions' })).toBe(true);
    expect(isLayoutAction({ type: 'undo' })).toBe(false);
  });
});

describe('applyLayoutAction', () => {
  it('moves a beat and widens a bar', () => {
    const song = sixBars();
    expect(applyLayoutAction(song, { type: 'setBeatOffset', measureIndex: 1, at: 0, offset: 4 })).toEqual(setBeatOffset(song, 1, 0, 4));
    expect(applyLayoutAction(song, { type: 'setBarWidthScale', measureIndex: 2, widthScale: 1.5 })).toEqual(setBarWidthScale(song, 2, 1.5));
  });

  it('grows a system over the next system’s start, which goes', () => {
    // Arrange: systems start at bars 1 (two bars) and 3
    const song = setSystemBars(setSystemBars(sixBars(), 0, 2), 2, 0);

    // Act
    const grown = applyLayoutAction(song, { type: 'setSystemSize', measureIndex: 0, bars: 3 });

    // Assert
    expect(grown.measureHeaders[0]?.design).toEqual({ systemBars: 3 });
    expect(grown.measureHeaders[2]?.design).toBeUndefined();
  });

  it('keeps a system at one bar at least and within the song', () => {
    const song = sixBars();
    expect(applyLayoutAction(song, { type: 'setSystemSize', measureIndex: 4, bars: 0 }).measureHeaders[4]?.design).toEqual({ systemBars: 1 });
    expect(applyLayoutAction(song, { type: 'setSystemSize', measureIndex: 4, bars: 9 }).measureHeaders[4]?.design).toEqual({ systemBars: 2 });
  });

  it('starts a system at a bar, then takes the start away', () => {
    const started = applyLayoutAction(sixBars(), { type: 'toggleSystemStart', measureIndex: 3 });
    expect(started.measureHeaders[3]?.design).toEqual({ systemBars: 0 });
    expect(applyLayoutAction(started, { type: 'toggleSystemStart', measureIndex: 3 }).measureHeaders[3]?.design).toBeUndefined();
  });

  it('resets the bars named, or every bar', () => {
    // Arrange
    const song = setBarWidthScale(setBeatOffset(sixBars(), 0, 0, 3), 4, 2);

    // Act
    const some = applyLayoutAction(song, { type: 'resetPositions', measureIndexes: [0] });
    const all = applyLayoutAction(song, { type: 'resetPositions' });

    // Assert
    expect(some.measureHeaders[0]?.design).toBeUndefined();
    expect(some.measureHeaders[4]?.design).toEqual({ widthScale: 2 });
    expect(all.measureHeaders.every((each) => each.design === undefined)).toBe(true);
  });
});
