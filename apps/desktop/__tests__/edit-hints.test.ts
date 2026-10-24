import { type EditorState, INITIAL_EDITOR_STATE, editorReducer } from '../src/state/editor';
import { noNoteHint } from '../src/state/edit-hints';
import { beat, makeSong, note } from '../test-support/songs';

/** One 4/4 bar full of quarter notes, the cursor on its first note. */
function fullBar(): EditorState {
  const song = makeSong([[960, 1920, 2880, 3840].map((start) => beat(start, [note(1, 3)]))]);
  const loaded = editorReducer(INITIAL_EDITOR_STATE, { type: 'loaded', document: { fileName: 'a.gp5', path: '/a.gp5', song } });
  return editorReducer(loaded, { type: 'placeCursor', cursor: { trackIndex: 0, measureIndex: 0, beatIndex: 0, voiceIndex: 0, string: 1 } });
}

describe('editor hints', () => {
  it('says why a shorter time signature was refused instead of doing nothing silently', () => {
    // Arrange
    const before = fullBar();

    // Act
    const next = editorReducer(before, { type: 'edit', edit: { type: 'shiftTimeSignature', part: 'numerator', delta: -1 } });

    // Assert
    expect(next.document?.song).toBe(before.document?.song);
    expect(next.hint).toBe('Bar 1 is full: its notes do not fit in 3/4. Delete or shorten beats first.');
  });

  it('clears the hint after an edit that works', () => {
    const refused = editorReducer(fullBar(), { type: 'edit', edit: { type: 'shiftTimeSignature', part: 'denominator', delta: 1 } });
    expect(refused.hint).toBe('Bar 1 is full: its notes do not fit in 4/8. Delete or shorten beats first.');
    const next = editorReducer(refused, { type: 'edit', edit: { type: 'shiftTimeSignature', part: 'numerator', delta: 1 } });
    expect(next.hint).toBeUndefined();
  });

  it('can be dismissed', () => {
    const refused = editorReducer(fullBar(), { type: 'edit', edit: { type: 'shiftTimeSignature', part: 'numerator', delta: -1 } });
    expect(editorReducer(refused, { type: 'dismissHint' }).hint).toBeUndefined();
  });
});

describe('hints for a note key on an empty string', () => {
  /** The full bar with the cursor on string 2, where no note is. */
  function emptyString(): EditorState {
    return editorReducer(fullBar(), { type: 'moveCursorString', delta: 1 });
  }

  it.each([
    { type: 'toggleEffect', effect: 'letRing' },
    { type: 'toggleSlide' },
    { type: 'setVibrato', vibrato: 'wide' },
    { type: 'setBend', bend: { points: [{ position: 0, value: 0 }, { position: 6, value: 4 }] } },
  ] as const)('says to type a fret first for $type', (edit) => {
    // Act
    const next = editorReducer(emptyString(), { type: 'edit', edit });

    // Assert
    expect(next.hint).toBe('String 2 has no note at the cursor: type a fret (0–9) first.');
  });

  it('says nothing for an edit that needs no note', () => {
    const next = editorReducer(emptyString(), { type: 'edit', edit: { type: 'toggleDot' } });
    expect(next.hint).toBeUndefined();
  });

  it('can be shown for a key that opens a panel (B, C)', () => {
    const next = editorReducer(emptyString(), { type: 'showHint', hint: noNoteHint(2) });
    expect(next.hint).toBe('String 2 has no note at the cursor: type a fret (0–9) first.');
  });
});
