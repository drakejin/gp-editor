import { QUARTER, TREMOLO_BAR_PRESETS, bendShapeOf, buildBend, findNote, vibratoOf } from '@gp-editor/core';
import type { Note } from '@gp-editor/core';
import { type EditorState, INITIAL_EDITOR_STATE, editorReducer } from '../src/state/editor';
import type { SongEdit } from '../src/state/song-edits';
import { beat, makeSong, note } from '../test-support/songs';

/** One 4/4 bar: beat 0 = string 1 fret 5, beat 1 = string 1 fret 28, beat 2 = string 1 fret 1, beat 3 = a rest. */
function loaded(): EditorState {
  const song = makeSong([[beat(960, [note(1, 5)]), beat(1920, [note(1, 28)]), beat(2880, [note(1, 1)]), beat(3840, [])]]);
  return editorReducer(INITIAL_EDITOR_STATE, { type: 'loaded', document: { fileName: 'a.gp5', path: '/a.gp5', song } });
}

function onBeat(beatIndex: number): EditorState {
  const state = loaded();
  return editorReducer(state, { type: 'placeCursor', cursor: { ...state.cursor!, beatIndex } });
}

const edit = (state: EditorState, songEdit: SongEdit) => editorReducer(state, { type: 'edit', edit: songEdit });
const noteAt = (state: EditorState): Note => findNote(state.document!.song, state.cursor!)!;
const plain = (value: 8 | 16 | 32 | 64) => ({ ...QUARTER, value });

describe('note edits at the cursor', () => {
  it('adds and removes one slide type at a time, kept in model order', () => {
    // Arrange
    const start = loaded();

    // Act
    const out = edit(start, { type: 'toggleSlideType', slide: 'outDownwards' });
    const both = edit(out, { type: 'toggleSlideType', slide: 'legato' });
    const legatoOnly = edit(both, { type: 'toggleSlideType', slide: 'outDownwards' });

    // Assert
    expect(noteAt(out).effect.slides).toEqual(['outDownwards']);
    expect(noteAt(both).effect.slides).toEqual(['legato', 'outDownwards']);
    expect(noteAt(legatoOnly).effect.slides).toEqual(['legato']);
    expect(legatoOnly.past).toHaveLength(3);
  });

  it('sets a bend of any shape and amount, and removes it', () => {
    // Act
    const release = edit(loaded(), { type: 'setBendShape', shape: 'release', amount: 6 });
    const highest = edit(release, { type: 'setBendShape', shape: 'bendRelease', amount: 20 });
    const none = edit(highest, { type: 'setBendShape', shape: 'none', amount: 4 });

    // Assert
    expect(noteAt(release).effect.bend).toEqual(buildBend('release', 6));
    expect(bendShapeOf(noteAt(highest).effect.bend!)).toEqual({ shape: 'bendRelease', amount: 12 });
    expect(noteAt(none).effect.bend).toBeUndefined();
    expect(edit(release, { type: 'setBendShape', shape: 'release', amount: 6 })).toBe(release);
    expect(none.past).toHaveLength(3);
  });

  it('sets slight, wide or no vibrato; toggling vibrato makes a wide vibrato slight', () => {
    // Act
    const wide = edit(loaded(), { type: 'setVibrato', vibrato: 'wide' });
    const slight = edit(wide, { type: 'setVibrato', vibrato: 'slight' });
    const none = edit(slight, { type: 'setVibrato', vibrato: 'none' });
    const toggled = edit(wide, { type: 'toggleEffect', effect: 'vibrato' });

    // Assert
    expect(noteAt(wide).effect).toMatchObject({ vibrato: false, wideVibrato: true });
    expect(noteAt(slight).effect).toMatchObject({ vibrato: true, wideVibrato: false });
    expect(vibratoOf(noteAt(none).effect)).toBe('none');
    expect(noteAt(toggled).effect).toMatchObject({ vibrato: true, wideVibrato: false });
    expect(edit(wide, { type: 'setVibrato', vibrato: 'wide' })).toBe(wide);
  });

  it('sets a tremolo bar preset and removes it', () => {
    const dived = edit(loaded(), { type: 'setTremoloBar', preset: 'dive' });
    expect(noteAt(dived).effect.tremoloBar).toEqual(TREMOLO_BAR_PRESETS.dive);
    expect(noteAt(edit(dived, { type: 'setTremoloBar', preset: 'none' })).effect.tremoloBar).toBeUndefined();
  });

  it('sets a harmonic with TuxGuitar’s default data: artificial +12, tapped 12 frets up (at most fret 29)', () => {
    // Act
    const natural = edit(loaded(), { type: 'setHarmonic', harmonic: 'natural' });
    const artificial = edit(loaded(), { type: 'setHarmonic', harmonic: 'artificial' });
    const tapped = edit(loaded(), { type: 'setHarmonic', harmonic: 'tapped' });
    const tappedHigh = edit(onBeat(1), { type: 'setHarmonic', harmonic: 'tapped' });
    const pinch = edit(loaded(), { type: 'setHarmonic', harmonic: 'pinch' });

    // Assert
    expect(noteAt(natural).effect.harmonic).toEqual({ type: 'natural', data: 0 });
    expect(noteAt(artificial).effect.harmonic).toEqual({ type: 'artificial', data: 12 });
    expect(noteAt(tapped).effect.harmonic).toEqual({ type: 'tapped', data: 17 });
    expect(noteAt(tappedHigh).effect.harmonic).toEqual({ type: 'tapped', data: 29 });
    expect(noteAt(pinch).effect.harmonic).toEqual({ type: 'pinch', data: 0 });
    expect(noteAt(edit(pinch, { type: 'setHarmonic', harmonic: 'none' })).effect.harmonic).toBeUndefined();
  });

  it('sets the dynamic of the note as its velocity', () => {
    const piano = edit(loaded(), { type: 'setDynamic', dynamic: 'pp' });
    expect(noteAt(piano).velocity).toBe(31);
    expect(noteAt(edit(piano, { type: 'setDynamic', dynamic: 'fff' })).velocity).toBe(127);
    expect(edit(piano, { type: 'setDynamic', dynamic: 'pp' })).toBe(piano);
  });

  it('adds a grace note two frets below as a 32nd hammer at the note’s velocity, and moves it on and before the beat', () => {
    // Arrange
    const soft = edit(loaded(), { type: 'setDynamic', dynamic: 'mp' });

    // Act
    const before = edit(soft, { type: 'setGrace', grace: 'beforeBeat' });
    const on = edit(before, { type: 'setGrace', grace: 'onBeat' });
    const none = edit(on, { type: 'setGrace', grace: 'none' });

    // Assert
    expect(noteAt(before).effect.grace).toEqual({ fret: 3, duration: 2, velocity: 63, transition: 'hammer', onBeat: false, isDead: false });
    expect(noteAt(on).effect.grace).toEqual({ fret: 3, duration: 2, velocity: 63, transition: 'hammer', onBeat: true, isDead: false });
    expect(noteAt(none).effect.grace).toBeUndefined();
    expect(edit(on, { type: 'setGrace', grace: 'onBeat' })).toBe(on);
  });

  it('puts the grace note of a note on fret 1 on the open string', () => {
    expect(noteAt(edit(onBeat(2), { type: 'setGrace', grace: 'onBeat' })).effect.grace?.fret).toBe(0);
  });

  it('adds a trill two frets up at a speed; a new speed keeps the trill fret', () => {
    // Act
    const trill = edit(loaded(), { type: 'setTrill', speed: 16 });
    const faster = edit(trill, { type: 'setTrill', speed: 64 });
    const high = edit(onBeat(1), { type: 'setTrill', speed: 32 });

    // Assert
    expect(noteAt(trill).effect.trill).toEqual({ fret: 7, duration: plain(16) });
    expect(noteAt(faster).effect.trill).toEqual({ fret: 7, duration: plain(64) });
    expect(noteAt(high).effect.trill).toEqual({ fret: 29, duration: plain(32) });
    expect(noteAt(edit(faster, { type: 'setTrill', speed: 'none' })).effect.trill).toBeUndefined();
  });

  it('sets tremolo picking at a speed and removes it', () => {
    const picked = edit(loaded(), { type: 'setTremoloPicking', speed: 8 });
    expect(noteAt(picked).effect.tremoloPicking).toEqual({ duration: plain(8) });
    expect(noteAt(edit(picked, { type: 'setTremoloPicking', speed: 32 })).effect.tremoloPicking).toEqual({ duration: plain(32) });
    expect(noteAt(edit(picked, { type: 'setTremoloPicking', speed: 'none' })).effect.tremoloPicking).toBeUndefined();
  });

  it.each<SongEdit>([
    { type: 'toggleSlideType', slide: 'shift' },
    { type: 'setBendShape', shape: 'preBend', amount: 3 },
    { type: 'setVibrato', vibrato: 'wide' },
    { type: 'setTremoloBar', preset: 'dip' },
    { type: 'setHarmonic', harmonic: 'tapped' },
    { type: 'setDynamic', dynamic: 'ff' },
    { type: 'setGrace', grace: 'beforeBeat' },
    { type: 'setTrill', speed: 32 },
    { type: 'setTremoloPicking', speed: 16 },
  ])('leaves the song and the history alone without a note at the cursor: %o', (songEdit) => {
    // Arrange
    const onEmptyString = editorReducer(loaded(), { type: 'moveCursorString', delta: 2 });
    const onRest = onBeat(3);

    // Act
    const results = [onEmptyString, onRest].map((before) => ({ before, after: edit(before, songEdit) }));

    // Assert: the song and the undo history are as they were; a hint says to type a fret first
    results.forEach(({ before, after }) => {
      expect(after.document).toBe(before.document);
      expect(after.past).toBe(before.past);
      expect(after.hint).toMatch(/type a fret/);
    });
  });
});

describe('note audio settings at the cursor', () => {
  it('steps the play duration, start offset and velocity change, one undo step each', () => {
    // Arrange
    const start = loaded();

    // Act
    const shorter = edit(start, { type: 'shiftNoteAudio', setting: 'durationPercent', delta: -10 });
    const later = edit(shorter, { type: 'shiftNoteAudio', setting: 'offsetPercent', delta: 5 });
    const louder = edit(later, { type: 'shiftNoteAudio', setting: 'velocityOffset', delta: 8 });

    // Assert
    expect(noteAt(louder).audio).toEqual({ durationPercent: 90, offsetPercent: 5, velocityOffset: 8 });
    expect(louder.past).toHaveLength(3);
  });

  it('keeps each setting within its range and resets them all', () => {
    // Arrange
    const start = loaded();
    const early = edit(start, { type: 'shiftNoteAudio', setting: 'offsetPercent', delta: -5 });

    // Act
    const changed = edit(start, { type: 'shiftNoteAudio', setting: 'durationPercent', delta: 500 });
    const reset = edit(changed, { type: 'resetNoteAudio' });

    // Assert
    expect(early.past).toBe(start.past);
    expect(noteAt(changed).audio?.durationPercent).toBe(200);
    expect(noteAt(reset)).not.toHaveProperty('audio');
  });
});
