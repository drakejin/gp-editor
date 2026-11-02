import { type RefObject, useEffect, useRef } from 'react';
import type { FlatList } from 'react-native';
import type { StringAddress } from '@gp-editor/core';
import { isLineInView, isLineOnFirstScreen, scrollPosition } from '../lib/score-scroll';
import type { PlayingBeat } from '../score/row';
import type { ScoreLayout } from '../score/score-layout';

/** A line of the page: one track's staves in one system (a row of the score in the single-track view). */
export interface ScoreLine {
  readonly systemIndex: number;
  readonly staffIndex: number;
}

/** The list's line at `index`: systems one after the other, each its staves in order. */
export function lineAt(layout: ScoreLayout, index: number): ScoreLine {
  const staffCount = Math.max(1, layout.staves.length);
  return { systemIndex: Math.floor(index / staffCount), staffIndex: index % staffCount };
}

/** A line's top under the title block, and its height, in layout points: its system's staff (each system its own height). */
export function linePlace(layout: ScoreLayout, line: ScoreLine): { readonly top: number; readonly height: number } {
  const system = layout.systems[line.systemIndex];
  const staff = system?.staves[line.staffIndex];
  return { top: (system?.top ?? 0) + (staff?.top ?? 0), height: staff?.height ?? 0 };
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

/** The list's scroll event, as much of it as the score reads. */
export interface ScoreScrollEvent {
  readonly nativeEvent: { readonly contentOffset: { readonly y: number } };
}

export interface ScoreScroll {
  /** The list's onScroll: where the page is scrolled to. */
  readonly onScroll: (event: ScoreScrollEvent) => void;
}

/** A line's place and height on screen (zoomed). */
function shownPlace(sources: ScrollSources, line: number): { readonly top: number; readonly height: number } {
  const place = linePlace(sources.layout, lineAt(sources.layout, line));
  return { top: place.top * sources.zoom, height: place.height * sources.zoom };
}

/**
 * True when the line shows: as much of it as the view holds (isLineInView). The first look at a page just shown (a
 * file opened, another tab), at its top, is kinder: a line starting on the first screen stays put, title block and all.
 */
function isLineShown(sources: ScrollSources, line: number, scrollTop: number, isFirstLook: boolean): boolean {
  const { headerHeight, viewportHeight, topMargin } = sources;
  const place = shownPlace(sources, line);
  return isFirstLook
    ? isLineOnFirstScreen(place, { headerHeight, rowHeight: place.height, topMargin, viewportHeight })
    : isLineInView(place, { headerHeight, topMargin, viewportHeight }, scrollTop);
}

/** Scrolls the list to a line: a quarter down the view, a line taller than the view at its top. Not animated: react-native-macos's animated scrolls do not move the list. */
function scrollToLine(listRef: RefObject<FlatList<ScoreLine> | null>, sources: ScrollSources, line: number): void {
  const viewPosition = scrollPosition(shownPlace(sources, line).height, sources.viewportHeight);
  listRef.current?.scrollToIndex({ index: line, viewPosition, animated: false });
}

/**
 * Keeps the playing system (its first staves), and the cursor's line when any of it leaves the view (the next system,
 * the one before, a bar picked in the bar map), in view; returns the list's onScroll, which says where the page is.
 */
export function useScoreScroll(listRef: RefObject<FlatList<ScoreLine> | null>, sources: ScrollSources): ScoreScroll {
  const { layout, cursor, playing } = sources;
  // Read by the scrolls below without making them run again on every layout change.
  const latest = useRef(sources);
  latest.current = sources;
  const playingLine = lineOf(layout, playing?.measureIndex);
  const cursorLine = lineOf(layout, cursor?.measureIndex, cursor?.trackIndex);
  const scrollTop = useRef(0);
  const isFirstLook = useRef(true);
  const onScroll = useRef((event: ScoreScrollEvent) => {
    scrollTop.current = event.nativeEvent.contentOffset.y;
  }).current;
  useEffect(() => {
    if (playingLine >= 0) {
      scrollToLine(listRef, latest.current, playingLine);
    }
  }, [playingLine, listRef]);
  useEffect(() => {
    if (cursorLine < 0 || playingLine >= 0) {
      return;
    }
    const isShown = isLineShown(latest.current, cursorLine, scrollTop.current, isFirstLook.current);
    isFirstLook.current = false;
    if (!isShown) {
      scrollToLine(listRef, latest.current, cursorLine);
    }
  }, [cursorLine, playingLine, listRef]);
  return { onScroll };
}
