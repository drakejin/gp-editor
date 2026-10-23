import { QUARTER_TIME } from '@gp-editor/core';
import { type EditorState, INITIAL_EDITOR_STATE, editorReducer } from '../src/state/editor';
import { isMarkEdit, withSelectionStart } from '../src/state/mark-edits';
import type { SongEdit } from '../src/state/song-edits';
import { beat, makeSong, note } from '../test-support/songs';

/** Two bars of four quarter notes on string 1; the cursor on bar 1, beat 1. */
function loaded(): EditorState {
  const bar = (start: number) => [0, 1, 2, 3].map((i) => beat(start + i * 960, [note(1, i)]));
  const song = makeSong([bar(960), bar(4800)]);
  return editorReducer(INITIAL_EDITOR_STATE, { type: 'loaded', document: { fileName: 'a.gp5', path: '/a.gp5', song } });
}

const edit = (state: EditorState, songEdit: SongEdit) => editorReducer(state, { type: 'edit', edit: songEdit });
const beatsOf = (state: EditorState, measureIndex = 0) => state.document!.song.tracks[0]!.measures[measureIndex]!.beats;

describe('mark edits at the cursor', () => {
  it('puts a direction on the cursor’s bar and takes it off again, one undo step each', () => {
    // Act
    const segno = edit(loaded(), { type: 'toggleDirection', direction: 'segno' });
    const both = edit(segno, { type: 'toggleDirection', direction: 'daSegnoAlCoda' });
    const off = edit(both, { type: 'toggleDirection', direction: 'segno' });

    // Assert
    expect(both.document!.song.measureHeaders[0]!.directions).toEqual(['segno', 'daSegnoAlCoda']);
    expect(off.document!.song.measureHeaders[0]!.directions).toEqual(['daSegnoAlCoda']);
    expect(off.past).toHaveLength(3);
  });

  it('puts a crescendo on the cursor’s beat, or over the selected beats as one undo step', () => {
    // Arrange
    const start = loaded();
    const selected = editorReducer(editorReducer(editorReducer(start, { type: 'extendSelection', step: 1 }), { type: 'extendSelection', step: 1 }), { type: 'extendSelection', step: 1 });

    // Act
    const one = edit(start, { type: 'toggleHairpin', hairpin: 'crescendo' });
    const many = edit(selected, { type: 'toggleHairpin', hairpin: 'decrescendo' });

    // Assert
    expect(beatsOf(one).map((b) => b.hairpin)).toEqual(['crescendo', undefined, undefined, undefined]);
    expect(beatsOf(many).map((b) => b.hairpin)).toEqual(['decrescendo', 'decrescendo', 'decrescendo', 'decrescendo']);
    expect(many.past).toHaveLength(1);
    expect(many.selectionAnchor).toBeUndefined();
  });

  it('sets and clears the beat’s rasgueado', () => {
    const rasgueado = edit(loaded(), { type: 'setRasgueado', pattern: 'amiAnapaest' });
    expect(beatsOf(rasgueado)[0]!.rasgueado).toBe('amiAnapaest');
    expect(beatsOf(edit(rasgueado, { type: 'setRasgueado', pattern: 'none' }))[0]).not.toHaveProperty('rasgueado');
  });

  it('presses the sustain pedal where the beat starts and releases it where it ends', () => {
    // Act
    const down = edit(loaded(), { type: 'togglePedal', action: 'down' });
    const up = edit(editorReducer(down, { type: 'moveCursorBeat', step: 1 }), { type: 'togglePedal', action: 'up' });

    // Assert
    expect(up.document!.song.tracks[0]!.measures[0]!.pedals).toEqual([
      { offset: 0, action: 'down' },
      { offset: QUARTER_TIME * 2, action: 'up' },
    ]);
  });

  it('toggles fade out and volume swell on the note, one fade at a time', () => {
    const fadeOut = edit(loaded(), { type: 'toggleEffect', effect: 'fadeOut' });
    const swell = edit(fadeOut, { type: 'toggleEffect', effect: 'volumeSwell' });
    expect(beatsOf(fadeOut)[0]!.voices[0]!.notes[0]!.effect.fadeOut).toBe(true);
    expect(beatsOf(swell)[0]!.voices[0]!.notes[0]!.effect).toMatchObject({ volumeSwell: true, fadeIn: false });
    expect(beatsOf(swell)[0]!.voices[0]!.notes[0]!.effect).not.toHaveProperty('fadeOut');
  });

  it('knows its edits, and gives only a hairpin the selection’s start', () => {
    // Arrange
    const anchor = { trackIndex: 0, measureIndex: 1, beatIndex: 2, voiceIndex: 0, string: 1 };

    // Act / Assert
    expect([isMarkEdit({ type: 'togglePedal' }), isMarkEdit({ type: 'toggleDot' })]).toEqual([true, false]);
    expect(withSelectionStart({ type: 'toggleHairpin', hairpin: 'crescendo' }, anchor)).toEqual({ type: 'toggleHairpin', hairpin: 'crescendo', from: { measureIndex: 1, beatIndex: 2 } });
    expect(withSelectionStart({ type: 'toggleDot' }, anchor)).toEqual({ type: 'toggleDot' });
  });
});
