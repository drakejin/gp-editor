import type { MeasureHeader } from '@gp-editor/core';
import { type EditorState, INITIAL_EDITOR_STATE, editorReducer } from '../src/state/editor';
import type { SongEdit } from '../src/state/song-edits';
import { beat, header, makeSong, note } from '../test-support/songs';

/** Two bars of one whole note each; `first` overrides the first bar's header. */
function loaded(first: Partial<MeasureHeader> = {}): EditorState {
  const song = makeSong([[beat(960, [note(1, 3)])], [beat(4800, [note(1, 5)])]], [header(1, first), header(2)]);
  return editorReducer(INITIAL_EDITOR_STATE, { type: 'loaded', document: { fileName: 'a.gp5', path: '/a.gp5', song } });
}

const edit = (state: EditorState, songEdit: SongEdit) => editorReducer(state, { type: 'edit', edit: songEdit });
const bar = (state: EditorState, index = 0): MeasureHeader => state.document!.song.measureHeaders[index]!;

describe('typed tempo', () => {
  it('sets a decimal tempo on the bar and the bars after it with the same tempo', () => {
    // Act
    const typed = edit(loaded(), { type: 'setTempo', tempo: 92.5 });

    // Assert
    expect([bar(typed).tempo, bar(typed, 1).tempo]).toEqual([92.5, 92.5]);
  });

  it('keeps the song when the tempo is not a number', () => {
    const state = loaded();
    expect(edit(state, { type: 'setTempo', tempo: Number.NaN }).document).toBe(state.document);
  });
});

describe('typed time signature', () => {
  it('sets a time signature on the bar and the bars after it with the same one, in one undo step', () => {
    // Act
    const typed = edit(loaded(), { type: 'setTimeSignature', numerator: 6, denominator: 8 });

    // Assert
    expect([bar(typed).timeSignature, bar(typed, 1).timeSignature]).toEqual([
      { numerator: 6, denominator: 8 },
      { numerator: 6, denominator: 8 },
    ]);
    expect(typed.past).toHaveLength(1);
  });

  it('keeps the song for a denominator that is no note value', () => {
    const state = loaded();
    expect(edit(state, { type: 'setTimeSignature', numerator: 4, denominator: 5 }).document).toBe(state.document);
  });
});

describe('bar edits at the cursor', () => {
  it('turns alternate endings on and off one at a time', () => {
    // Act
    const first = edit(loaded(), { type: 'toggleAlternateEnding', ending: 1 });
    const firstAndThird = edit(first, { type: 'toggleAlternateEnding', ending: 3 });
    const third = edit(firstAndThird, { type: 'toggleAlternateEnding', ending: 1 });
    const eighth = edit(loaded(), { type: 'toggleAlternateEnding', ending: 8 });

    // Assert
    expect(bar(first).repeatAlternative).toBe(0b1);
    expect(bar(firstAndThird).repeatAlternative).toBe(0b101);
    expect(bar(third).repeatAlternative).toBe(0b100);
    expect(bar(eighth).repeatAlternative).toBe(0b1000_0000);
    expect(third.past).toHaveLength(3);
  });

  it.each([0, 9, 2.5, Number.NaN])('ignores alternate ending %d', (ending) => {
    const start = loaded();
    expect(edit(start, { type: 'toggleAlternateEnding', ending })).toBe(start);
  });

  it('changes the repeat count of a repeat close, never below two', () => {
    // Arrange
    const closed = edit(loaded(), { type: 'toggleRepeatClose' });

    // Act
    const three = edit(closed, { type: 'shiftRepeatCount', delta: 1 });
    const two = edit(three, { type: 'shiftRepeatCount', delta: -5 });

    // Assert
    expect(bar(closed).repeatClose).toBe(2);
    expect(bar(three).repeatClose).toBe(3);
    expect(bar(two).repeatClose).toBe(2);
    expect(edit(two, { type: 'shiftRepeatCount', delta: -1 })).toBe(two);
  });

  it('changes no repeat count where the bar has no repeat close', () => {
    const start = loaded();
    expect(edit(start, { type: 'shiftRepeatCount', delta: 1 })).toBe(start);
  });

  it('sets the triplet feel from the cursor bar on', () => {
    const swung = edit(loaded(), { type: 'setTripletFeel', feel: 'eighth' });
    expect([bar(swung, 0).tripletFeel, bar(swung, 1).tripletFeel]).toEqual(['eighth', 'eighth']);
    expect(edit(swung, { type: 'setTripletFeel', feel: 'eighth' })).toBe(swung);
  });

  it('names a section with a red marker, keeps the colour of an existing marker and removes it with an empty title', () => {
    // Arrange
    const blue = { r: 0, g: 0, b: 255 };

    // Act
    const verse = edit(loaded(), { type: 'setSection', title: ' Verse ' });
    const renamed = edit(loaded({ marker: { title: 'Intro', color: blue } }), { type: 'setSection', title: 'Chorus' });
    const removed = edit(verse, { type: 'setSection', title: '  ' });

    // Assert
    expect(bar(verse).marker).toEqual({ title: 'Verse', color: { r: 255, g: 0, b: 0 } });
    expect(bar(renamed).marker).toEqual({ title: 'Chorus', color: blue });
    expect(bar(removed).marker).toBeUndefined();
    expect(edit(verse, { type: 'setSection', title: 'Verse' })).toBe(verse);
  });

  it('removes no marker where there is none', () => {
    const start = loaded();
    expect(edit(start, { type: 'setSection', title: '' })).toBe(start);
  });
});

describe('clef and key signature at the cursor', () => {
  const measures = (state: EditorState) => state.document!.song.tracks[0]!.measures;

  it('sets the clef of the cursor’s bar and the bars after it, one undo step', () => {
    // Act
    const bass = edit(loaded(), { type: 'setClef', clef: 'bass' });

    // Assert
    expect(measures(bass).map((measure) => measure.clef)).toEqual(['bass', 'bass']);
    expect(bass.past).toHaveLength(1);
  });

  it('sets a typed key signature from the cursor’s bar, and keeps the song for one out of range', () => {
    // Arrange
    const state = loaded();

    // Act
    const eFlat = edit(state, { type: 'setKeySignature', keySignature: -3 });

    // Assert
    expect(measures(eFlat).map((measure) => measure.keySignature)).toEqual([-3, -3]);
    expect(edit(state, { type: 'setKeySignature', keySignature: Number.NaN }).document).toBe(state.document);
  });
});
