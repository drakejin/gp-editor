import { QUARTER, type Song, findNote } from '@gp-editor/core';
import { type EditorState, INITIAL_EDITOR_STATE, editorReducer } from '../src/state/editor';
import { DRONE_FRET_HINT, playedNotesHint, storedFret } from '../src/state/note-entry';
import { beat, makeSong, note } from '../test-support/songs';

const OPEN_G = [62, 59, 55, 50, 67];

function withStrings(song: Song, tuning: readonly number[], isPercussion = false): Song {
  return { ...song, tracks: song.tracks.map((track) => ({ ...track, isPercussion, strings: tuning.map((open, i) => ({ number: i + 1, tuning: open })) })) };
}

function opened(song: Song, string = 1): EditorState {
  const state = editorReducer(INITIAL_EDITOR_STATE, { type: 'loaded', document: { fileName: 'a.gp5', path: '/a.gp5', song } });
  return editorReducer(state, { type: 'placeCursor', cursor: { ...state.cursor!, string } });
}

const notesAt = (state: EditorState, beatIndex = 0) =>
  state.document!.song.tracks[0]!.measures[0]!.beats[beatIndex]!.voices[0]!.notes.map((n) => `${n.string}:${n.fret}`);

/** Bar 1: four quarter beats, the first two with notes. */
const FOUR_BEATS = makeSong([[beat(960, [note(1, 3)]), beat(1920, [note(2, 1)]), beat(2880, []), beat(3840, [])]]);

describe('storedFret', () => {
  it('stores a fret typed on a banjo’s short 5th string from its peg, and refuses frets 1–5 there', () => {
    const banjo = withStrings(FOUR_BEATS, OPEN_G);
    const cursor = { trackIndex: 0, measureIndex: 0, beatIndex: 0, voiceIndex: 0, string: 5 };
    expect(storedFret(banjo, cursor, 7)).toBe(2);
    expect(storedFret(banjo, cursor, 0)).toBe(0);
    expect(storedFret(banjo, cursor, 3)).toBeUndefined();
    expect(storedFret(FOUR_BEATS, cursor, 3)).toBe(3);
  });
});

describe('typing a fret on a banjo', () => {
  it('types the drone’s real fret (7) and the file gets its own fret (2); 0 is the open drone', () => {
    // Arrange
    const state = opened(withStrings(FOUR_BEATS, OPEN_G), 5);

    // Act
    const typed = editorReducer(state, { type: 'setNoteFret', fret: 7 });
    const open = editorReducer(state, { type: 'setNoteFret', fret: 0 });

    // Assert
    expect(findNote(typed.document!.song, typed.cursor!)?.fret).toBe(2);
    expect(findNote(open.document!.song, open.cursor!)?.fret).toBe(0);
  });

  it('says why a fret below the drone’s peg does nothing, and a good fret clears that hint', () => {
    const state = opened(withStrings(FOUR_BEATS, OPEN_G), 5);
    const refused = editorReducer(state, { type: 'setNoteFret', fret: 3 });
    expect(refused.document).toBe(state.document);
    expect(refused.hint).toBe(DRONE_FRET_HINT);
    expect(editorReducer(refused, { type: 'setNoteFret', fret: 12 }).hint).toBeUndefined();
  });
});

describe('toggleDrumNote', () => {
  it('adds a clicked drum to the cursor’s beat and takes it out on a second click, one undo step each', () => {
    // Arrange
    const state = opened(withStrings(FOUR_BEATS, [0, 0, 0, 0, 0, 0], true), 2);

    // Act
    const hit = editorReducer(state, { type: 'toggleDrumNote', key: 38 });
    const again = editorReducer(hit, { type: 'toggleDrumNote', key: 38 });

    // Assert
    expect(notesAt(hit)).toEqual(['1:3', '2:38']);
    expect(hit.past).toHaveLength(1);
    expect(notesAt(again)).toEqual(['1:3']);
    expect(hit.cursor).toEqual(state.cursor);
  });
});

describe('enterPlayedNotes', () => {
  it('enters a played chord as one beat (one undo step) and steps the cursor to the next beat', () => {
    // Arrange
    const state = opened(makeSong([[beat(960, []), beat(1920, []), beat(2880, []), beat(3840, [])]]));

    // Act
    const chord = editorReducer(state, { type: 'enterPlayedNotes', notes: [{ pitch: 60 }, { pitch: 64 }, { pitch: 67 }] });
    const single = editorReducer(chord, { type: 'enterPlayedNotes', notes: [{ pitch: 64 }] });

    // Assert
    expect(notesAt(chord)).toEqual(['1:3', '2:5', '3:5']);
    expect(chord.past).toHaveLength(1);
    expect(chord.cursor?.beatIndex).toBe(1);
    expect(notesAt(single, 1)).toEqual(['2:5']);
    expect(single.cursor?.beatIndex).toBe(2);
  });

  it('adds a bar after the song’s last beat, in the same undo step, and steps the cursor into it', () => {
    // Arrange: one bar of a whole rest.
    const state = opened(makeSong([[beat(960, [], { ...QUARTER, value: 1 })]]));

    // Act
    const entered = editorReducer(state, { type: 'enterPlayedNotes', notes: [{ pitch: 64 }] });

    // Assert
    expect(entered.document!.song.measureHeaders).toHaveLength(2);
    expect(entered.cursor).toMatchObject({ measureIndex: 1, beatIndex: 0 });
    expect(entered.past).toHaveLength(1);
    expect(editorReducer(entered, { type: 'undo' }).document!.song).toBe(state.document!.song);
  });

  it('says which pitches the track could not play, and changes nothing when none fits', () => {
    const state = opened(FOUR_BEATS);
    const partly = editorReducer(state, { type: 'enterPlayedNotes', notes: [{ pitch: 20 }, { pitch: 64 }] });
    expect(partly.hint).toBe(playedNotesHint([20]));
    const none = editorReducer(state, { type: 'enterPlayedNotes', notes: [{ pitch: 20 }] });
    expect(none.document).toBe(state.document);
    expect(none.cursor).toEqual(state.cursor);
    expect(none.hint).toBe("MIDI input: G#0 is out of this track's reach.");
  });

  it('enters nothing without a document', () => {
    expect(editorReducer(INITIAL_EDITOR_STATE, { type: 'enterPlayedNotes', notes: [{ pitch: 60 }] })).toBe(INITIAL_EDITOR_STATE);
  });
});

describe('playedNotesHint', () => {
  it('names the pitches left out, or nothing when every pitch went in', () => {
    expect(playedNotesHint([])).toBeUndefined();
    expect(playedNotesHint([20, 21])).toBe("MIDI input: G#0, A0 are out of this track's reach.");
  });
});
