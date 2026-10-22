import { QUARTER, findNote } from '@gp-editor/core';
import { type EditorState, INITIAL_EDITOR_STATE, editorReducer, isEdited } from '../src/state/editor';
import { cursorVoice, isTriplet } from '../src/state/song-edits';
import { beat, header, makeSong, note } from '../test-support/songs';

/** One 4/4 bar: beat 0 = quarter on string 1 (fret 3), beat 1 = quarter on string 2 (fret 5). */
function loaded(): EditorState {
  const song = makeSong([[beat(960, [note(1, 3)]), beat(1920, [note(2, 5)])]], [header(1)]);
  return editorReducer(INITIAL_EDITOR_STATE, { type: 'loaded', document: { fileName: 'a.gp5', path: '/a.gp5', song } });
}

const song = (state: EditorState) => state.document!.song;
const voice = (state: EditorState) => cursorVoice(song(state), state.cursor!)!;
const edit = (state: EditorState, e: Parameters<typeof editorReducer>[1] extends infer A ? A : never) => editorReducer(state, e);

describe('cursor edits in the reducer', () => {
  it('changes the duration at the cursor: shorter, longer, dot, triplet', () => {
    // Arrange
    const start = loaded();

    // Act
    const shorter = edit(start, { type: 'edit', edit: { type: 'shiftNoteValue', step: 1 } });
    const dotted = edit(shorter, { type: 'edit', edit: { type: 'toggleDot' } });
    const triplet = edit(dotted, { type: 'edit', edit: { type: 'toggleTriplet' } });

    // Assert
    expect(voice(shorter).duration.value).toBe(8);
    expect(voice(dotted).duration.dotted).toBe(true);
    expect(isTriplet(voice(triplet).duration)).toBe(true);
    expect(triplet.past).toHaveLength(3);
    expect(edit(start, { type: 'edit', edit: { type: 'setNoteValue', value: 2 } }).document!.song.tracks[0]!.measures[0]!.beats[0]!.voices[0]!.duration.value).toBe(2);
  });

  it('inserts a rest after the cursor and moves onto it; deleting pulls later beats left and pads the bar', () => {
    const inserted = edit(loaded(), { type: 'edit', edit: { type: 'insertBeat' } });
    expect(song(inserted).tracks[0]!.measures[0]!.beats).toHaveLength(3);
    expect(inserted.cursor).toMatchObject({ beatIndex: 1 });
    expect(voice(inserted).notes).toEqual([]);
    const deleted = edit(inserted, { type: 'edit', edit: { type: 'deleteBeat' } });
    const beats = song(deleted).tracks[0]!.measures[0]!.beats;
    expect(beats[1]!.voices[0]!.notes[0]).toMatchObject({ string: 2, fret: 5 });
    expect(beats[1]!.start).toBe(1920);
    expect(beats[beats.length - 1]!.voices[0]!.notes).toEqual([]);
  });

  it('toggles effects, slide, bend, harmonic and tie on the note at the cursor', () => {
    let state = loaded();
    state = edit(state, { type: 'edit', edit: { type: 'toggleEffect', effect: 'palmMute' } });
    state = edit(state, { type: 'edit', edit: { type: 'toggleSlide' } });
    state = edit(state, { type: 'edit', edit: { type: 'cycleBend' } });
    state = edit(state, { type: 'edit', edit: { type: 'toggleHarmonic' } });
    const effect = findNote(song(state), state.cursor!)!.effect;
    expect(effect.palmMute).toBe(true);
    expect(effect.slides).toEqual(['shift']);
    expect(effect.bend).toBeDefined();
    expect(effect.harmonic?.type).toBe('natural');
    const fullBend = edit(state, { type: 'edit', edit: { type: 'cycleBend' } });
    const noBend = edit(fullBend, { type: 'edit', edit: { type: 'cycleBend' } });
    expect(findNote(song(noBend), noBend.cursor!)!.effect.bend).toBeUndefined();
  });

  it('inserts and deletes bars, moving the cursor into the new bar', () => {
    const inserted = edit(loaded(), { type: 'edit', edit: { type: 'insertMeasure' } });
    expect(song(inserted).measureHeaders).toHaveLength(2);
    expect(inserted.cursor).toMatchObject({ measureIndex: 1, beatIndex: 0 });
    const deleted = edit(inserted, { type: 'edit', edit: { type: 'deleteMeasure' } });
    expect(song(deleted).measureHeaders).toHaveLength(1);
    expect(deleted.cursor).toMatchObject({ measureIndex: 0 });
    expect(edit(deleted, { type: 'edit', edit: { type: 'deleteMeasure' } })).toBe(deleted);
  });

  it('changes time signature, tempo, key and repeats of the cursor bar', () => {
    let state = loaded();
    state = edit(state, { type: 'edit', edit: { type: 'shiftTimeSignature', part: 'numerator', delta: -1 } });
    state = edit(state, { type: 'edit', edit: { type: 'shiftTimeSignature', part: 'denominator', delta: 1 } });
    state = edit(state, { type: 'edit', edit: { type: 'shiftTempo', delta: 5 } });
    state = edit(state, { type: 'edit', edit: { type: 'shiftKeySignature', delta: 2 } });
    state = edit(state, { type: 'edit', edit: { type: 'toggleRepeatOpen' } });
    state = edit(state, { type: 'edit', edit: { type: 'toggleRepeatClose' } });
    const bar = song(state).measureHeaders[0]!;
    expect(bar.timeSignature).toEqual({ numerator: 3, denominator: 8 });
    expect(bar.tempo).toBe(125);
    expect(song(state).tracks[0]!.measures[0]!.keySignature).toBe(2);
    expect(bar).toMatchObject({ repeatOpen: true, repeatClose: 2 });
  });

  it('marks the document edited until it is saved', () => {
    const edited = edit(loaded(), { type: 'edit', edit: { type: 'toggleDot' } });
    expect(isEdited(loaded())).toBe(false);
    expect(isEdited(edited)).toBe(true);
    const saved = edit(edited, { type: 'saved', fileName: 'b.gp5', path: '/b.gp5', song: song(edited) });
    expect(isEdited(saved)).toBe(false);
    expect(saved.document).toMatchObject({ fileName: 'b.gp5', path: '/b.gp5' });
    expect(edit(saved, { type: 'saveFailed', message: 'disk full' }).error).toBe('Could not save: disk full');
  });

  it('leaves the song alone where an edit does not apply', () => {
    const start = loaded();
    const onEmpty = edit(start, { type: 'moveCursorString', delta: 3 });
    expect(edit(onEmpty, { type: 'edit', edit: { type: 'toggleEffect', effect: 'hammer' } })).toBe(onEmpty);
    expect(QUARTER.value).toBe(4);
  });

  it('makes the beat a tuplet of any size Guitar Pro stores, and plain again', () => {
    // Act
    const triplet = edit(loaded(), { type: 'edit', edit: { type: 'setTuplet', enters: 3 } });
    const quintuplet = edit(triplet, { type: 'edit', edit: { type: 'setTuplet', enters: 5 } });
    const plain = edit(quintuplet, { type: 'edit', edit: { type: 'setTuplet', enters: 1 } });

    // Assert
    expect(voice(triplet).duration.tuplet).toEqual({ enters: 3, times: 2 });
    expect(voice(quintuplet).duration.tuplet).toEqual({ enters: 5, times: 4 });
    expect(voice(plain).duration.tuplet).toEqual({ enters: 1, times: 1 });
    expect(plain.past).toHaveLength(3);
  });

  it.each([4, 13, 0])('ignores a tuplet of %i', (enters) => {
    const start = loaded();
    expect(edit(start, { type: 'edit', edit: { type: 'setTuplet', enters } })).toBe(start);
  });

  it('makes the beat at the cursor a rest of the same length; a rest stays as it is', () => {
    const rest = edit(loaded(), { type: 'edit', edit: { type: 'makeRest' } });
    expect(voice(rest)).toMatchObject({ notes: [], isEmpty: false, duration: { value: 4 } });
    expect(edit(rest, { type: 'edit', edit: { type: 'makeRest' } })).toBe(rest);
  });

  it('sets the stroke (at a sixteenth), the pick stroke and the text of the beat', () => {
    // Act
    const down = edit(loaded(), { type: 'edit', edit: { type: 'setStroke', direction: 'down' } });
    const picked = edit(down, { type: 'edit', edit: { type: 'setPickStroke', direction: 'up' } });
    const texted = edit(picked, { type: 'edit', edit: { type: 'setBeatText', text: ' let ring ' } });

    // Assert
    const marked = song(texted).tracks[0]!.measures[0]!.beats[0]!;
    expect(marked).toMatchObject({ stroke: { direction: 'down', value: 16 }, pickStroke: 'up', text: 'let ring' });
    expect(texted.past).toHaveLength(3);
  });

  it('clears the stroke and the text', () => {
    let state = edit(loaded(), { type: 'edit', edit: { type: 'setStroke', direction: 'up' } });
    state = edit(state, { type: 'edit', edit: { type: 'setBeatText', text: 'x' } });
    state = edit(state, { type: 'edit', edit: { type: 'setStroke', direction: 'none' } });
    state = edit(state, { type: 'edit', edit: { type: 'setBeatText', text: '' } });
    const cleared = song(state).tracks[0]!.measures[0]!.beats[0]!;
    expect(cleared.stroke).toEqual({ direction: 'none', value: 0 });
    expect(cleared.text).toBeUndefined();
    expect(edit(state, { type: 'edit', edit: { type: 'setStroke', direction: 'none' } })).toBe(state);
  });

  it('shifts the key from the key of the track at the cursor, not the first track', () => {
    // Arrange: track 2 is in 2 sharps while track 1 stays in C
    const base = song(loaded());
    const second = { ...base.tracks[0]!, number: 2, measures: base.tracks[0]!.measures.map((measure) => ({ ...measure, keySignature: 2 })) };
    const twoTracks = { ...base, tracks: [base.tracks[0]!, second] };
    const start = editorReducer(INITIAL_EDITOR_STATE, { type: 'loaded', document: { fileName: 'a.gp5', path: '/a.gp5', song: twoTracks } });
    const onSecond = edit(start, { type: 'selectTrack', trackIndex: 1 });

    // Act
    const shifted = edit(onSecond, { type: 'edit', edit: { type: 'shiftKeySignature', delta: 1 } });

    // Assert
    expect(song(shifted).tracks[1]!.measures[0]!.keySignature).toBe(3);
  });
});
