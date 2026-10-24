import { type EditorAction, type EditorState, INITIAL_EDITOR_STATE, editorReducer } from '../src/state/editor';
import { SELECTED_TRACK_SHOWN_HINT, shownTrackIndexes } from '../src/state/track-display';
import { beat, makeSong, note, withTrack } from '../test-support/songs';

const BASS_STRINGS = [43, 38, 33, 28].map((tuning, i) => ({ number: i + 1, tuning }));

/** Three tracks of one bar: a guitar (6 strings, two beats), a bass (4 strings, one beat), a second guitar (one beat). */
function threeTracks(): EditorState {
  const guitar = makeSong([[beat(960, [note(1, 3)]), beat(1920, [note(6, 0)])]]);
  const song = withTrack(withTrack(guitar, [[beat(960, [note(4, 3)])]], { strings: BASS_STRINGS }), [[beat(960, [note(2, 1)])]]);
  return editorReducer(INITIAL_EDITOR_STATE, { type: 'loaded', document: { fileName: 'a.gp5', path: '/a.gp5', song } });
}

const run = (state: EditorState, ...actions: EditorAction[]) => actions.reduce(editorReducer, state);
const shown = (state: EditorState) => shownTrackIndexes(state.trackDisplay, state.document?.song.tracks.length ?? 0, state.trackIndex);

describe('the multitrack view in the editor', () => {
  it('opens a document with only the selected track shown', () => {
    expect(shown(threeTracks())).toEqual([0]);
  });

  it('shows every track with Multitrack and hides one by its eye, without an undo step', () => {
    // Act
    const state = run(threeTracks(), { type: 'toggleMultitrack' }, { type: 'toggleTrackShown', trackIndex: 1 });

    // Assert
    expect(shown(state)).toEqual([0, 2]);
    expect(state.past).toHaveLength(0);
  });

  it('keeps the selected track shown and says why when its eye is clicked', () => {
    // Act
    const state = run(threeTracks(), { type: 'toggleMultitrack' }, { type: 'toggleTrackShown', trackIndex: 0 });

    // Assert
    expect(shown(state)).toEqual([0, 1, 2]);
    expect(state.hint).toBe(SELECTED_TRACK_SHOWN_HINT);
  });

  it('sets the selected track’s own staves in the multitrack view and the score’s mode outside it', () => {
    // Act
    const multitrack = run(threeTracks(), { type: 'toggleMultitrack' }, { type: 'setMode', mode: 'tab' });
    const single = run(threeTracks(), { type: 'setMode', mode: 'tab' });

    // Assert
    expect(multitrack.mode).toBe('notationAndTab');
    expect(multitrack.trackDisplay.multitrackModes).toEqual({ 0: 'tab' });
    expect(single.mode).toBe('tab');
    expect(single.trackDisplay.multitrackModes).toEqual({});
  });
});

describe('moving the cursor across tracks', () => {
  it('goes down from the last string to the next shown track’s first string at the same moment', () => {
    // Arrange: on the guitar's second beat, string 6
    const start = run(threeTracks(), { type: 'toggleMultitrack' }, { type: 'placeCursor', cursor: { trackIndex: 0, measureIndex: 0, beatIndex: 1, voiceIndex: 0, string: 6 } });

    // Act
    const moved = run(start, { type: 'moveCursorString', delta: 1 });

    // Assert
    expect(moved.trackIndex).toBe(1);
    expect(moved.cursor).toEqual({ trackIndex: 1, measureIndex: 0, beatIndex: 0, voiceIndex: 0, string: 1 });
  });

  it('goes up from the first string to the previous shown track’s last string, skipping hidden tracks', () => {
    // Arrange
    const start = run(threeTracks(), { type: 'toggleMultitrack' }, { type: 'toggleTrackShown', trackIndex: 1 }, { type: 'selectTrack', trackIndex: 2 });

    // Act
    const moved = run(start, { type: 'moveCursorString', delta: -1 });

    // Assert
    expect(moved.trackIndex).toBe(0);
    expect(moved.cursor).toMatchObject({ trackIndex: 0, string: 6 });
  });

  it('stays on the track’s strings in the single-track view and at the last shown track', () => {
    // Arrange
    const single = run(threeTracks(), { type: 'placeCursor', cursor: { trackIndex: 0, measureIndex: 0, beatIndex: 0, voiceIndex: 0, string: 6 } });
    const last = run(threeTracks(), { type: 'toggleMultitrack' }, { type: 'selectTrack', trackIndex: 2 }, { type: 'moveCursorString', delta: 5 });

    // Act
    const singleMoved = run(single, { type: 'moveCursorString', delta: 1 });
    const lastMoved = run(last, { type: 'moveCursorString', delta: 1 });

    // Assert
    expect(singleMoved).toMatchObject({ trackIndex: 0, cursor: { string: 6 } });
    expect(lastMoved).toMatchObject({ trackIndex: 2, cursor: { string: 6 } });
  });

  it('goes to the next and previous track with ⌘↓ / ⌘↑, keeping the string where the track has it', () => {
    // Act
    const next = run(threeTracks(), { type: 'moveCursorString', delta: 2 }, { type: 'moveCursorTrack', step: 1 });
    const back = run(next, { type: 'moveCursorTrack', step: -1 });
    const first = run(threeTracks(), { type: 'moveCursorTrack', step: -1 });

    // Assert
    expect(next).toMatchObject({ trackIndex: 1, cursor: { trackIndex: 1, string: 3 } });
    expect(back).toMatchObject({ trackIndex: 0, cursor: { trackIndex: 0, string: 3 } });
    expect(first.trackIndex).toBe(0);
  });

  it('selects the track of a staff clicked in the multitrack view', () => {
    // Act
    const state = run(threeTracks(), { type: 'toggleMultitrack' }, { type: 'placeCursor', cursor: { trackIndex: 2, measureIndex: 0, beatIndex: 0, voiceIndex: 0, string: 2 } });

    // Assert
    expect(state.trackIndex).toBe(2);
    expect(state.cursor).toEqual({ trackIndex: 2, measureIndex: 0, beatIndex: 0, voiceIndex: 0, string: 2 });
  });

  it('keeps a drag or shift-click selection on the track it started in', () => {
    // Arrange: the cursor on the guitar's first beat
    const start = run(threeTracks(), { type: 'toggleMultitrack' });

    // Act: shift-click on the third track, at the guitar's second beat's moment
    const selected = run(start, { type: 'selectTo', cursor: { trackIndex: 2, measureIndex: 0, beatIndex: 0, voiceIndex: 0, string: 1 } });

    // Assert
    expect(selected.trackIndex).toBe(0);
    expect(selected.cursor?.trackIndex).toBe(0);
  });
});
