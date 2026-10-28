import { type BeatFragment, NO_STROKE, QUARTER, type Song, type StringAddress, findNote } from '@gp-editor/core';
import { paletteContext } from '../src/components/palette/palette-tools';
import { type EditorAction, type EditorState, INITIAL_EDITOR_STATE, editorReducer } from '../src/state/editor';
import { editAtCursor } from '../src/state/empty-bars';
import { selectionStart } from '../src/state/selection';
import { beat, header, makeSong, note, onStrings, withTrack } from '../test-support/songs';

/**
 * Many files leave a bar without beats where a track rests (canon.gp5: 646 of 2,016 track-bars). Track 1: a quarter in
 * bar 1, bars 2 and 3 without beats, a quarter in bar 4. Track 2: nothing in bar 1, a quarter in bars 2–4.
 */
function restingSong(): Song {
  const guitar = makeSong([[beat(960, [note(1, 3)])], [], [], [beat(12480, [note(6, 0)])]]);
  return withTrack(guitar, [[], [beat(4800, [note(1, 1)])], [beat(8640, [note(1, 2)])], [beat(12480, [note(1, 4)])]]);
}

function loaded(song: Song = restingSong()): EditorState {
  return editorReducer(INITIAL_EDITOR_STATE, { type: 'loaded', document: { fileName: 'a.gp5', path: '/a.gp5', song } });
}

function reduce(state: EditorState, ...actions: EditorAction[]): EditorState {
  return actions.reduce(editorReducer, state);
}

function cursorAt(measureIndex: number, overrides: Partial<StringAddress> = {}): StringAddress {
  return { trackIndex: 0, measureIndex, beatIndex: 0, voiceIndex: 0, string: 2, ...overrides };
}

const place = (measureIndex: number, overrides: Partial<StringAddress> = {}): EditorAction => ({ type: 'placeCursor', cursor: cursorAt(measureIndex, overrides) });
const song = (state: EditorState): Song => state.document!.song;
const beatsOf = (state: EditorState, measureIndex: number, trackIndex = 0) => song(state).tracks[trackIndex]!.measures[measureIndex]!.beats;

describe('the cursor in a bar without beats', () => {
  it('stands where the score was clicked, beat 0 of the bar', () => {
    expect(reduce(loaded(), place(1)).cursor).toEqual(cursorAt(1));
  });

  it('opens on bar 1 of a song whose track rests there, and in a song of such bars only', () => {
    const resting = makeSong([[], [], []]);
    expect(loaded(resting).cursor).toEqual(cursorAt(0, { string: 1 }));
    expect(reduce(loaded(resting), { type: 'moveCursorBeat', step: 1 }).cursor).toEqual(cursorAt(1, { string: 1 }));
  });

  it('stops once in each bar without beats with ← and →', () => {
    // Arrange
    const start = loaded();

    // Act
    const visited = [1, 2, 3].map((steps) => reduce(start, ...Array.from({ length: steps }, (): EditorAction => ({ type: 'moveCursorBeat', step: 1 }))).cursor);

    // Assert
    expect(visited.map((cursor) => cursor?.measureIndex)).toEqual([1, 2, 3]);
    expect(reduce(start, place(3, { string: 1 }), { type: 'moveCursorBeat', step: -1 }).cursor).toEqual(cursorAt(2, { string: 1 }));
  });

  it('keeps its bar when another track is selected, or the cursor moves to it, where that track rests', () => {
    const onTrack2 = reduce(loaded(), place(2, { trackIndex: 1 }));
    expect(reduce(onTrack2, { type: 'selectTrack', trackIndex: 0 }).cursor).toEqual(cursorAt(2));
    expect(reduce(onTrack2, { type: 'moveCursorTrack', step: -1 }).cursor).toEqual(cursorAt(2));
  });

  it('selects voices 1 to 4 there', () => {
    expect(reduce(loaded(), place(1), { type: 'selectVoice', voiceIndex: 1 }).cursor).toEqual(cursorAt(1, { voiceIndex: 1 }));
  });
});

describe('edits in a bar without beats', () => {
  it('act on the bar clicked: − Bar deletes it, not the track’s next bar with beats', () => {
    // Arrange
    const state = reduce(loaded(), place(1));

    // Act
    const deleted = reduce(state, { type: 'edit', edit: { type: 'deleteMeasure' } });

    // Assert
    expect(song(deleted).measureHeaders).toHaveLength(3);
    expect(beatsOf(deleted, 1)).toEqual([]);
    expect(beatsOf(deleted, 2, 1)[0]?.voices[0]?.notes[0]?.fret).toBe(4);
    expect(deleted.cursor).toEqual(cursorAt(1));
  });

  it('change the bar’s header and leave the bar without beats', () => {
    const faster = reduce(loaded(), place(2), { type: 'edit', edit: { type: 'setTempo', tempo: 150 } });
    expect(song(faster).measureHeaders[2]?.tempo).toBe(150);
    expect(beatsOf(faster, 2)).toEqual([]);
  });

  it('type a fret into the rest drawn there: the bar’s first beat, rests to the bar line, one undo step', () => {
    // Arrange
    const state = reduce(loaded(), place(1));

    // Act
    const typed = reduce(state, { type: 'setNoteFret', fret: 5 });

    // Assert
    expect(findNote(song(typed), cursorAt(1))?.fret).toBe(5);
    expect(beatsOf(typed, 1)).toHaveLength(1);
    expect(beatsOf(typed, 1)[0]?.voices[0]?.duration.value).toBe(1);
    expect(typed.past).toHaveLength(1);
    expect(beatsOf(reduce(typed, { type: 'undo' }), 1)).toEqual([]);
  });

  it('give a duration to the rest drawn there, then a fret on it', () => {
    const quarter = reduce(loaded(), place(1), { type: 'edit', edit: { type: 'setNoteValue', value: 4 } });
    const typed = reduce(quarter, { type: 'setNoteFret', fret: 7 });
    expect(beatsOf(quarter, 1).map((b) => b.voices[0]?.duration.value)).toEqual([4, 4, 4, 4]);
    expect(findNote(song(typed), cursorAt(1))).toMatchObject({ fret: 7 });
    expect(beatsOf(typed, 1)[0]?.voices[0]?.duration.value).toBe(4);
  });

  it('enter a drum key and MIDI notes there; MIDI entry steps on to the next bar', () => {
    // Arrange
    const drums = loaded(onStrings(restingSong(), [0, 0, 0, 0, 0, 0], { isPercussion: true }));
    const guitar = reduce(loaded(), place(2));

    // Act
    const kick = reduce(drums, place(1), { type: 'toggleDrumNote', key: 36 });
    const played = reduce(guitar, { type: 'enterPlayedNotes', notes: [{ pitch: 64, velocity: 100 }] });

    // Assert
    expect(beatsOf(kick, 1)[0]?.voices[0]?.notes.map((n) => n.fret)).toEqual([36]);
    expect(beatsOf(played, 2)[0]?.voices[0]?.notes).toHaveLength(1);
    expect(played.hint).toBeUndefined();
    expect(played.cursor).toMatchObject({ measureIndex: 3, beatIndex: 0 });
  });

  it('paste at the bar’s start', () => {
    const fragment: BeatFragment = { isPercussion: false, items: [{ duration: QUARTER, notes: [note(3, 9)], stroke: NO_STROKE, pickStroke: 'none' }] };
    const pasted = reduce(loaded(), place(1), { type: 'pasteBeats', fragment });
    expect(beatsOf(pasted, 1)[0]?.voices[0]?.notes.map((n) => n.fret)).toEqual([9]);
    expect(pasted.past).toHaveLength(1);
  });

  it('that change nothing on a rest leave the song as it was, without an undo step', () => {
    const state = reduce(loaded(), place(1));
    expect(reduce(state, { type: 'deleteNote' })).toBe(state);
    expect(reduce(state, { type: 'edit', edit: { type: 'erase' } }).document).toBe(state.document);
    expect(reduce(state, { type: 'edit', edit: { type: 'toggleEffect', effect: 'palmMute' } }).hint).toBe('String 2 has no note at the cursor: type a fret (0–9) first.');
  });
});

describe('− Bar with a selection', () => {
  it('deletes the selected bars in one undo step, the cursor on the bar after them', () => {
    // Arrange: from bar 2 to bar 3 (both without beats in track 1)
    const selected = reduce(loaded(), place(1), { type: 'extendSelection', step: 1 });

    // Act
    const deleted = reduce(selected, { type: 'edit', edit: { type: 'deleteMeasure' } });

    // Assert
    expect(song(deleted).measureHeaders.map((h) => h.number)).toEqual([1, 2]);
    expect(beatsOf(deleted, 1)[0]?.voices[0]?.notes[0]?.fret).toBe(0);
    expect(deleted.past).toHaveLength(1);
    expect(deleted.cursor).toMatchObject({ measureIndex: 1, beatIndex: 0 });
    expect(deleted.selectionAnchor).toBeUndefined();
  });

  it('deletes them whichever way the selection was made', () => {
    const backwards = reduce(loaded(), place(2), { type: 'extendSelection', step: -1 }, { type: 'edit', edit: { type: 'deleteMeasure' } });
    expect(song(backwards).measureHeaders).toHaveLength(2);
    expect(backwards.cursor).toMatchObject({ measureIndex: 1 });
  });

  it('says why when nothing can go: a song keeps at least one bar', () => {
    const single = loaded(makeSong([[beat(960, [note(1, 0)])]], [header(1)]));
    const all = reduce(loaded(), place(0), { type: 'selectTo', cursor: cursorAt(3) });
    expect(reduce(single, { type: 'edit', edit: { type: 'deleteMeasure' } }).hint).toBe('A song keeps at least one bar: nothing was deleted.');
    expect(reduce(all, { type: 'edit', edit: { type: 'deleteMeasure' } }).hint).toBe('A song keeps at least one bar: nothing was deleted.');
  });
});

describe('a selection reaching a bar without beats', () => {
  it('plays from that bar’s start', () => {
    const state = reduce(loaded(), place(1), { type: 'extendSelection', step: 1 });
    expect(selectionStart(state)).toEqual({ measureIndex: 1, tick: song(state).measureHeaders[1]!.start });
  });
});

describe('the palette in a bar without beats', () => {
  it('reads the bar as the whole rest drawn there: its beat tools work, its note tools wait for a note', () => {
    const context = paletteContext(restingSong(), cursorAt(1));
    expect(context.voice).toMatchObject({ duration: { value: 1 }, notes: [], isEmpty: false });
    expect(context.beat).toBeDefined();
    expect(context.note).toBeUndefined();
    expect(context.header?.number).toBe(2);
  });
});

describe('editAtCursor', () => {
  it('runs an edit that changes the song as it is, without filling the bar', () => {
    const original = restingSong();
    const marked = editAtCursor(original, cursorAt(1), (current) => ({ ...current, info: { ...current.info, title: 'B' } }));
    expect(marked.tracks).toBe(original.tracks);
  });

  it('returns the same song when the edit changes nothing, even on the rests', () => {
    const original = restingSong();
    expect(editAtCursor(original, cursorAt(1), (current) => current)).toBe(original);
    expect(editAtCursor(original, cursorAt(0), (current) => current)).toBe(original);
  });
});
