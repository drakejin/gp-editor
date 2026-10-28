import { songAnnotations } from '@gp-editor/core';
import { type EditorAction, type EditorState, INITIAL_EDITOR_STATE, editorReducer } from '../src/state/editor';
import { beat, makeSong, note } from '../test-support/songs';

/** Two bars: three quarters and a half in bar 1, a whole note in bar 2. */
function loadedState(): EditorState {
  const song = makeSong([
    [beat(960, [note(1, 3)]), beat(1920, [note(1, 5)]), beat(2880, [note(2, 1)])],
    [beat(4800, [note(6, 0)])],
  ]);
  return editorReducer(INITIAL_EDITOR_STATE, { type: 'loaded', document: { fileName: 'a.gp5', path: '/a.gp5', song } });
}

const song = (state: EditorState) => state.document!.song;
const places = (state: EditorState) => songAnnotations(song(state)).map(({ measureIndex, beatIndex, annotation }) => `${measureIndex}:${beatIndex} ${annotation.text}`);
const place = (measureIndex: number, beatIndex: number) => ({ trackIndex: 0, measureIndex, beatIndex });
const run = (state: EditorState, ...actions: EditorAction[]) => actions.reduce(editorReducer, state);

describe('editorReducer: annotations', () => {
  it('adds, changes and takes away an annotation, one undo step each', () => {
    // Arrange
    const start = loadedState();

    // Act
    const added = run(start, { type: 'setBeatAnnotation', at: place(0, 1), annotation: { text: 'breathe', placement: 'above' } });
    const changed = run(added, { type: 'setBeatAnnotation', at: place(0, 1), annotation: { text: 'breathe here', placement: 'below' } });
    const removed = run(changed, { type: 'setBeatAnnotation', at: place(0, 1), annotation: undefined });

    // Assert
    expect(places(added)).toEqual(['0:1 breathe']);
    expect(song(changed).tracks[0]?.measures[0]?.beats[1]?.annotation).toEqual({ text: 'breathe here', placement: 'below' });
    expect(places(removed)).toEqual([]);
    expect(removed.past).toHaveLength(3);
    expect(places(run(removed, { type: 'undo' }))).toEqual(['0:1 breathe here']);
    expect(places(run(removed, { type: 'undo' }, { type: 'undo' }, { type: 'undo' }))).toEqual([]);
  });

  it('moves an annotation to another beat in one undo step, the cursor where it was', () => {
    // Arrange
    const start = run(loadedState(), { type: 'setBeatAnnotation', at: place(0, 2), annotation: { text: 'loud', placement: 'above' } });

    // Act
    const moved = run(start, { type: 'moveBeatAnnotation', from: place(0, 2), to: place(1, 0) });
    const undone = run(moved, { type: 'undo' });

    // Assert
    expect(places(moved)).toEqual(['1:0 loud']);
    expect(moved.past).toHaveLength(start.past.length + 1);
    expect(moved.cursor).toEqual(start.cursor);
    expect(places(undone)).toEqual(['0:2 loud']);
  });

  it('adds no undo step for an annotation edit that changes nothing', () => {
    // Arrange
    const start = run(loadedState(), { type: 'setBeatAnnotation', at: place(0, 2), annotation: { text: 'loud', placement: 'above' } });
    const unchanged: readonly EditorAction[] = [
      { type: 'setBeatAnnotation', at: place(0, 2), annotation: { text: ' loud ', placement: 'above' } },
      { type: 'setBeatAnnotation', at: place(0, 0), annotation: { text: '  ', placement: 'above' } },
      { type: 'setBeatAnnotation', at: place(9, 0), annotation: { text: 'nowhere', placement: 'above' } },
      { type: 'moveBeatAnnotation', from: place(0, 0), to: place(1, 0) },
      { type: 'moveBeatAnnotation', from: place(0, 2), to: place(0, 2) },
    ];

    // Act + Assert
    unchanged.forEach((action) => expect(editorReducer(start, action)).toBe(start));
    expect(editorReducer(INITIAL_EDITOR_STATE, unchanged[0]!)).toBe(INITIAL_EDITOR_STATE);
  });

  it('keeps an annotation on its beat when a bar is inserted before it, and undo puts both back', () => {
    // Arrange: the cursor on bar 1.
    const start = run(loadedState(), { type: 'setBeatAnnotation', at: place(1, 0), annotation: { text: 'coda', placement: 'below' } });

    // Act
    const inserted = run(start, { type: 'edit', edit: { type: 'insertMeasure' } });

    // Assert
    expect(places(inserted)).toEqual(['2:0 coda']);
    expect(places(run(inserted, { type: 'undo' }))).toEqual(['1:0 coda']);
  });
});
