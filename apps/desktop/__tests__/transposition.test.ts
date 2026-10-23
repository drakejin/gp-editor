import type { Song, Transposition } from '@gp-editor/core';
import { type EditorAction, type EditorState, INITIAL_EDITOR_STATE, editorReducer } from '../src/state/editor';
import {
  MAX_TRANSPOSE_AMOUNT,
  clampTransposeAmount,
  clampTransposeOctaves,
  describeTransposition,
  initialTranspositionDraft,
  parseTransposeAmount,
  toTranspositionOptions,
  transpositionHint,
  transpositionScope,
} from '../src/state/transposition';
import { beat, makeSong, note } from '../test-support/songs';

const BAR = 3840;
const QUARTER_TICKS = 960;

/** Two 4/4 bars of quarter notes on string 3: frets 0–3, then 4–7. */
function twoBars(): Song {
  const bar = (index: number) => [0, 1, 2, 3].map((i) => beat(960 + index * BAR + i * QUARTER_TICKS, [note(3, index * 4 + i)]));
  return makeSong([bar(0), bar(1)]);
}

function reduce(state: EditorState, ...actions: EditorAction[]): EditorState {
  return actions.reduce(editorReducer, state);
}

function loaded(song: Song = twoBars()): EditorState {
  return reduce(INITIAL_EDITOR_STATE, { type: 'loaded', document: { fileName: 'a.gp5', path: '/a.gp5', song } });
}

function frets(state: EditorState, measureIndex: number): string[] {
  const beats = state.document?.song.tracks[0]?.measures[measureIndex]?.beats ?? [];
  return beats.map((b) => b.voices[0]?.notes.map((n) => `${n.string}/${n.fret}`).join(',') ?? '');
}

const RESULT: Transposition = { song: twoBars(), moved: 0, unplaced: 0, chords: 0, unplacedChords: 0 };

describe('transposition draft', () => {
  it('starts two semitones up, on the selection when there is one, else on the shown track', () => {
    expect(initialTranspositionDraft(true)).toEqual({ mode: 'chromatic', amount: 2, octaves: 0, target: 'selection', isChordsOnly: false });
    expect(initialTranspositionDraft(false).target).toBe('track');
  });

  it('reads typed amounts as whole numbers within the panel’s range, else keeps the last one', () => {
    expect(parseTransposeAmount(' +3 ', 0)).toBe(3);
    expect(parseTransposeAmount('-12', 0)).toBe(-12);
    expect(parseTransposeAmount('99', 0)).toBe(MAX_TRANSPOSE_AMOUNT);
    expect(parseTransposeAmount('2.5', 1)).toBe(1);
    expect(parseTransposeAmount('up', 4)).toBe(4);
    expect(clampTransposeAmount(-30)).toBe(-MAX_TRANSPOSE_AMOUNT);
    expect(clampTransposeOctaves(9)).toBe(4);
    expect(Object.is(clampTransposeAmount(-0.2), 0)).toBe(true);
  });

  it('names the amount in semitones, scale steps or octaves', () => {
    expect(describeTransposition({ mode: 'chromatic', amount: 2 })).toBe('up 2 semitones');
    expect(describeTransposition({ mode: 'chromatic', amount: -1 })).toBe('down 1 semitone');
    expect(describeTransposition({ mode: 'chromatic', amount: 0, octaves: -1 })).toBe('down 1 octave');
    expect(describeTransposition({ mode: 'chromatic', amount: 2, octaves: 1 })).toBe('up 14 semitones');
    expect(describeTransposition({ mode: 'diatonic', amount: -1 })).toBe('down 1 scale step');
    expect(describeTransposition({ mode: 'diatonic', amount: 0, octaves: 2 })).toBe('up 2 octaves');
    expect(describeTransposition({ mode: 'diatonic', amount: 0 })).toBe('by nothing');
  });

  it('turns the panel’s settings into gp-core options and scopes', () => {
    // Arrange
    const draft = { ...initialTranspositionDraft(false), mode: 'diatonic' as const, amount: -1, octaves: 1, isChordsOnly: true };
    const cursor = { trackIndex: 0, measureIndex: 1, beatIndex: 2, voiceIndex: 1, string: 4 };
    const anchor = { ...cursor, measureIndex: 0, beatIndex: 3 };

    // Act + Assert
    expect(toTranspositionOptions(draft)).toEqual({ mode: 'diatonic', amount: -1, octaves: 1, isChordsOnly: true });
    expect(transpositionScope({ cursor, selectionAnchor: anchor, trackIndex: 0 }, 'selection')).toEqual({
      kind: 'beats',
      from: { trackIndex: 0, measureIndex: 0, beatIndex: 3, voiceIndex: 1 },
      to: { trackIndex: 0, measureIndex: 1, beatIndex: 2, voiceIndex: 1 },
    });
    expect(transpositionScope({ cursor, selectionAnchor: undefined, trackIndex: 0 }, 'selection')).toBeUndefined();
    expect(transpositionScope({ cursor, selectionAnchor: undefined, trackIndex: 2 }, 'track')).toEqual({ kind: 'track', trackIndex: 2 });
    expect(transpositionScope({ cursor: undefined, selectionAnchor: undefined, trackIndex: 0 }, 'song')).toEqual({ kind: 'song' });
  });
});

describe('transpositionHint', () => {
  const UP_TWO = { mode: 'chromatic' as const, amount: 2 };

  it('says what moved and what stayed', () => {
    expect(transpositionHint({ ...RESULT, moved: 24, chords: 3 }, UP_TWO)).toBe('Transposed 24 notes up 2 semitones. 3 chords moved with them.');
    expect(transpositionHint({ ...RESULT, moved: 5, unplaced: 1 }, UP_TWO)).toBe(
      'Transposed 5 notes up 2 semitones. 1 note did not fit on the neck at the new pitch and stayed as it was.',
    );
    expect(transpositionHint({ ...RESULT, unplaced: 2 }, UP_TWO)).toBe('No notes moved. 2 notes did not fit on the neck at the new pitch and stayed as they were.');
    expect(transpositionHint(RESULT, UP_TWO)).toBe('No notes to transpose here (drum tracks never move).');
  });

  it('speaks of chords when only chords move', () => {
    const chordsOnly = { ...UP_TWO, isChordsOnly: true };
    expect(transpositionHint({ ...RESULT, chords: 8 }, chordsOnly)).toBe('Moved 8 chords up 2 semitones; the notes stayed.');
    expect(transpositionHint({ ...RESULT, unplacedChords: 1 }, chordsOnly)).toBe(
      'No chord names or diagrams to move here. 1 chord diagram did not fit on the neck and stayed as it was.',
    );
  });
});

describe('editor: transpose', () => {
  it('transposes in one undo step, keeps the selection and tells what moved', () => {
    // Arrange: beats 2–3 of bar 1 selected.
    const state = reduce(loaded(), { type: 'moveCursorBeat', step: 1 }, { type: 'extendSelection', step: 1 });
    const scope = transpositionScope(state, 'selection');
    if (scope === undefined) {
      throw new Error('no selection');
    }

    // Act
    const transposed = reduce(state, { type: 'transpose', scope, options: { mode: 'chromatic', amount: 2 } });
    const undone = reduce(transposed, { type: 'undo' });

    // Assert
    expect(frets(transposed, 0)).toEqual(['3/0', '3/3', '3/4', '3/3']);
    expect(transposed.selectionAnchor).toEqual(state.selectionAnchor);
    expect(transposed.hint).toBe('Transposed 2 notes up 2 semitones.');
    expect(transposed.past).toHaveLength(1);
    expect(frets(undone, 0)).toEqual(['3/0', '3/1', '3/2', '3/3']);
  });

  it('leaves the song and its history alone when nothing moves, and says so', () => {
    const state = loaded();
    const after = reduce(state, { type: 'transpose', scope: { kind: 'song' }, options: { mode: 'chromatic', amount: 2, isChordsOnly: true } });
    expect(after.document?.song).toBe(state.document?.song);
    expect(after.past).toHaveLength(0);
    expect(after.hint).toBe('No chord names or diagrams to move here.');
  });

  it('does nothing without a document', () => {
    expect(reduce(INITIAL_EDITOR_STATE, { type: 'transpose', scope: { kind: 'song' }, options: { mode: 'chromatic', amount: 2 } })).toBe(INITIAL_EDITOR_STATE);
  });
});
