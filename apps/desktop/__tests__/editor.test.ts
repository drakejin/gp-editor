import { findNote } from '@gp-editor/core';
import { type EditorState, HISTORY_LIMIT, INITIAL_EDITOR_STATE, editorReducer } from '../src/state/editor';
import { beat, makeSong, note } from '../test-support/songs';

const AT = { track: 0, measure: 0, beat: 0, voice: 0, note: 0 };

function loadedState(): EditorState {
  const song = makeSong([[beat(960, [note(1, 3), note(2, 5)])]]);
  return editorReducer(INITIAL_EDITOR_STATE, { type: 'loaded', document: { fileName: 'a.gp5', path: '/a.gp5', song } });
}

function selected(): EditorState {
  return editorReducer(loadedState(), { type: 'selectNote', address: AT });
}

describe('editorReducer', () => {
  it('tracks loading, cancel and failure', () => {
    const loading = editorReducer(INITIAL_EDITOR_STATE, { type: 'loadStarted' });
    expect(loading.isLoading).toBe(true);
    expect(editorReducer(loading, { type: 'loadCancelled' }).isLoading).toBe(false);
    const failed = editorReducer(loading, { type: 'loadFailed', message: 'bad header' });
    expect(failed).toMatchObject({ isLoading: false, error: 'bad header' });
    expect(editorReducer(failed, { type: 'dismissError' }).error).toBeUndefined();
  });

  it('starts a fresh history when a document loads', () => {
    const state = loadedState();
    expect(state.document?.fileName).toBe('a.gp5');
    expect(state).toMatchObject({ past: [], future: [], trackIndex: 0, isLoading: false });
  });

  it('ignores edits without a selection', () => {
    const state = loadedState();
    expect(editorReducer(state, { type: 'setFret', fret: 7 })).toBe(state);
  });

  it('sets, shifts and deletes the selected note with undo history', () => {
    // Arrange
    const start = selected();

    // Act
    const typed = editorReducer(start, { type: 'setFret', fret: 12 });
    const bumped = editorReducer(typed, { type: 'shiftFret', delta: 1 });

    // Assert
    expect(findNote(bumped.document!.song, AT)?.fret).toBe(13);
    expect(bumped.past).toHaveLength(2);
    const removed = editorReducer(bumped, { type: 'deleteNote' });
    expect(removed.document?.song.tracks[0]?.measures[0]?.beats[0]?.voices[0]?.notes).toHaveLength(1);
  });

  it('moves the note between strings and refuses an occupied one', () => {
    const start = selected();
    expect(editorReducer(start, { type: 'shiftString', delta: 1 })).toBe(start);
    const moved = editorReducer(
      editorReducer(start, { type: 'selectNote', address: { ...AT, note: 1 } }),
      { type: 'shiftString', delta: 1 },
    );
    expect(findNote(moved.document!.song, { ...AT, note: 1 })?.string).toBe(3);
  });

  it('undoes and redoes edits', () => {
    const edited = editorReducer(selected(), { type: 'setFret', fret: 9 });
    const undone = editorReducer(edited, { type: 'undo' });
    expect(findNote(undone.document!.song, AT)?.fret).toBe(3);
    expect(undone.future).toHaveLength(1);
    const redone = editorReducer(undone, { type: 'redo' });
    expect(findNote(redone.document!.song, AT)?.fret).toBe(9);
    expect(editorReducer(redone, { type: 'redo' })).toBe(redone);
    expect(editorReducer(loadedState(), { type: 'undo' }).past).toEqual([]);
  });

  it('keeps the selection across undo and redo while the note exists', () => {
    const edited = editorReducer(selected(), { type: 'setFret', fret: 9 });
    expect(editorReducer(edited, { type: 'undo' }).selection).toEqual(AT);
    const deleted = editorReducer(
      editorReducer(selected(), { type: 'selectNote', address: { ...AT, note: 1 } }),
      { type: 'deleteNote' },
    );
    const restored = editorReducer(deleted, { type: 'undo' });
    expect(restored.selection).toBeUndefined();
    expect(editorReducer(restored, { type: 'redo' }).selection).toBeUndefined();
  });

  it('caps the undo history', () => {
    let state = selected();
    for (let i = 0; i < HISTORY_LIMIT + 5; i++) {
      state = editorReducer(state, { type: 'setFret', fret: i % 2 === 0 ? 1 : 2 });
    }
    expect(state.past).toHaveLength(HISTORY_LIMIT);
  });

  it('selects only existing tracks and clears the note selection', () => {
    const state = selected();
    expect(editorReducer(state, { type: 'selectTrack', index: 3 })).toBe(state);
    expect(editorReducer(state, { type: 'selectTrack', index: 0 }).selection).toBeUndefined();
  });
});
