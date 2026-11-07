import { type BeatFragment, NO_STROKE, QUARTER, type Song } from '@gp-editor/core';
import { type EditorAction, type EditorState, INITIAL_EDITOR_STATE, editorReducer } from '../src/state/editor';
import { selectedFragment } from '../src/state/selection';
import { beat, makeSong, note, onStrings, withTrack } from '../test-support/songs';

const BAR = 3840;
const QUARTER_TICKS = 960;

/** Two 4/4 bars of quarter notes on string 1: frets 0–3, then 4–7. */
function twoBars(): Song {
  const bar = (index: number) => [0, 1, 2, 3].map((i) => beat(960 + index * BAR + i * QUARTER_TICKS, [note(1, index * 4 + i)]));
  return makeSong([bar(0), bar(1)]);
}

function reduce(state: EditorState, ...actions: EditorAction[]): EditorState {
  return actions.reduce(editorReducer, state);
}

function loaded(song: Song = twoBars()): EditorState {
  return reduce(INITIAL_EDITOR_STATE, { type: 'loaded', document: { fileName: 'a.gp5', path: '/a.gp5', song } });
}

/** Frets of a bar's beats in a track, `r` for a rest. */
function frets(state: EditorState, measureIndex: number, trackIndex = 0): string[] {
  const beats = state.document?.song.tracks[trackIndex]?.measures[measureIndex]?.beats ?? [];
  return beats.map((b) => b.voices[0]?.notes.map((n) => `${n.string}/${n.fret}`).join(',') || 'r');
}

function place(measureIndex: number, beatIndex: number, trackIndex = 0): EditorAction {
  return { type: 'placeCursor', cursor: { trackIndex, measureIndex, beatIndex, voiceIndex: 0, string: 1 } };
}

const RIGHT: EditorAction = { type: 'extendSelection', step: 1 };

/** The first two beats of bar 1 (frets 0 and 1), as ⌘C copies them. */
function firstTwoBeats(): BeatFragment {
  const fragment = selectedFragment(reduce(loaded(), RIGHT));
  if (fragment === undefined) {
    throw new Error('nothing selected');
  }
  return fragment;
}

describe('pasteBeats (⌘V)', () => {
  it('writes the beats over the bar from the cursor as one undo step, the cursor on the beat right after them', () => {
    // Arrange
    const atSecondBar = reduce(loaded(), place(1, 1));

    // Act
    const pasted = reduce(atSecondBar, { type: 'pasteBeats', fragment: firstTwoBeats() });

    // Assert
    expect(frets(pasted, 1)).toEqual(['1/4', '1/0', '1/1', '1/7']);
    expect(pasted.cursor).toMatchObject({ measureIndex: 1, beatIndex: 3 });
    expect(pasted.past).toHaveLength(1);
    expect(pasted.hint).toBe('2 beats pasted over bar 2 of Guitar.');
  });

  it('lays copies one after another when pasted again and again, each one undo step', () => {
    // Act: ⌘V three times from bar 1's start
    const pasted = reduce(loaded(), ...Array.from({ length: 3 }, (): EditorAction => ({ type: 'pasteBeats', fragment: firstTwoBeats() })));

    // Assert
    expect(frets(pasted, 0)).toEqual(['1/0', '1/1', '1/0', '1/1']);
    expect(frets(pasted, 1)).toEqual(['1/0', '1/1', '1/6', '1/7']);
    expect(pasted.cursor).toMatchObject({ measureIndex: 1, beatIndex: 2 });
    expect(pasted.past).toHaveLength(3);
    expect(reduce(pasted, { type: 'undo' }, { type: 'undo' }, { type: 'undo' }).document?.song).toEqual(loaded().document?.song);
  });

  it('is a paste when it writes what is already there: one undo step, the cursor on, the hint saying so', () => {
    // Arrange
    const state = loaded();

    // Act: the first two beats pasted where they are
    const pasted = reduce(state, { type: 'pasteBeats', fragment: firstTwoBeats() });

    // Assert
    expect(pasted.document?.song).toEqual(state.document?.song);
    expect(pasted.past).toHaveLength(1);
    expect(pasted.cursor).toMatchObject({ measureIndex: 0, beatIndex: 2 });
    expect(pasted.hint).toBe('2 beats pasted over bar 1 of Guitar.');
  });

  it('adds a bar at the end when the pasted beats end the song, the cursor on it, in the same undo step', () => {
    // Arrange: the cursor on the song's last two beats
    const atEnd = reduce(loaded(), place(1, 2));

    // Act
    const pasted = reduce(atEnd, { type: 'pasteBeats', fragment: firstTwoBeats() });

    // Assert
    expect(pasted.document?.song.measureHeaders).toHaveLength(3);
    expect(pasted.cursor).toMatchObject({ measureIndex: 2, beatIndex: 0 });
    expect(pasted.past).toHaveLength(1);
    expect(pasted.hint).toBe('2 beats pasted over bar 2 of Guitar. A bar was added at the end of the song, in every track.');
  });

  it('pastes a guitar’s beats into a drum track as the drums of their pitches, and says so', () => {
    // Arrange: a drum track as track 2
    const state = reduce(loaded(withTrack(twoBars(), [[], []], { name: 'Drums', isPercussion: true })), place(0, 0, 1));

    // Act
    const pasted = reduce(state, { type: 'pasteBeats', fragment: firstTwoBeats() });

    // Assert: E4 (64) and F4 (65) on string 1
    expect(frets(pasted, 0, 1)).toEqual(['1/64', '1/65', 'r']);
    expect(pasted.hint).toBe('2 beats pasted over bar 1 of Drums. Each note became the drum of its MIDI pitch.');
  });

  it('pastes drum beats into a guitar as the pitches of their keys, an octave up where the neck has none', () => {
    // Arrange: kick (36) and snare (38) copied from a drum track
    const drums: BeatFragment = { isPercussion: true, items: [36, 38].map((key) => ({ duration: QUARTER, notes: [note(1, key)], stroke: NO_STROKE, pickStroke: 'none' })) };

    // Act
    const pasted = reduce(loaded(), { type: 'pasteBeats', fragment: drums });

    // Assert: C3 and D3 (the open D string)
    expect(frets(pasted, 0)).toEqual(['5/3', '4/0', '1/2', '1/3']);
    expect(pasted.hint).toBe('2 beats pasted over bar 1 of Guitar. Each drum became the pitch of its MIDI key. 2 notes moved by octaves to fit the neck.');
  });

  it('places a guitar’s notes on a bass by pitch, and counts what it left out', () => {
    // Arrange: a 4-string bass as track 2; a six-note E chord copied from the guitar
    const chord = makeSong([[beat(960, [note(1, 0), note(2, 0), note(3, 1), note(4, 2), note(5, 2), note(6, 0)], { ...QUARTER, value: 1 })], []]);
    const song = withTrack(chord, [[], []], { name: 'Bass', strings: [43, 38, 33, 28].map((tuning, i) => ({ number: i + 1, tuning })) });
    const fragment = selectedFragment(loaded(song));

    // Act
    const pasted = reduce(loaded(song), place(0, 0, 1), { type: 'pasteBeats', fragment: fragment as BeatFragment });

    // Assert
    expect(pasted.document?.song.tracks[1]?.measures[0]?.beats[0]?.voices[0]?.notes).toHaveLength(4);
    expect(pasted.hint).toBe('1 beat pasted over bar 1 of Bass. The notes were placed on its strings by pitch. 2 notes were left out: their beats hold more notes than Bass has strings.');
  });

  it('pastes only the rhythm into drums from a clipboard that does not say the pitches (an earlier version’s)', () => {
    const state = reduce(loaded(withTrack(twoBars(), [[], []], { name: 'Drums', isPercussion: true })), place(0, 0, 1));
    const pasted = reduce(state, { type: 'pasteBeats', fragment: { isPercussion: false, items: firstTwoBeats().items } });
    expect(pasted.document?.song.tracks[1]?.measures[0]?.beats.every((b) => b.voices.every((voice) => voice.notes.length === 0))).toBe(true);
    expect(pasted.past).toHaveLength(1);
    expect(pasted.hint).toBe('2 beats pasted over bar 1 of Drums. Only their rhythm: the copied beats do not say which pitches their notes are.');
  });

  it('keeps the track’s capo out of the pitch: a capo 2 guitar’s fret 3 is fret 5 without one', () => {
    const capo = onStrings(twoBars(), [64, 59, 55, 50, 45, 40], { offset: 2 });
    const fragment = { ...selectedFragment(loaded(capo)), isPercussion: false } as BeatFragment;
    const pasted = reduce(loaded(), place(1, 0), { type: 'pasteBeats', fragment });
    expect(frets(pasted, 1).slice(0, 1)).toEqual(['1/2']);
  });

  it('says why nothing was pasted when the copied beats are none', () => {
    const state = loaded();
    const pasted = reduce(state, { type: 'pasteBeats', fragment: { isPercussion: false, items: [] } });
    expect(pasted.document).toBe(state.document);
    expect(pasted.past).toHaveLength(0);
    expect(pasted.hint).toBe('Nothing was pasted at bar 1: there were no beats to write.');
  });

  it('does nothing without a document', () => {
    expect(reduce(INITIAL_EDITOR_STATE, { type: 'pasteBeats', fragment: firstTwoBeats() })).toBe(INITIAL_EDITOR_STATE);
  });
});
