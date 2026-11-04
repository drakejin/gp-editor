import { useReducer } from 'react';
import ReactTestRenderer from 'react-test-renderer';
import type { Song, StringAddress } from '@gp-editor/core';
import { type PitchDrag, usePitchDrag } from '../src/hooks/use-pitch-drag';
import { type EditorAction, type EditorState, INITIAL_EDITOR_STATE, editorReducer } from '../src/state/editor';
import { beat, makeSong, note, onStrings } from '../test-support/songs';

jest.mock('../src/native/focus-view', () => ({ focusView: () => undefined }));

const QUARTER = 960;

/** One bar on string 3: frets 0, 2, 4 and 5 (G3, A3, B3, C4). */
const SONG = makeSong([[0, 2, 4, 5].map((fret, i) => beat(QUARTER + i * QUARTER, [note(3, fret)]))]);

const at = (beatIndex: number, string = 3): StringAddress => ({ trackIndex: 0, measureIndex: 0, beatIndex, voiceIndex: 0, string });

function reduce(state: EditorState, ...actions: EditorAction[]): EditorState {
  return actions.reduce(editorReducer, state);
}

function loaded(song: Song = SONG): EditorState {
  return reduce(INITIAL_EDITOR_STATE, { type: 'loaded', document: { fileName: 'a.gp5', path: '/a.gp5', song } }, { type: 'placeCursor', cursor: at(0) });
}

interface Rendered {
  readonly drag: () => PitchDrag;
  readonly state: () => EditorState;
  /** An editor action from elsewhere (an arrow key, an MCP tool) while the mouse is down. */
  readonly dispatch: (action: EditorAction) => void;
  /** Each act() of its own, as the mouse's events come one by one. */
  readonly run: (step: (drag: PitchDrag) => unknown) => void;
}

/** The hook on a real editor reducer, starting from `initial`. */
function renderDrag(initial: EditorState): Rendered {
  let drag: PitchDrag | undefined;
  let state: EditorState = initial;
  let send: (action: EditorAction) => void = () => undefined;
  function Probe() {
    const [current, dispatch] = useReducer(editorReducer, initial);
    state = current;
    send = dispatch;
    drag = usePitchDrag({ state: current, dispatch, keyboardView: { current: null } });
    return null;
  }
  ReactTestRenderer.act(() => {
    ReactTestRenderer.create(<Probe />);
  });
  const latest = () => {
    if (drag === undefined) {
      throw new Error('the hook did not run');
    }
    return drag;
  };
  const run = (step: (drag: PitchDrag) => unknown) => {
    ReactTestRenderer.act(() => {
      step(latest());
    });
  };
  return { drag: latest, state: () => state, run, dispatch: (action) => ReactTestRenderer.act(() => send(action)) };
}

/** The frets of the bar's beats on string 3 (another string's note as string/fret). */
function frets(song: Song | undefined): string[] {
  const beats = song?.tracks[0]?.measures[0]?.beats ?? [];
  return beats.map((each) => each.voices[0]?.notes.map((n) => (n.string === 3 ? String(n.fret) : `${n.string}/${n.fret}`)).join(',') ?? '');
}

describe('usePitchDrag: a note dragged up or down', () => {
  it('puts the cursor on a note pressed outside the selection, previews the drag and makes it one undo step when let go', () => {
    // Arrange
    const view = renderDrag(loaded());

    // Act
    view.run((drag) => drag.onPressNote(at(2)));
    const cursor = view.state().cursor;
    view.run((drag) => drag.onDragNote(1));
    view.run((drag) => drag.onDragNote(3));
    const previewed = { song: view.drag().song, hint: view.drag().hint, shown: view.state().document?.song };
    view.run((drag) => drag.onEndNote('drag'));

    // Assert: B3 → D4, at fret 7 of string 3.
    expect(cursor).toEqual(at(2));
    expect(frets(previewed.song)).toEqual(['0', '2', '7', '5']);
    expect(previewed.hint).toBe('+3 semitones: let go to move, Esc to cancel');
    expect(previewed.shown).toBe(SONG);
    expect(frets(view.state().document?.song)).toEqual(['0', '2', '7', '5']);
    expect(view.state().past).toHaveLength(1);
    expect(view.drag().song).toBeUndefined();
    expect(view.drag().hint).toBeUndefined();
  });

  it('applies a quick release whose press, moves and mouse-up reach JS in one batch, before the press is drawn', () => {
    // Arrange: React Native delivers the queued touch events of a busy JS thread one after the other, rendering after.
    const view = renderDrag(loaded());

    // Act
    view.run((drag) => {
      drag.onPressNote(at(2));
      drag.onDragNote(1);
      drag.onDragNote(3);
      drag.onEndNote('drag');
    });

    // Assert: B3 → D4, one undo step, nothing left on screen.
    expect(frets(view.state().document?.song)).toEqual(['0', '2', '7', '5']);
    expect(view.state().cursor).toEqual(at(2));
    expect(view.state().past).toHaveLength(1);
    expect(view.drag().song).toBeUndefined();
    expect(view.drag().hint).toBeUndefined();
  });

  it('moves the selected notes on a quick release in one batch too, the selection kept', () => {
    // Arrange: beats 2–4 selected.
    const selected = reduce(loaded(), { type: 'selectBeats', anchor: at(1), cursor: at(3) });
    const view = renderDrag(selected);

    // Act
    view.run((drag) => {
      drag.onPressNote(at(2));
      drag.onDragNote(-2);
      drag.onEndNote('drag');
    });

    // Assert
    expect(frets(view.state().document?.song)).toEqual(['0', '0', '2', '3']);
    expect(view.state().selectionAnchor).toEqual(selected.selectionAnchor);
  });

  it('moves every selected note when the drag starts on one of them, the selection kept', () => {
    // Arrange: beats 2–4 selected.
    const selected = reduce(loaded(), { type: 'selectBeats', anchor: at(1), cursor: at(3) });
    const view = renderDrag(selected);

    // Act
    view.run((drag) => drag.onPressNote(at(2)));
    const during = { cursor: view.state().cursor, anchor: view.state().selectionAnchor };
    view.run((drag) => drag.onDragNote(-2));
    view.run((drag) => drag.onEndNote('drag'));

    // Assert: A3 → G3, B3 → A3, C4 → B♭3.
    expect(during).toEqual({ cursor: selected.cursor, anchor: selected.selectionAnchor });
    expect(frets(view.state().document?.song)).toEqual(['0', '0', '2', '3']);
    expect(view.state().selectionAnchor).toEqual(selected.selectionAnchor);
    expect(view.state().past).toHaveLength(1);
  });

  it('puts the cursor on a selected note clicked without a drag, as any click does', () => {
    // Arrange
    const view = renderDrag(reduce(loaded(), { type: 'selectBeats', anchor: at(1), cursor: at(3) }));

    // Act
    view.run((drag) => drag.onPressNote(at(2)));
    view.run((drag) => drag.onEndNote('click'));

    // Assert
    expect(view.state().cursor).toEqual(at(2));
    expect(view.state().selectionAnchor).toBeUndefined();
    expect(view.state().document?.song).toBe(SONG);
  });

  it('changes nothing for a drag let go where it began, nor for one turned into a selection drag', () => {
    // Arrange
    const view = renderDrag(loaded());

    // Act
    view.run((drag) => drag.onPressNote(at(1)));
    view.run((drag) => drag.onDragNote(2));
    view.run((drag) => drag.onDragNote(0));
    const back = view.drag().song;
    view.run((drag) => drag.onEndNote('drag'));
    view.run((drag) => drag.onPressNote(at(2)));
    view.run((drag) => drag.onEndNote('select'));

    // Assert
    expect(back).toBeUndefined();
    expect(view.state().document?.song).toBe(SONG);
    expect(view.state().past).toHaveLength(0);
  });

  it('stops on Esc: the notes stay where they were, letting go does nothing', () => {
    // Arrange
    const view = renderDrag(loaded());
    let cancelled = false;

    // Act
    view.run((drag) => drag.onPressNote(at(1)));
    view.run((drag) => drag.onDragNote(2));
    view.run((drag) => {
      cancelled = drag.cancel();
    });
    const after = view.drag().song;
    view.run((drag) => drag.onDragNote(4));
    view.run((drag) => drag.onEndNote('drag'));

    // Assert
    expect(cancelled).toBe(true);
    expect(after).toBeUndefined();
    expect(view.state().document?.song).toBe(SONG);
    expect(view.drag().cancel()).toBe(false);
  });

  it('lets Esc on a note not yet dragged do what Esc does, the gesture over all the same', () => {
    // Arrange
    const view = renderDrag(loaded());
    let swallowed = true;

    // Act
    view.run((drag) => drag.onPressNote(at(1)));
    view.run((drag) => {
      swallowed = drag.cancel();
    });
    view.run((drag) => drag.onDragNote(2));
    view.run((drag) => drag.onEndNote('drag'));

    // Assert
    expect(swallowed).toBe(false);
    expect(view.state().document?.song).toBe(SONG);
  });

  it('moves nothing when the cursor left the pressed note before the mouse came up, nor for a lost gesture', () => {
    // Arrange
    const view = renderDrag(loaded());

    // Act: an arrow key's move while the note is held, then a drag whose row went away
    view.run((drag) => drag.onPressNote(at(2)));
    view.run((drag) => drag.onDragNote(2));
    view.dispatch({ type: 'moveCursorBeat', step: 1 });
    view.run((drag) => drag.onEndNote('drag'));
    view.run((drag) => drag.onPressNote(at(1)));
    view.run((drag) => drag.onDragNote(2));
    view.run((drag) => drag.onEndNote('cancel'));

    // Assert
    expect(view.state().document?.song).toBe(SONG);
    expect(view.drag().song).toBeUndefined();
  });

  it('moves no drum note and says why, while dragging and when let go', () => {
    // Arrange
    const drums = onStrings(makeSong([[beat(QUARTER, [note(1, 36)])]]), [0, 0, 0, 0, 0, 0], { isPercussion: true });
    const view = renderDrag(reduce(loaded(drums), { type: 'placeCursor', cursor: at(0, 1) }));
    const drumsHint = 'Drum notes do not move by semitones: a drum note’s fret is the drum it plays.';

    // Act
    view.run((drag) => drag.onPressNote(at(0, 1)));
    view.run((drag) => drag.onDragNote(2));
    const hint = view.drag().hint;
    view.run((drag) => drag.onEndNote('drag'));

    // Assert
    expect(hint).toBe(`+2 semitones — ${drumsHint}`);
    expect(view.state().document?.song).toBe(drums);
    expect(view.state().hint).toBe(drumsHint);
  });
});
