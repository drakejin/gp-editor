import type { StringAddress } from '@gp-editor/core';
import type { EditorAction } from '../state/editor';
import type { BeatPlace } from '../state/mark-edits';
import type { SongEdit } from '../state/song-edits';
import { t } from './i18n/i18n';

// The tracks panel's bar map: a right-click (or ⌃-click) on a track's bar opens a small menu to insert or delete a bar in
// that track only, or in every track (Guitar Pro 8 has no such menu: its bars belong to every track).

/** What the menu acts on: one track's bars — the clicked one, or the selected bars around it. */
export interface BarMenuTarget {
  readonly trackIndex: number;
  readonly firstIndex: number;
  readonly lastIndex: number;
  /** The cursor's string, kept as the cursor goes to the bar. */
  readonly string: number;
  /** The selection held the clicked bar: the menu acts on its bars, and the selection stays while the menu is open. */
  readonly isSelection: boolean;
}

export type BarMenuItem = 'insertBefore' | 'insertAfter' | 'deleteInTrack' | 'insertInAllTracks' | 'deleteInAllTracks';

/** The menu's items in order: this track's, then every track's (a separator between). */
export const BAR_MENU_ITEMS: readonly (readonly BarMenuItem[])[] = [
  ['insertBefore', 'insertAfter', 'deleteInTrack'],
  ['insertInAllTracks', 'deleteInAllTracks'],
];

/** The cursor and the selection's start, as the editor holds them. */
interface CursorAndSelection {
  readonly cursor?: StringAddress;
  readonly selectionAnchor?: StringAddress;
}

/** The menu's target for a click on a track's bar: the selected bars when they hold it (in their track), else the bar. */
export function barMenuTarget({ cursor, selectionAnchor }: CursorAndSelection, trackIndex: number, measureIndex: number): BarMenuTarget {
  const string = cursor?.string ?? 1;
  if (cursor !== undefined && selectionAnchor !== undefined && cursor.trackIndex === trackIndex) {
    const firstIndex = Math.min(cursor.measureIndex, selectionAnchor.measureIndex);
    const lastIndex = Math.max(cursor.measureIndex, selectionAnchor.measureIndex);
    if (measureIndex >= firstIndex && measureIndex <= lastIndex) {
      return { trackIndex, firstIndex, lastIndex, string, isSelection: true };
    }
  }
  return { trackIndex, firstIndex: measureIndex, lastIndex: measureIndex, string, isSelection: false };
}

/** The cursor on a bar's first beat in the target's track (voice 1, as a click on the bar map puts it). */
export function barMenuCursor(target: BarMenuTarget, measureIndex: number): StringAddress {
  return { trackIndex: target.trackIndex, measureIndex, beatIndex: 0, voiceIndex: 0, string: target.string };
}

/** Where the edit is made (the bar the cursor goes to) and the edit; a range's deletes start at its first bar. */
function itemEdit(target: BarMenuTarget, item: BarMenuItem): { readonly measureIndex: number; readonly edit: SongEdit } {
  const { firstIndex, lastIndex } = target;
  const from: { readonly from?: BeatPlace } = firstIndex === lastIndex ? {} : { from: { measureIndex: firstIndex, beatIndex: 0 } };
  switch (item) {
    case 'insertBefore':
      return { measureIndex: firstIndex, edit: { type: 'insertTrackMeasure' } };
    case 'insertAfter':
      return { measureIndex: lastIndex, edit: { type: 'insertTrackMeasure', position: 'after' } };
    case 'deleteInTrack':
      return { measureIndex: lastIndex, edit: { type: 'deleteTrackMeasure', ...from } };
    case 'insertInAllTracks':
      return { measureIndex: lastIndex, edit: { type: 'insertMeasure' } };
    case 'deleteInAllTracks':
      return { measureIndex: lastIndex, edit: { type: 'deleteMeasure', ...from } };
  }
}

/** What an item runs: the cursor to the bar it acts at (which ends the selection), then its edit — one undo step. */
export function barMenuActions(target: BarMenuTarget, item: BarMenuItem): readonly EditorAction[] {
  const { measureIndex, edit } = itemEdit(target, item);
  return [
    { type: 'placeCursor', cursor: barMenuCursor(target, measureIndex) },
    { type: 'edit', edit },
  ];
}

/** An item's words; the deletes name the selected bars they act on. */
export function barMenuLabel(item: BarMenuItem, target: BarMenuTarget): string {
  const bars = { first: target.firstIndex + 1, last: target.lastIndex + 1 };
  const isRange = target.firstIndex !== target.lastIndex;
  switch (item) {
    case 'insertBefore':
      return t('window.barMenu.insertBefore');
    case 'insertAfter':
      return t('window.barMenu.insertAfter');
    case 'deleteInTrack':
      return isRange ? t('window.barMenu.deleteBarsInTrack', bars) : t('window.barMenu.deleteInTrack');
    case 'insertInAllTracks':
      return t('window.barMenu.insertInAllTracks');
    case 'deleteInAllTracks':
      return isRange ? t('window.barMenu.deleteBarsInAllTracks', bars) : t('window.barMenu.deleteInAllTracks');
  }
}

/** The menu's first line: the bar (or the selected bars) and the track. */
export function barMenuHeading(target: BarMenuTarget, trackName: string): string {
  return target.firstIndex === target.lastIndex
    ? t('window.barMenu.heading', { number: target.firstIndex + 1, track: trackName })
    : t('window.barMenu.headingBars', { first: target.firstIndex + 1, last: target.lastIndex + 1, track: trackName });
}
