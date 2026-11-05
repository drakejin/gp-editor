import { type StringAddress, findNote } from '@gp-editor/core';
import { type BarMenuTarget, BAR_MENU_ITEMS, barMenuActions, barMenuHeading, barMenuLabel, barMenuTarget } from '../src/lib/bar-map-menu';
import { type EditorAction, type EditorState, INITIAL_EDITOR_STATE, editorReducer } from '../src/state/editor';
import { QUARTER } from '@gp-editor/core';
import { beat, makeSong, note, withTrack } from '../test-support/songs';

const WHOLE = { ...QUARTER, value: 1 } as const;
const at = (trackIndex: number, measureIndex: number): StringAddress => ({ trackIndex, measureIndex, beatIndex: 0, voiceIndex: 0, string: 2 });

/** Three bars in two tracks: track 1 (Guitar) frets 1, 2, 3; track 2 (Track 2) frets 7, 8, 9. The cursor on track 1's bar 1. */
function loaded(): EditorState {
  const base = makeSong([[beat(960, [note(1, 1)], WHOLE)], [beat(4800, [note(1, 2)], WHOLE)], [beat(8640, [note(1, 3)], WHOLE)]]);
  const song = withTrack(base, [[beat(960, [note(1, 7)], WHOLE)], [beat(4800, [note(1, 8)], WHOLE)], [beat(8640, [note(1, 9)], WHOLE)]]);
  return editorReducer(INITIAL_EDITOR_STATE, { type: 'loaded', document: { fileName: 'a.gp5', path: '/a.gp5', song } });
}

const run = (state: EditorState, actions: readonly EditorAction[]) => actions.reduce(editorReducer, state);
const frets = (state: EditorState, trackIndex: number) =>
  state.document!.song.measureHeaders.map((_, measureIndex) => findNote(state.document!.song, { trackIndex, measureIndex, beatIndex: 0, voiceIndex: 0, string: 1 })?.fret);

describe('barMenuTarget', () => {
  it('acts on the clicked bar of the clicked track, keeping the cursor’s string', () => {
    expect(barMenuTarget({ cursor: at(0, 0) }, 1, 2)).toEqual({ trackIndex: 1, firstIndex: 2, lastIndex: 2, string: 2, isSelection: false });
  });

  it('acts on the selected bars when the clicked bar is one of them, in the selection’s track', () => {
    const selection = { cursor: at(0, 1), selectionAnchor: at(0, 3) };
    expect(barMenuTarget(selection, 0, 2)).toEqual({ trackIndex: 0, firstIndex: 1, lastIndex: 3, string: 2, isSelection: true });
    expect(barMenuTarget(selection, 0, 4)).toMatchObject({ firstIndex: 4, lastIndex: 4, isSelection: false });
    expect(barMenuTarget(selection, 1, 2)).toMatchObject({ trackIndex: 1, firstIndex: 2, lastIndex: 2, isSelection: false });
  });

  it('takes the first string without a cursor', () => {
    expect(barMenuTarget({}, 0, 0).string).toBe(1);
  });
});

describe('barMenuActions', () => {
  const bar = (trackIndex: number, measureIndex: number): BarMenuTarget => ({ trackIndex, firstIndex: measureIndex, lastIndex: measureIndex, string: 2, isSelection: false });

  it('lists this track’s items, then every track’s', () => {
    expect(BAR_MENU_ITEMS).toEqual([['insertBefore', 'insertAfter', 'deleteInTrack'], ['insertInAllTracks', 'deleteInAllTracks']]);
  });

  it('inserts a bar before or after the clicked bar in its track only, the cursor on the new bar, one undo step', () => {
    // Act
    const before = run(loaded(), barMenuActions(bar(1, 1), 'insertBefore'));
    const after = run(loaded(), barMenuActions(bar(1, 1), 'insertAfter'));

    // Assert
    expect(frets(before, 1)).toEqual([7, undefined, 8, 9]);
    expect(frets(before, 0)).toEqual([1, 2, 3, undefined]);
    expect(before.cursor).toMatchObject({ trackIndex: 1, measureIndex: 1 });
    expect(frets(after, 1)).toEqual([7, 8, undefined, 9]);
    expect(after.cursor).toMatchObject({ trackIndex: 1, measureIndex: 2 });
    expect(before.past).toHaveLength(1);
    expect(after.trackIndex).toBe(1);
  });

  it('deletes the clicked bar from its track only', () => {
    const deleted = run(loaded(), barMenuActions(bar(1, 0), 'deleteInTrack'));
    expect(frets(deleted, 1)).toEqual([8, 9, undefined]);
    expect(frets(deleted, 0)).toEqual([1, 2, 3]);
    expect(deleted.past).toHaveLength(1);
  });

  it('inserts after or deletes the bar in every track', () => {
    const inserted = run(loaded(), barMenuActions(bar(1, 0), 'insertInAllTracks'));
    const deleted = run(loaded(), barMenuActions(bar(1, 0), 'deleteInAllTracks'));
    expect([frets(inserted, 0), frets(inserted, 1)]).toEqual([
      [1, undefined, 2, 3],
      [7, undefined, 8, 9],
    ]);
    expect([frets(deleted, 0), frets(deleted, 1)]).toEqual([
      [2, 3],
      [8, 9],
    ]);
  });

  it('acts on the selected bars: inserts before the first or after the last, deletes them all', () => {
    // Arrange: bars 1–2 of track 1 selected.
    const selection: BarMenuTarget = { trackIndex: 0, firstIndex: 0, lastIndex: 1, string: 2, isSelection: true };

    // Act
    const before = run(loaded(), barMenuActions(selection, 'insertBefore'));
    const after = run(loaded(), barMenuActions(selection, 'insertAfter'));
    const deleted = run(loaded(), barMenuActions(selection, 'deleteInTrack'));
    const deletedEverywhere = run(loaded(), barMenuActions(selection, 'deleteInAllTracks'));

    // Assert
    expect(frets(before, 0)).toEqual([undefined, 1, 2, 3]);
    expect(frets(after, 0)).toEqual([1, 2, undefined, 3]);
    expect(frets(deleted, 0)).toEqual([3, undefined, undefined]);
    expect(frets(deleted, 1)).toEqual([7, 8, 9]);
    expect(deleted.hint).toBe('Bars 1–2 deleted from “Guitar” only — its later bars moved 2 bars earlier; the other tracks are unchanged.');
    expect(frets(deletedEverywhere, 1)).toEqual([9]);
  });
});

describe('barMenuLabel and barMenuHeading', () => {
  const one: BarMenuTarget = { trackIndex: 0, firstIndex: 4, lastIndex: 4, string: 1, isSelection: false };
  const run3: BarMenuTarget = { ...one, firstIndex: 2, lastIndex: 4, isSelection: true };

  it('names each item, and the selected bars where it acts on them', () => {
    expect(BAR_MENU_ITEMS.flat().map((item) => barMenuLabel(item, one))).toEqual([
      'Insert Bar Before in This Track',
      'Insert Bar After in This Track',
      'Delete This Bar in This Track',
      'Insert Bar After in All Tracks',
      'Delete This Bar in All Tracks',
    ]);
    expect(barMenuLabel('deleteInTrack', run3)).toBe('Delete Bars 3–5 in This Track');
    expect(barMenuLabel('deleteInAllTracks', run3)).toBe('Delete Bars 3–5 in All Tracks');
  });

  it('heads the menu with the bar (or bars) and the track', () => {
    expect(barMenuHeading(one, 'Guitar')).toBe('Bar 5 — Guitar');
    expect(barMenuHeading(run3, 'Guitar')).toBe('Bars 3–5 — Guitar');
  });
});
