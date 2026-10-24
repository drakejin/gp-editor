import { addTrack, buildNewSong } from '@gp-editor/core';
import { type EditorAction, type EditorState, INITIAL_EDITOR_STATE, editorReducer } from '../src/state/editor';
import { LAST_TRACK_HINT, trackStepAction } from '../src/state/track-edits';
import { remapEditorTracks } from '../src/state/track-remap';

/** A new sheet with a bass and drums added (Track 1, Bass, Drums), the cursor on the bass's string 2 in bar 3. */
function threeTrackState(): EditorState {
  const song = addTrack(addTrack(buildNewSong(), { kind: 'bass' }), { kind: 'drums' });
  const loaded = editorReducer(INITIAL_EDITOR_STATE, { type: 'loaded', document: { fileName: 'a.gp', path: '/a.gp', song } });
  const onBass = editorReducer(loaded, { type: 'selectTrack', trackIndex: 1 });
  return editorReducer(onBass, { type: 'placeCursor', cursor: { trackIndex: 1, measureIndex: 2, beatIndex: 0, voiceIndex: 0, string: 2 } });
}

const names = (state: EditorState) => state.document!.song.tracks.map((track) => track.name);
const run = (state: EditorState, ...actions: EditorAction[]) => actions.reduce(editorReducer, state);

describe('editorReducer: adding tracks', () => {
  it('adds a track after the last one and shows it, keeping the cursor’s bar; one undo step', () => {
    // Arrange
    const state = threeTrackState();

    // Act
    const added = run(state, { type: 'addTrack', track: { kind: 'guitar', name: 'Lead' } });

    // Assert
    expect(names(added)).toEqual(['Track 1', 'Bass', 'Drums', 'Lead']);
    expect(added.trackIndex).toBe(3);
    expect(added.cursor).toMatchObject({ trackIndex: 3, measureIndex: 2, beatIndex: 0 });
    expect(added.past).toHaveLength(1);
  });

  it('undoes an add (the last track left is shown) and redoes it', () => {
    // Arrange
    const added = run(threeTrackState(), { type: 'addTrack', track: { kind: 'guitar' } });

    // Act
    const undone = run(added, { type: 'undo' });
    const redone = run(undone, { type: 'redo' });

    // Assert
    expect(names(undone)).toEqual(['Track 1', 'Bass', 'Drums']);
    expect(undone.trackIndex).toBe(2);
    expect(undone.cursor).toMatchObject({ trackIndex: 2, measureIndex: 2 });
    expect(names(redone)).toHaveLength(4);
    expect(redone.trackIndex).toBe(2);
  });

  it('says why nothing was added for a track the song cannot have', () => {
    // Arrange
    const state = threeTrackState();

    // Act
    const refused = run(state, { type: 'addTrack', track: { kind: 'guitar', tuning: [] } });

    // Assert
    expect(refused.document).toBe(state.document);
    expect(refused.hint).toMatch(/could not be added/);
  });
});

describe('editorReducer: duplicating tracks', () => {
  it('puts the copy right after the track and shows it', () => {
    // Arrange / Act
    const copied = run(threeTrackState(), { type: 'duplicateTrack', trackIndex: 1 });

    // Assert
    expect(names(copied)).toEqual(['Track 1', 'Bass', 'Bass', 'Drums']);
    expect(copied.trackIndex).toBe(2);
    expect(copied.cursor).toMatchObject({ trackIndex: 2, measureIndex: 2, string: 2 });
  });
});

describe('editorReducer: deleting tracks', () => {
  it('shows the track that takes the deleted one’s place, keeping the cursor’s bar', () => {
    // Arrange / Act
    const deleted = run(threeTrackState(), { type: 'deleteTrack', trackIndex: 1 });

    // Assert
    expect(names(deleted)).toEqual(['Track 1', 'Drums']);
    expect(deleted.trackIndex).toBe(1);
    expect(deleted.cursor).toMatchObject({ trackIndex: 1, measureIndex: 2 });
  });

  it('shows the last track when the deleted one was last, and keeps another shown track on its own track', () => {
    // Arrange
    const onDrums = run(threeTrackState(), { type: 'selectTrack', trackIndex: 2 });
    const onBass = threeTrackState();

    // Act
    const lastDeleted = run(onDrums, { type: 'deleteTrack', trackIndex: 2 });
    const firstDeleted = run(onBass, { type: 'deleteTrack', trackIndex: 0 });

    // Assert
    expect(lastDeleted.trackIndex).toBe(1);
    expect(firstDeleted.trackIndex).toBe(0);
    expect(names(firstDeleted)[firstDeleted.trackIndex]).toBe('Bass');
    expect(firstDeleted.cursor).toMatchObject({ trackIndex: 0, measureIndex: 2, string: 2 });
  });

  it('brings a deleted track back on undo, the shown track still shown', () => {
    // Arrange
    const deleted = run(threeTrackState(), { type: 'selectTrack', trackIndex: 2 }, { type: 'deleteTrack', trackIndex: 0 });

    // Act
    const undone = run(deleted, { type: 'undo' });

    // Assert
    expect(names(undone)).toEqual(['Track 1', 'Bass', 'Drums']);
    expect(undone.trackIndex).toBe(2);
    expect(undone.cursor?.trackIndex).toBe(2);
  });

  it('refuses to delete the only track, with a hint', () => {
    // Arrange
    const single = editorReducer(INITIAL_EDITOR_STATE, { type: 'created', mode: 'tab' });

    // Act
    const refused = run(single, { type: 'deleteTrack', trackIndex: 0 });

    // Assert
    expect(refused.document).toBe(single.document);
    expect(refused.hint).toBe(LAST_TRACK_HINT);
    expect(refused.past).toHaveLength(0);
  });
});

describe('editorReducer: moving tracks', () => {
  it('moves a track and the shown track goes with it; undo and redo follow it too', () => {
    // Arrange
    const state = threeTrackState();

    // Act
    const moved = run(state, { type: 'moveTrack', fromIndex: 1, toIndex: 0 });
    const undone = run(moved, { type: 'undo' });
    const redone = run(undone, { type: 'redo' });

    // Assert
    expect(names(moved)).toEqual(['Bass', 'Track 1', 'Drums']);
    expect(moved.trackIndex).toBe(0);
    expect(moved.cursor).toMatchObject({ trackIndex: 0, measureIndex: 2, string: 2 });
    expect(undone.trackIndex).toBe(1);
    expect(redone.trackIndex).toBe(0);
  });

  it('keeps the shown track when another one moves past it', () => {
    const moved = run(threeTrackState(), { type: 'moveTrack', fromIndex: 2, toIndex: 0 });
    expect(names(moved)).toEqual(['Drums', 'Track 1', 'Bass']);
    expect(moved.trackIndex).toBe(2);
  });

  it('steps a track up or down, not past the first or last place', () => {
    const song = threeTrackState().document!.song;
    expect(trackStepAction(song, 1, -1)).toEqual({ type: 'moveTrack', fromIndex: 1, toIndex: 0 });
    expect(trackStepAction(song, 1, 1)).toEqual({ type: 'moveTrack', fromIndex: 1, toIndex: 2 });
    expect(trackStepAction(song, 0, -1)).toBeUndefined();
    expect(trackStepAction(song, 2, 1)).toBeUndefined();
    expect(trackStepAction(song, 5, -1)).toBeUndefined();
  });
});

describe('remapEditorTracks', () => {
  it('moves the selection’s start with its track, and drops it with a deleted track', () => {
    // Arrange
    const state: EditorState = { ...threeTrackState(), selectionAnchor: { trackIndex: 1, measureIndex: 0, beatIndex: 0, voiceIndex: 0, string: 1 } };

    // Act
    const moved = remapEditorTracks(state, [1, 0, 2]);
    const deleted = remapEditorTracks(state, [0, undefined, 1]);

    // Assert
    expect(moved.selectionAnchor?.trackIndex).toBe(0);
    expect(deleted.selectionAnchor).toBeUndefined();
  });

  it('leaves a state without a document as it is', () => {
    expect(remapEditorTracks(INITIAL_EDITOR_STATE, [0])).toBe(INITIAL_EDITOR_STATE);
  });
});
