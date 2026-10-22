import { findNote } from '@gp-editor/core';
import { type EditorState, HISTORY_LIMIT, INITIAL_EDITOR_STATE, editorReducer, isEdited } from '../src/state/editor';
import { beat, makeSong, note } from '../test-support/songs';

/** Bar 1: beat 0 = strings 1 (fret 3) and 2 (fret 5); bar 2: beat 0 = string 6 (fret 0). */
function loadedState(): EditorState {
  const song = makeSong([[beat(960, [note(1, 3), note(2, 5)])], [beat(4800, [note(6, 0)])]]);
  return editorReducer(INITIAL_EDITOR_STATE, { type: 'loaded', document: { fileName: 'a.gp5', path: '/a.gp5', song } });
}

const at = (state: EditorState) => state.cursor!;
const song = (state: EditorState) => state.document!.song;

describe('editorReducer: loading and modes', () => {
  it('tracks loading, cancel and failure', () => {
    const loading = editorReducer(INITIAL_EDITOR_STATE, { type: 'loadStarted' });
    expect(loading.isLoading).toBe(true);
    expect(editorReducer(loading, { type: 'loadCancelled' }).isLoading).toBe(false);
    const failed = editorReducer(loading, { type: 'loadFailed', message: 'bad header' });
    expect(failed).toMatchObject({ isLoading: false, error: 'Could not open the file: bad header' });
    expect(editorReducer(failed, { type: 'dismissError' }).error).toBeUndefined();
  });

  it('starts a fresh history with the cursor on the first beat, keeping the score mode', () => {
    const tabMode = editorReducer(INITIAL_EDITOR_STATE, { type: 'setMode', mode: 'tab' });
    const state = editorReducer(tabMode, { type: 'loaded', document: loadedState().document! });
    expect(state).toMatchObject({ past: [], future: [], trackIndex: 0, mode: 'tab' });
    expect(state.cursor).toEqual({ trackIndex: 0, measureIndex: 0, beatIndex: 0, voiceIndex: 0, string: 1 });
  });

  it('creates a blank sheet in the chosen view, unsaved and not yet edited', () => {
    // Arrange
    const opened = editorReducer(loadedState(), { type: 'setNoteFret', fret: 7 });

    // Act
    const state = editorReducer(opened, { type: 'created', mode: 'notation' });

    // Assert
    expect(state).toMatchObject({ mode: 'notation', past: [], future: [], trackIndex: 0, document: { fileName: 'Untitled', path: '' } });
    expect(state.document!.song.tracks).toHaveLength(1);
    expect(state.cursor).toEqual({ trackIndex: 0, measureIndex: 0, beatIndex: 0, voiceIndex: 0, string: 1 });
    expect(isEdited(state)).toBe(false);
  });
});

describe('editorReducer: cursor', () => {
  it('moves between strings with ↑/↓, also onto empty strings, and stops at the edges', () => {
    // Arrange
    const start = loadedState();

    // Act
    const down = editorReducer(editorReducer(start, { type: 'moveCursorString', delta: 1 }), { type: 'moveCursorString', delta: 1 });
    const up = editorReducer(start, { type: 'moveCursorString', delta: -1 });

    // Assert
    expect(at(down).string).toBe(3);
    expect(findNote(song(down), at(down))).toBeUndefined();
    expect(at(up).string).toBe(1);
  });

  it('moves between beats with ←/→ across bar lines and stays at the ends', () => {
    const next = editorReducer(loadedState(), { type: 'moveCursorBeat', step: 1 });
    expect(at(next)).toMatchObject({ measureIndex: 1, beatIndex: 0, string: 1 });
    expect(editorReducer(next, { type: 'moveCursorBeat', step: 1 }).cursor).toEqual(at(next));
    expect(at(editorReducer(next, { type: 'moveCursorBeat', step: -1 }))).toMatchObject({ measureIndex: 0, beatIndex: 0 });
  });

  it('places the cursor where the score was clicked', () => {
    const cursor = { trackIndex: 0, measureIndex: 1, beatIndex: 0, voiceIndex: 0, string: 6 };
    expect(editorReducer(loadedState(), { type: 'placeCursor', cursor }).cursor).toEqual(cursor);
  });
});

describe('editorReducer: edits at the cursor', () => {
  it('types a fret on an empty string, adding a note', () => {
    const onString3 = editorReducer(loadedState(), { type: 'placeCursor', cursor: { ...at(loadedState()), string: 3 } });
    const typed = editorReducer(onString3, { type: 'setNoteFret', fret: 7 });
    expect(findNote(song(typed), at(typed))?.fret).toBe(7);
    expect(typed.past).toHaveLength(1);
  });

  it('shifts and deletes the note at the cursor; shifting an empty position does nothing', () => {
    const bumped = editorReducer(loadedState(), { type: 'shiftNoteFret', delta: 1 });
    expect(findNote(song(bumped), at(bumped))?.fret).toBe(4);
    const empty = editorReducer(loadedState(), { type: 'moveCursorString', delta: 3 });
    expect(editorReducer(empty, { type: 'shiftNoteFret', delta: 1 })).toBe(empty);
    const removed = editorReducer(bumped, { type: 'deleteNote' });
    expect(findNote(song(removed), at(removed))).toBeUndefined();
  });

  it('moves the note with ⌥↑/↓ and the cursor follows; a taken string is refused', () => {
    const start = editorReducer(loadedState(), { type: 'moveCursorString', delta: 1 });
    expect(editorReducer(start, { type: 'shiftNoteString', delta: -1 })).toBe(start);
    const moved = editorReducer(start, { type: 'shiftNoteString', delta: 1 });
    expect(at(moved).string).toBe(3);
    expect(findNote(song(moved), at(moved))?.fret).toBe(5);
  });

  it('undoes and redoes, keeping the cursor', () => {
    const edited = editorReducer(loadedState(), { type: 'setNoteFret', fret: 9 });
    const undone = editorReducer(edited, { type: 'undo' });
    expect(findNote(song(undone), at(undone))?.fret).toBe(3);
    expect(undone.cursor).toEqual(edited.cursor);
    const redone = editorReducer(undone, { type: 'redo' });
    expect(findNote(song(redone), at(redone))?.fret).toBe(9);
    expect(editorReducer(redone, { type: 'redo' })).toBe(redone);
    expect(editorReducer(loadedState(), { type: 'undo' }).past).toEqual([]);
  });

  it('caps the undo history', () => {
    let state = loadedState();
    for (let i = 0; i < HISTORY_LIMIT + 5; i++) {
      state = editorReducer(state, { type: 'setNoteFret', fret: i % 2 === 0 ? 1 : 2 });
    }
    expect(state.past).toHaveLength(HISTORY_LIMIT);
  });

  it('switches tracks only to existing ones and keeps the place in the song', () => {
    const moved = editorReducer(loadedState(), { type: 'moveCursorBeat', step: 1 });
    expect(editorReducer(moved, { type: 'selectTrack', trackIndex: 3 })).toBe(moved);
    expect(editorReducer(moved, { type: 'selectTrack', trackIndex: 0 }).cursor).toMatchObject({ measureIndex: 1 });
  });
});
