import { QUARTER, findNote } from '@gp-editor/core';
import { type EditorAction, type EditorState, INITIAL_EDITOR_STATE, editorReducer } from '../src/state/editor';
import { beat, makeSong, note } from '../test-support/songs';

/** Bar 1: E4 on the open first string, then a rest; the cursor on the first beat, string 1. */
function loaded(): EditorState {
  const song = makeSong([[beat(960, [note(1, 0)]), beat(1920, [])]]);
  return editorReducer(INITIAL_EDITOR_STATE, { type: 'loaded', document: { fileName: 'a.gp5', path: '/a.gp5', song } });
}

function reduce(state: EditorState, ...actions: EditorAction[]): EditorState {
  return actions.reduce(editorReducer, state);
}

const notesOf = (state: EditorState, beatIndex = 0): string[] =>
  state.document?.song.tracks[0]?.measures[0]?.beats[beatIndex]?.voices[0]?.notes.map((n) => `${n.string}:${n.fret}`) ?? [];

describe('a click on the fretboard (Guitar Pro 8’s instrument view)', () => {
  it('enters that string and fret at the cursor’s beat, one undo step, the cursor on the new note and still on its beat', () => {
    // Act
    const clicked = reduce(loaded(), { type: 'toggleFretNote', string: 3, fret: 2 });

    // Assert
    expect(notesOf(clicked)).toEqual(['1:0', '3:2']);
    expect(clicked.cursor).toMatchObject({ beatIndex: 0, string: 3 });
    expect(clicked.past).toHaveLength(1);
  });

  it('takes the note out when it is clicked again', () => {
    const twice = reduce(loaded(), { type: 'toggleFretNote', string: 3, fret: 2 }, { type: 'toggleFretNote', string: 3, fret: 2 });
    expect(notesOf(twice)).toEqual(['1:0']);
    expect(twice.past).toHaveLength(2);
  });

  it('says why a string another voice sounds takes no note', () => {
    // Arrange: voice 2 on the first beat, under voice 1's E4
    const voice2 = reduce(loaded(), { type: 'selectVoice', voiceIndex: 1 });

    // Act
    const clicked = reduce(voice2, { type: 'toggleFretNote', string: 1, fret: 5 });

    // Assert
    expect(clicked.document?.song).toBe(voice2.document?.song);
    expect(clicked.hint).toBe('Voice 1 sounds string 1 on this beat: a string plays one note at a time.');
  });
});

describe('a click on the piano keyboard', () => {
  it('enters the pitch on a free string near the hand, the cursor on it', () => {
    // Act: C4 next to the open E4
    const clicked = reduce(loaded(), { type: 'togglePitchNote', pitch: 60 });

    // Assert
    expect(notesOf(clicked)).toEqual(['1:0', '2:1']);
    expect(clicked.cursor).toMatchObject({ beatIndex: 0, string: 2 });
    expect(findNote(clicked.document!.song, clicked.cursor!)?.fret).toBe(1);
  });

  it('takes out the note sounding that pitch, and enters one on a rest', () => {
    expect(notesOf(reduce(loaded(), { type: 'togglePitchNote', pitch: 64 }))).toEqual([]);
    const onRest = reduce(loaded(), { type: 'moveCursorBeat', step: 1 }, { type: 'togglePitchNote', pitch: 64 });
    expect(notesOf(onRest, 1)).toEqual(['1:0']);
  });

  it('says why a key no free string plays enters nothing', () => {
    const clicked = reduce(loaded(), { type: 'togglePitchNote', pitch: 30 });
    expect(clicked.document?.song.tracks[0]?.measures[0]?.beats[0]?.voices[0]?.duration).toEqual(QUARTER);
    expect(notesOf(clicked)).toEqual(['1:0']);
    expect(clicked.hint).toBe('No free string of this track plays F#1 on this beat.');
  });
});
