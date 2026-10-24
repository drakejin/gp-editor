import { type RefObject, useEffect, useRef } from 'react';
import type { FlatList, ViewToken } from 'react-native';
import type { StringAddress } from '@gp-editor/core';
import { isLineOnFirstScreen } from '../lib/score-scroll';
import type { PlayingBeat } from '../score/row';
import type { ScoreLayout } from '../score/score-layout';

/** A line of the page: one track's staves in one system (a row of the score in the single-track view). */
export interface ScoreLine {
  readonly systemIndex: number;
  readonly staffIndex: number;
}

/** Where a row scrolled into view lands (fraction of the viewport from the top). */
const SCROLL_POSITION = 0.25;

/** The list's line at `index`: systems one after the other, each its staves in order. */
export function lineAt(layout: ScoreLayout, index: number): ScoreLine {
  const staffCount = Math.max(1, layout.staves.length);
  return { systemIndex: Math.floor(index / staffCount), staffIndex: index % staffCount };
}

/** A line's top under the title block, and its height, in layout points. */
export function linePlace(layout: ScoreLayout, line: ScoreLine): { readonly top: number; readonly height: number } {
  const staff = layout.staves[line.staffIndex];
  return { top: line.systemIndex * layout.systemHeight + (staff?.top ?? 0), height: staff?.height ?? 0 };
}

/** The line of the system holding a bar, on a track's staves (the first staves when it is not shown); -1 for none. */
export function lineOf(layout: ScoreLayout, measureIndex: number | undefined, trackIndex?: number): number {
  const systemIndex = measureIndex === undefined ? -1 : layout.systems.findIndex((system) => system.rows[0]?.measures.some((m) => m.measureIndex === measureIndex));
  const staffIndex = Math.max(0, layout.staves.findIndex((staff) => staff.trackIndex === trackIndex));
  return systemIndex < 0 ? -1 : systemIndex * layout.staves.length + staffIndex;
}

interface ScrollSources {
  readonly layout: ScoreLayout;
  readonly zoom: number;
  /** The title block's and the view's heights, in screen points. */
  readonly headerHeight: number;
  readonly viewportHeight: number;
  /** Desk above the page. */
  readonly topMargin: number;
  readonly cursor?: StringAddress;
  readonly playing?: PlayingBeat;
}

/**
 * Keeps the playing system (its first staves), and the cursor's line when it leaves the view (a bar picked in the bar
 * map), in view; returns the list's onViewableItemsChanged, which says what it shows.
 */
export function useScoreScroll(listRef: RefObject<FlatList<ScoreLine> | null>, sources: ScrollSources): (info: { viewableItems: ViewToken[] }) => void {
  const { layout, cursor, playing } = sources;
  // Read by the cursor's scroll below without making it run again on every layout change.
  const latest = useRef(sources);
  latest.current = sources;
  const playingLine = lineOf(layout, playing?.measureIndex);
  const cursorLine = lineOf(layout, cursor?.measureIndex, cursor?.trackIndex);
  const visibleLines = useRef<ReadonlySet<number>>(new Set());
  const onViewableItemsChanged = useRef(({ viewableItems }: { viewableItems: ViewToken[] }) => {
    visibleLines.current = new Set(viewableItems.flatMap((item) => (item.index === null ? [] : [item.index])));
  }).current;
  // Not animated: react-native-macos's animated scrolls do not move the list.
  useEffect(() => {
    if (playingLine >= 0) {
      listRef.current?.scrollToIndex({ index: playingLine, viewPosition: SCROLL_POSITION, animated: false });
    }
  }, [playingLine, listRef]);
  useEffect(() => {
    if (cursorLine < 0 || playingLine >= 0) {
      return;
    }
    // Until the list says which lines it shows, the page is at the top (a file just opened, another tab).
    const { layout: shown, zoom, headerHeight, viewportHeight, topMargin } = latest.current;
    const place = linePlace(shown, lineAt(shown, cursorLine));
    const page = { headerHeight, rowHeight: shown.systemHeight * zoom, topMargin, viewportHeight };
    const isInView = visibleLines.current.size > 0 ? visibleLines.current.has(cursorLine) : isLineOnFirstScreen({ top: place.top * zoom, height: place.height * zoom }, page);
    if (!isInView) {
      listRef.current?.scrollToIndex({ index: cursorLine, viewPosition: SCROLL_POSITION, animated: false });
    }
  }, [cursorLine, playingLine, listRef]);
  return onViewableItemsChanged;
}
