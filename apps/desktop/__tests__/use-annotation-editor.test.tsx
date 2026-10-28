import ReactTestRenderer from 'react-test-renderer';
import { type Song, type StringAddress, deleteMeasures, insertBeat, setBeatAnnotation } from '@gp-editor/core';
import { type AnnotationEditor, useAnnotationEditor } from '../src/hooks/use-annotation-editor';
import type { SongAction } from '../src/state/song-actions';
import type { WorkspaceAction } from '../src/state/workspace';
import { beat, makeSong, note } from '../test-support/songs';

/** Bar 1: two beats, the second with an annotation under the staves; bar 2: one beat. */
const SONG: Song = setBeatAnnotation(
  makeSong([[beat(960, [note(1, 0)]), beat(1920, [note(1, 2)])], [beat(4800, [note(6, 0)])]]),
  { trackIndex: 0, measureIndex: 0, beatIndex: 1, voiceIndex: 0 },
  { text: 'breathe', placement: 'below' },
);

const cursorAt = (measureIndex: number, beatIndex: number): StringAddress => ({ trackIndex: 0, measureIndex, beatIndex, voiceIndex: 0, string: 1 });
const place = (measureIndex: number, beatIndex: number) => ({ trackIndex: 0, measureIndex, beatIndex });
const inTab = (action: SongAction, tabId = 'tab-1'): WorkspaceAction => ({ type: 'inTab', tabId, action });

interface Harness {
  readonly current: () => AnnotationEditor;
  readonly dispatch: jest.Mock<void, [WorkspaceAction]>;
  readonly rerender: (song: Song, cursor: StringAddress | undefined, tabId?: string) => void;
}

function renderEditor(cursor: StringAddress = cursorAt(0, 0), song: Song = SONG): Harness {
  let editor: AnnotationEditor | undefined;
  const dispatch = jest.fn<void, [WorkspaceAction]>();
  function Probe({ shown, at, tab }: { readonly shown: Song; readonly at: StringAddress | undefined; readonly tab: string | undefined }) {
    editor = useAnnotationEditor(shown, at, tab, dispatch);
    return null;
  }
  let renderer!: ReactTestRenderer.ReactTestRenderer;
  ReactTestRenderer.act(() => {
    renderer = ReactTestRenderer.create(<Probe shown={song} at={cursor} tab="tab-1" />);
  });
  return {
    current: () => {
      if (editor === undefined) {
        throw new Error('the hook did not run');
      }
      return editor;
    },
    dispatch,
    rerender: (next, at, tab = 'tab-1') => ReactTestRenderer.act(() => renderer.update(<Probe shown={next} at={at} tab={tab} />)),
  };
}

const act = (run: () => void) => ReactTestRenderer.act(run);

describe('useAnnotationEditor', () => {
  it('opens on the cursor’s beat, empty there, and writes what was typed when Apply is pressed', () => {
    // Arrange
    const editor = renderEditor();

    // Act
    act(() => editor.current().open());
    act(() => editor.current().changeText('Watch the bend'));
    const beforeApply = editor.dispatch.mock.calls.length;
    act(() => editor.current().apply());

    // Assert
    expect(beforeApply).toBe(0);
    expect(editor.current().isOpen).toBe(true);
    expect(editor.dispatch.mock.calls).toEqual([[inTab({ type: 'setBeatAnnotation', at: place(0, 0), annotation: { text: 'Watch the bend', placement: 'above' } })]]);
    expect(editor.current().draft?.isEdited).toBe(false);
  });

  it('shows the beat’s annotation, and writes the typing to its beat when the cursor goes elsewhere', () => {
    // Arrange
    const editor = renderEditor(cursorAt(0, 1));
    act(() => editor.current().open());

    // Act
    act(() => editor.current().changeText('breathe here'));
    editor.rerender(SONG, cursorAt(1, 0));

    // Assert
    expect(editor.dispatch.mock.calls).toEqual([[inTab({ type: 'setBeatAnnotation', at: place(0, 1), annotation: { text: 'breathe here', placement: 'below' } })]]);
    expect(editor.current().draft).toMatchObject({ at: place(1, 0), text: '', isEdited: false });
  });

  it('places an annotation over or under the staves at once, one edit, and a new one where the last one was put', () => {
    // Arrange
    const editor = renderEditor(cursorAt(0, 1));
    act(() => editor.current().open());

    // Act
    act(() => editor.current().changePlacement('above'));
    editor.rerender(SONG, cursorAt(1, 0));
    act(() => editor.current().changePlacement('below'));

    // Assert
    expect(editor.dispatch.mock.calls).toEqual([[inTab({ type: 'setBeatAnnotation', at: place(0, 1), annotation: { text: 'breathe', placement: 'above' } })]]);
    expect(editor.current().draft).toMatchObject({ at: place(1, 0), text: '', placement: 'below' });
  });

  it('deletes the beat’s annotation', () => {
    const editor = renderEditor(cursorAt(0, 1));
    act(() => editor.current().open());
    act(() => editor.current().remove());
    expect(editor.dispatch.mock.calls).toEqual([[inTab({ type: 'setBeatAnnotation', at: place(0, 1), annotation: undefined })]]);
    expect(editor.current().draft).toMatchObject({ text: '', isEdited: false });
  });

  it('moves the annotation it showed to the cursor’s beat, one edit', () => {
    // Arrange
    const editor = renderEditor(cursorAt(0, 1));
    act(() => editor.current().open());
    editor.rerender(SONG, cursorAt(1, 0));

    // Act
    const movable = editor.current().movable;
    act(() => editor.current().moveHere());

    // Assert
    expect(movable).toEqual({ at: place(0, 1), excerpt: 'breathe' });
    expect(editor.dispatch.mock.calls).toEqual([[inTab({ type: 'moveBeatAnnotation', from: place(0, 1), to: place(1, 0) })]]);
  });

  it('offers no move onto the beat it came from or one with its own annotation', () => {
    const editor = renderEditor(cursorAt(0, 1));
    act(() => editor.current().open());
    expect(editor.current().movable).toBeUndefined();
  });

  it('writes what was typed when it closes, and shows the song’s annotation again after an undo', () => {
    // Arrange
    const editor = renderEditor(cursorAt(0, 1));
    act(() => editor.current().open());
    act(() => editor.current().changeText('later'));

    // Act
    act(() => editor.current().close());
    const closed = editor.current().isOpen;
    act(() => editor.current().open());
    const changed = setBeatAnnotation(SONG, { trackIndex: 0, measureIndex: 0, beatIndex: 1, voiceIndex: 0 }, { text: 'from an undo', placement: 'below' });
    editor.rerender(changed, cursorAt(0, 1));

    // Assert
    expect(closed).toBe(false);
    expect(editor.dispatch.mock.calls).toEqual([[inTab({ type: 'setBeatAnnotation', at: place(0, 1), annotation: { text: 'later', placement: 'below' } })]]);
    expect(editor.current().draft).toMatchObject({ text: 'from an undo', isEdited: false });
  });

  it('writes the typing to the tab it was typed in when another tab is shown', () => {
    // Arrange
    const editor = renderEditor(cursorAt(0, 0));
    act(() => editor.current().open());
    act(() => editor.current().changeText('in tab 1'));

    // Act
    editor.rerender(SONG, cursorAt(0, 0), 'tab-2');

    // Assert
    expect(editor.dispatch.mock.calls).toEqual([[inTab({ type: 'setBeatAnnotation', at: place(0, 0), annotation: { text: 'in tab 1', placement: 'above' } }, 'tab-1')]]);
    expect(editor.current().draft).toMatchObject({ text: '', isEdited: false });
  });

  it('keeps what was typed when it is opened again while open (a right-click on another beat)', () => {
    // Arrange
    const editor = renderEditor(cursorAt(0, 0));
    act(() => editor.current().open());
    act(() => editor.current().changeText('still here'));

    // Act
    act(() => editor.current().open());

    // Assert
    expect(editor.current().draft).toMatchObject({ text: 'still here', isEdited: true });
    expect(editor.dispatch).not.toHaveBeenCalled();
  });

  it('shows the beat now under the cursor when an edit moved the annotated one away (nothing typed)', () => {
    // Arrange: the panel on bar 1's second beat, "breathe".
    const editor = renderEditor(cursorAt(0, 1));
    act(() => editor.current().open());

    // Act: a beat comes before it; the cursor stays where it was, on the beat that slid under it.
    editor.rerender(insertBeat(SONG, { trackIndex: 0, measureIndex: 0, beatIndex: 0, voiceIndex: 0 }, 'after'), cursorAt(0, 1));

    // Assert
    expect(editor.current().draft).toMatchObject({ at: place(0, 1), text: '', isEdited: false });
    expect(editor.current().hasAnnotation).toBe(false);
  });

  it('writes nothing, and says so, when the bar the typing was for is gone', () => {
    // Arrange
    const editor = renderEditor(cursorAt(1, 0));
    act(() => editor.current().open());
    act(() => editor.current().changeText('lost'));

    // Act: bar 2 deleted, the cursor back in bar 1.
    editor.rerender(deleteMeasures(SONG, 1, 1), cursorAt(0, 0));

    // Assert
    expect(editor.dispatch.mock.calls).toEqual([[{ type: 'inTab', tabId: 'tab-1', action: { type: 'showHint', hint: 'The annotation’s beat is gone: what was typed was not written.' } }]]);
  });

  it('forgets the annotation it could move once it closes', () => {
    const editor = renderEditor(cursorAt(0, 1));
    act(() => editor.current().open());
    act(() => editor.current().close());
    editor.rerender(SONG, cursorAt(1, 0));
    act(() => editor.current().open());
    expect(editor.current().movable).toBeUndefined();
  });

  it('closes without a cursor (no document)', () => {
    const editor = renderEditor();
    act(() => editor.current().open());
    editor.rerender(SONG, undefined);
    expect(editor.current().isOpen).toBe(false);
  });
});
