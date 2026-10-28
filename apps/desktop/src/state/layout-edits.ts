import { type Song, type Stylesheet, clearBarDesign, setBarWidthScale, setBeatOffset, setStylesheet, setSystemBars } from '@gp-editor/core';
import { isOfTypes } from '../lib/type-guards';

/** Edits of the score's look (File ▸ Stylesheet…, Design Mode); each is one undo step. */
export type LayoutAction =
  /** The whole stylesheet: the dialog sends it with one value changed. */
  | { readonly type: 'setStylesheet'; readonly stylesheet: Stylesheet }
  /** A beat dragged sideways: the beats starting `at` ticks into the bar drawn `offset` points away. */
  | { readonly type: 'setBeatOffset'; readonly measureIndex: number; readonly at: number; readonly offset: number }
  /** A bar line dragged: the bar's width against its natural width. */
  | { readonly type: 'setBarWidthScale'; readonly measureIndex: number; readonly widthScale: number }
  /** A system's + / −: the system starting at the bar holds `bars` bars; the system starts it swallows go. */
  | { readonly type: 'setSystemSize'; readonly measureIndex: number; readonly bars: number }
  /** A system starts at the bar (as many bars as fit), or no longer does. */
  | { readonly type: 'toggleSystemStart'; readonly measureIndex: number }
  /** Back to the natural layout: the bars named (a system's ×), or every bar (View ▸ Reset Positions). */
  | { readonly type: 'resetPositions'; readonly measureIndexes?: readonly number[] };

/** The system starting at `measureIndex` holds `bars` bars: a system start of a bar it now holds is taken away. */
function setSystemSize(song: Song, measureIndex: number, bars: number): Song {
  const count = Math.max(1, Math.min(bars, song.measureHeaders.length - measureIndex));
  const swallowed = song.measureHeaders.slice(measureIndex + 1, measureIndex + count).flatMap((header, i) => (header.design?.systemBars === undefined ? [] : [measureIndex + 1 + i]));
  const freed = swallowed.reduce((current, index) => setSystemBars(current, index, undefined), song);
  return setSystemBars(freed, measureIndex, count);
}

/** The song after a layout action; the same song when it changes nothing. */
export function applyLayoutAction(song: Song, action: LayoutAction): Song {
  switch (action.type) {
    case 'setStylesheet':
      return setStylesheet(song, action.stylesheet);
    case 'setBeatOffset':
      return setBeatOffset(song, action.measureIndex, action.at, action.offset);
    case 'setBarWidthScale':
      return setBarWidthScale(song, action.measureIndex, action.widthScale);
    case 'setSystemSize':
      return setSystemSize(song, action.measureIndex, action.bars);
    case 'toggleSystemStart':
      return setSystemBars(song, action.measureIndex, song.measureHeaders[action.measureIndex]?.design?.systemBars === undefined ? 0 : undefined);
    case 'resetPositions':
      return clearBarDesign(song, action.measureIndexes);
  }
}

/** The layout actions, to route them in the editor's reducer. */
export const isLayoutAction = isOfTypes<LayoutAction>({ setStylesheet: true, setBeatOffset: true, setBarWidthScale: true, setSystemSize: true, toggleSystemStart: true, resetPositions: true });
