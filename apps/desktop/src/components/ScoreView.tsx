import { type ReactElement, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { FlatList, type LayoutChangeEvent, type ListRenderItemInfo, StyleSheet, View, type ViewToken } from 'react-native';
import type { Song, StringAddress } from '@gp-editor/core';
import { useDragSelection } from '../hooks/use-drag-selection';
import { useScoreLayout } from '../hooks/use-score-layout';
import { type PageTop, isLineOnFirstScreen } from '../lib/score-scroll';
import { type ChordDisplay, DEFAULT_CHORD_DISPLAY } from '../score/chords';
import { ROW } from '../score/geometry';
import type { RowHit } from '../score/hit-test';
import type { PlayingBeat } from '../score/row';
import type { ScoreLayout, StaffSpec } from '../score/score-layout';
import { type BeatRange, clipRange } from '../score/selection-tint';
import { staffDecor } from '../score/system-staff';
import type { Palette } from '../theme';
import { ScoreRow } from './ScoreRow';

interface ScoreViewProps {
  readonly song: Song;
  /** The selected track: the cursor's and the selection's. */
  readonly trackIndex: number;
  /** The staves shown, one per shown track in track order (the selected track's alone in the single-track view). */
  readonly staves: readonly StaffSpec[];
  /** What the score shows of its chords (names, diagrams); both by default. */
  readonly chordDisplay?: ChordDisplay;
  readonly cursor?: StringAddress;
  /** The selected track's playing beat. */
  readonly playing?: PlayingBeat;
  /** The playing beat of each shown track, by track index (the multitrack view). */
  readonly playingTracks?: Readonly<Record<number, PlayingBeat | undefined>>;
  /** Selected beats of the selected track (selectionRange), tinted; keep it the same object while it does not change. */
  readonly selection?: BeatRange;
  readonly palette: Palette;
  /** Screen points per layout point. */
  readonly zoom: number;
  /** The page's title block, above the first row. */
  readonly header?: ReactElement;
  /** The mouse went down on a beat (`isExtending`: with shift); the hit names the staff's track. */
  readonly onPressBeat: (hit: RowHit, isExtending: boolean) => void;
  /** A drag reached another beat. */
  readonly onDragBeat: (hit: RowHit) => void;
}

/** A line of the page: one track's staves in one system (a row of the score in the single-track view). */
interface ScoreLine {
  readonly systemIndex: number;
  readonly staffIndex: number;
}

/** Rows rendered at once and kept around the viewport. */
const INITIAL_ROWS = 6;
const WINDOW_SIZE = 5;
/** Grey desk around the page, and the page's foot. */
const DESK_MARGIN = 22;
const PAGE_FOOT = 48;
/** Where a row scrolled into view lands (fraction of the viewport from the top). */
const SCROLL_POSITION = 0.25;

/** A line's top under the title block, and its height, in layout points. */
function linePlace(layout: ScoreLayout, line: ScoreLine): { readonly top: number; readonly height: number } {
  const staff = layout.staves[line.staffIndex];
  return { top: line.systemIndex * layout.systemHeight + (staff?.top ?? 0), height: staff?.height ?? 0 };
}

/** The line of the system holding a bar, on a track's staves (the first staves when it is not shown); -1 for none. */
function lineOf(layout: ScoreLayout, measureIndex: number | undefined, trackIndex?: number): number {
  const systemIndex = measureIndex === undefined ? -1 : layout.systems.findIndex((system) => system.rows[0]?.measures.some((m) => m.measureIndex === measureIndex));
  const staffIndex = Math.max(0, layout.staves.findIndex((staff) => staff.trackIndex === trackIndex));
  return systemIndex < 0 ? -1 : systemIndex * layout.staves.length + staffIndex;
}

/**
 * The score as one page on Guitar Pro's grey desk: the title block, then the systems — a staff group per shown track,
 * each its own canvas, virtualised —, zoomed. The playing system, and the cursor's line when it leaves the view (a bar
 * picked in the bar map), are scrolled into view.
 */
export function ScoreView(props: ScoreViewProps) {
  const { song, trackIndex, staves, chordDisplay = DEFAULT_CHORD_DISPLAY, cursor, playing, playingTracks, selection, palette, zoom, header } = props;
  const [width, setWidth] = useState(0);
  const [height, setHeight] = useState(0);
  const [headerHeight, setHeaderHeight] = useState(0);
  const listRef = useRef<FlatList<ScoreLine>>(null);
  const pageWidth = Math.max(0, width - DESK_MARGIN * 2);
  // Rows are laid out in unzoomed points: a zoomed page holds fewer bars per line, as in Guitar Pro.
  const rowWidth = Math.max(0, (pageWidth - ROW.sidePadding * 2) / zoom);
  const layout = useScoreLayout(song, staves, chordDisplay, rowWidth);
  const lines = useMemo(
    () => layout.systems.flatMap((_, systemIndex) => layout.staves.map((__, staffIndex): ScoreLine => ({ systemIndex, staffIndex }))),
    [layout],
  );
  const { onPressRow, onDragRow } = useDragSelection({ song, layout, onPressBeat: props.onPressBeat, onDragBeat: props.onDragBeat });
  const onLayout = useCallback((event: LayoutChangeEvent) => {
    setWidth(event.nativeEvent.layout.width);
    setHeight(event.nativeEvent.layout.height);
  }, []);
  // Read by the cursor's scroll below without making it run again on every layout change.
  const page: PageTop = { headerHeight, rowHeight: layout.systemHeight * zoom, topMargin: DESK_MARGIN, viewportHeight: height };
  const pageTop = useRef({ page, layout, zoom });
  pageTop.current = { page, layout, zoom };

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
  }, [playingLine]);
  useEffect(() => {
    // Until the list says which lines it shows, the page is at the top (a file just opened, another tab).
    const { page: current, layout: shown, zoom: scale } = pageTop.current;
    const place = linePlace(shown, { systemIndex: Math.floor(cursorLine / Math.max(1, shown.staves.length)), staffIndex: cursorLine % Math.max(1, shown.staves.length) });
    const isInView = visibleLines.current.size > 0 ? visibleLines.current.has(cursorLine) : isLineOnFirstScreen({ top: place.top * scale, height: place.height * scale }, current);
    if (cursorLine >= 0 && playingLine < 0 && !isInView) {
      listRef.current?.scrollToIndex({ index: cursorLine, viewPosition: SCROLL_POSITION, animated: false });
    }
  }, [cursorLine, playingLine]);

  const renderLine = useCallback(
    ({ item }: ListRenderItemInfo<ScoreLine>) => {
      const staff = layout.staves[item.staffIndex];
      const row = layout.systems[item.systemIndex]?.rows[item.staffIndex];
      if (staff === undefined || row === undefined) {
        return null;
      }
      const inRow = (measureIndex: number | undefined) => row.measures.some((m) => m.measureIndex === measureIndex);
      const isSelectedTrack = staff.trackIndex === trackIndex;
      const playingBeat = isSelectedTrack ? playing : playingTracks?.[staff.trackIndex];
      const firstBar = row.measures[0]?.measureIndex ?? 0;
      const lastBar = row.measures[row.measures.length - 1]?.measureIndex ?? 0;
      return (
        <View style={[styles.pageRow, { backgroundColor: palette.paper }]}>
          <ScoreRow
            song={song}
            trackIndex={staff.trackIndex}
            row={row}
            width={rowWidth}
            headerWidth={layout.clefWidth}
            mode={staff.mode}
            geometry={staff.geometry}
            palette={palette}
            cursor={cursor?.trackIndex === staff.trackIndex && inRow(cursor.measureIndex) ? cursor : undefined}
            playing={inRow(playingBeat?.measureIndex) ? playingBeat : undefined}
            selection={isSelectedTrack ? clipRange(selection, firstBar, lastBar) : undefined}
            markLanes={staff.markLanes}
            hasHeading={staff.hasHeading}
            decor={staffDecor(song, layout, item.systemIndex, item.staffIndex)}
            zoom={zoom}
            rowIndex={item.systemIndex}
            onPress={onPressRow}
            onDrag={onDragRow}
          />
        </View>
      );
    },
    [song, trackIndex, layout, rowWidth, palette, cursor, playing, playingTracks, selection, zoom, onPressRow, onDragRow],
  );

  return (
    <View style={[styles.desk, { backgroundColor: palette.desk }]} onLayout={onLayout}>
      <FlatList
        ref={listRef}
        data={lines}
        renderItem={renderLine}
        keyExtractor={(line) => {
          const firstBar = String(layout.systems[line.systemIndex]?.rows[0]?.measures[0]?.measureIndex ?? 0);
          return layout.staves.length === 1 ? firstBar : `${firstBar}:${layout.staves[line.staffIndex]?.trackIndex ?? 0}`;
        }}
        getItemLayout={(_, index) => {
          const line = { systemIndex: Math.floor(index / Math.max(1, layout.staves.length)), staffIndex: index % Math.max(1, layout.staves.length) };
          const place = linePlace(layout, line);
          return { length: place.height * zoom, offset: headerHeight + place.top * zoom, index };
        }}
        extraData={renderLine}
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
