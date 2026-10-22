import { type EditorState, INITIAL_EDITOR_STATE, editorReducer } from '../src/state/editor';
import { cursorVoice } from '../src/state/song-edits';
import { beat, makeSong, note } from '../test-support/songs';

/** Bar 1: a note on string 2 (fret 5), then a quarter rest, then a note; the cursor on the first note. */
function open(): EditorState {
  const song = makeSong([[beat(960, [note(2, 5)]), beat(1920, []), beat(2880, [note(1, 3)])]]);
  const loaded = editorReducer(INITIAL_EDITOR_STATE, { type: 'loaded', document: { fileName: 'a.gp5', path: '/a.gp5', song } });
  return editorReducer(loaded, { type: 'placeCursor', cursor: { trackIndex: 0, measureIndex: 0, beatIndex: 0, voiceIndex: 0, string: 2 } });
}

const erase = (state: EditorState) => editorReducer(state, { type: 'edit', edit: { type: 'erase' } });
const beats = (state: EditorState) => state.document?.song.tracks[0]?.measures[0]?.beats ?? [];

describe('⌫ / ⌦ erase', () => {
  it('turns the note at the cursor into a rest of the same length', () => {
    // Act
    const once = erase(open());

    // Assert
    const voice = cursorVoice(once.document!.song, once.cursor!);
    expect(voice?.notes).toEqual([]);
    expect(voice?.isEmpty).toBe(false);
    expect(beats(once)).toHaveLength(3);
  });

  it('removes the rest itself on a second press: what followed moves up', () => {
    // Act
    const twice = erase(erase(open()));

    // Assert: the note that was third is now second (the bar is refilled with a rest at its end)
    expect(beats(twice).map((b) => b.voices[0]?.notes[0]?.fret)).toEqual([undefined, 3, undefined]);
    expect(twice.past).toHaveLength(2);
  });

  it('does nothing on an empty string of a beat that has other notes', () => {
    // Arrange: a chord-less beat with a note on string 2; the cursor on string 4
    const state = editorReducer(open(), { type: 'moveCursorString', delta: 2 });

    // Act / Assert
    expect(erase(state).document?.song).toBe(state.document?.song);
  });
});
