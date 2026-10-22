import { type ReactElement, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { FlatList, type LayoutChangeEvent, type ListRenderItemInfo, StyleSheet, View, type ViewToken } from 'react-native';
import type { Song, StringAddress } from '@gp-editor/core';
import { type RowLayout, layoutMeasure, layoutRows } from '../lib/layout';
import { hasDynamicChanges } from '../score/dynamics';
import { ROW, type ScoreMode, rowGeometry } from '../score/geometry';
import type { RowHit } from '../score/hit-test';
import { type PlayingBeat, rowHeaderWidth } from '../score/row';
import { tabMarkLanes } from '../score/tab';
import type { Palette } from '../theme';
import { ScoreRow } from './ScoreRow';

interface ScoreViewProps {
  readonly song: Song;
  readonly trackIndex: number;
  readonly mode: ScoreMode;
  readonly cursor?: StringAddress;
  readonly playing?: PlayingBeat;
  readonly palette: Palette;
  /** Screen points per layout point. */
  readonly zoom: number;
  /** The page's title block, above the first row. */
  readonly header?: ReactElement;
  readonly onPressBeat: (hit: RowHit) => void;
}

/** Rows rendered at once and kept around the viewport. */
const INITIAL_ROWS = 6;
const WINDOW_SIZE = 5;
/** Grey desk around the page, and the page's foot. */
const DESK_MARGIN = 22;
const PAGE_FOOT = 48;
/** Where a row scrolled into view lands (fraction of the viewport from the top). */
const SCROLL_POSITION = 0.25;

/**
 * The score as one page on Guitar Pro's grey desk: the title block, then the rows of the shown track, zoomed. The
 * playing row, and the cursor's row when it leaves the view (a bar picked in the bar map), are scrolled into view.
 */
export function ScoreView({ song, trackIndex, mode, cursor, playing, palette, zoom, header, onPressBeat }: ScoreViewProps) {
  const [width, setWidth] = useState(0);
  const [headerHeight, setHeaderHeight] = useState(0);
  const listRef = useRef<FlatList<RowLayout>>(null);
  const track = song.tracks[trackIndex];
  const stringCount = track?.strings.length ?? 6;
  const headerWidth = useMemo(() => (track === undefined ? 0 : rowHeaderWidth(mode, track)), [mode, track]);
  // Lanes and the dynamics band for the whole track, so all rows keep one height (the list uses fixed row heights).
  const markLanes = useMemo(() => tabMarkLanes(track?.measures ?? []), [track?.measures]);
  const hasDynamics = useMemo(() => hasDynamicChanges(track?.measures ?? []), [track?.measures]);
  const geometry = useMemo(
    () => rowGeometry(mode, stringCount, markLanes.length, hasDynamics),
    [mode, stringCount, markLanes.length, hasDynamics],
  );
  const measures = useMemo(() => song.measureHeaders.map((_, i) => layoutMeasure(song, trackIndex, i)), [song, trackIndex]);
  const pageWidth = Math.max(0, width - DESK_MARGIN * 2);
  // Rows are laid out in unzoomed points: a zoomed page holds fewer bars per line, as in Guitar Pro.
  const rowWidth = Math.max(0, (pageWidth - ROW.sidePadding * 2) / zoom);
  const rows = useMemo(() => (rowWidth > 0 ? layoutRows(measures, rowWidth - headerWidth) : []), [measures, rowWidth, headerWidth]);
  const rowHeight = geometry.height * zoom;
  const onLayout = useCallback((event: LayoutChangeEvent) => setWidth(event.nativeEvent.layout.width), []);

  const rowOf = (measureIndex: number | undefined) =>
    measureIndex === undefined ? -1 : rows.findIndex((row) => row.measures.some((m) => m.measureIndex === measureIndex));
  const playingRow = rowOf(playing?.measureIndex);
  const cursorRow = rowOf(cursor?.measureIndex);
  const visibleRows = useRef<ReadonlySet<number>>(new Set());
  const onViewableItemsChanged = useRef(({ viewableItems }: { viewableItems: ViewToken[] }) => {
    visibleRows.current = new Set(viewableItems.flatMap((item) => (item.index === null ? [] : [item.index])));
  }).current;
  // Not animated: react-native-macos's animated scrolls do not move the list.
  useEffect(() => {
    if (playingRow >= 0) {
      listRef.current?.scrollToIndex({ index: playingRow, viewPosition: SCROLL_POSITION, animated: false });
    }
  }, [playingRow]);
  useEffect(() => {
    if (cursorRow >= 0 && playingRow < 0 && !visibleRows.current.has(cursorRow)) {
      listRef.current?.scrollToIndex({ index: cursorRow, viewPosition: SCROLL_POSITION, animated: false });
    }
  }, [cursorRow, playingRow]);

  const renderRow = useCallback(
    ({ item }: ListRenderItemInfo<RowLayout>) => {
      const inRow = (measureIndex: number | undefined) => item.measures.some((m) => m.measureIndex === measureIndex);
      return (
        <View style={[styles.pageRow, { backgroundColor: palette.paper }]}>
          <ScoreRow
            song={song}
            trackIndex={trackIndex}
            row={item}
            width={rowWidth}
            headerWidth={headerWidth}
            mode={mode}
            geometry={geometry}
            palette={palette}
            cursor={inRow(cursor?.measureIndex) ? cursor : undefined}
            playing={inRow(playing?.measureIndex) ? playing : undefined}
            markLanes={markLanes}
            zoom={zoom}
            onPress={onPressBeat}
          />
        </View>
      );
    },
    [song, trackIndex, rowWidth, headerWidth, mode, geometry, palette, cursor, playing, markLanes, zoom, onPressBeat],
  );

  return (
    <View style={[styles.desk, { backgroundColor: palette.desk }]} onLayout={onLayout}>
      <FlatList
        ref={listRef}
        data={rows}
        renderItem={renderRow}
        keyExtractor={(row) => String(row.measures[0]?.measureIndex ?? 0)}
        getItemLayout={(_, index) => ({ length: rowHeight, offset: headerHeight + rowHeight * index, index })}
        extraData={renderRow}
        ListHeaderComponent={
          <View style={[styles.pageRow, styles.pageTop, { backgroundColor: palette.paper }]} onLayout={(event) => setHeaderHeight(event.nativeEvent.layout.height)}>
            {header}
          </View>
        }
        ListFooterComponent={<View style={[styles.pageRow, styles.pageFoot, { backgroundColor: palette.paper }]} />}
        contentContainerStyle={styles.content}
        initialNumToRender={INITIAL_ROWS}
        windowSize={WINDOW_SIZE}
        onViewableItemsChanged={onViewableItemsChanged}
        onScrollToIndexFailed={() => undefined}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  desk: { flex: 1 },
  content: { paddingHorizontal: DESK_MARGIN, paddingVertical: DESK_MARGIN },
  pageRow: { paddingHorizontal: ROW.sidePadding },
  pageTop: { borderTopLeftRadius: 2, borderTopRightRadius: 2 },
  pageFoot: { height: PAGE_FOOT, borderBottomLeftRadius: 2, borderBottomRightRadius: 2 },
});
