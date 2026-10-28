import { type ReactElement, type RefObject, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { FlatList, type LayoutChangeEvent, type ListRenderItemInfo, StyleSheet, View } from 'react-native';
import { type Song, type StringAddress, stylesheetOf } from '@gp-editor/core';
import { useDesignDrag } from '../hooks/use-design-drag';
import type { DesignGuide } from '../lib/design-drag';
import { type ScoreFit, fitScoreZoom, printArea } from '../lib/score-fit';
import type { ScoreZoom } from '../lib/score-zoom';
import { useDragSelection } from '../hooks/use-drag-selection';
import { useScoreLayout } from '../hooks/use-score-layout';
import { type ScoreLine, lineAt, linePlace, useScoreScroll } from '../hooks/use-score-scroll';
import { type ChordDisplay, DEFAULT_CHORD_DISPLAY } from '../score/chords';
import { ROW } from '../score/geometry';
import type { DesignHandle } from '../score/design-handles';
import type { RowHit } from '../score/hit-test';
import type { RowLayout } from '../lib/layout';
import type { PlayingBeat } from '../score/row';
import type { ScoreLayout, ScoreStaff, StaffSpec } from '../score/score-layout';
import { type BeatRange, clipRange } from '../score/selection-tint';
import { staffDecor } from '../score/system-staff';
import { editedVoiceOf } from '../score/voices';
import type { LayoutAction } from '../state/layout-edits';
import type { Palette } from '../theme';
import { type RowDesign, ScoreRow, type ScoreRowProps } from './ScoreRow';
import { SystemDesignButtons } from './SystemDesignButtons';

interface ScoreViewProps {
  readonly song: Song;
  /** The selected track: the cursor's and the selection's. */
  readonly trackIndex: number;
  /** The staves shown, one per shown track in track order (the selected track's alone in the single-track view). */
  readonly staves: readonly StaffSpec[];
  /** What the score shows of its chords (names, diagrams); both by default. */
  readonly chordDisplay?: ChordDisplay;
  readonly cursor?: StringAddress;
  /** Multivoice edition: no voice faded (else every voice but the cursor's). */
  readonly isMultivoice?: boolean;
  /** The selected track's playing beat. */
  readonly playing?: PlayingBeat;
  /** The playing beat of each shown track, by track index (the multitrack view). */
  readonly playingTracks?: Readonly<Record<number, PlayingBeat | undefined>>;
  /** Selected beats of the selected track (selectionRange), tinted; keep it the same object while it does not change. */
  readonly selection?: BeatRange;
  readonly palette: Palette;
  /** Screen points per layout point (the stylesheet's scale multiplies it), or a fit to the stylesheet's printed page. */
  readonly zoom: ScoreZoom;
  /** The zoom a fit comes to in the view, each time it changes (the top bar shows it, ⌘- / ⌘= step from it). */
  readonly onShownZoom?: (zoom: number) => void;
  /** The page's title block, above the first row. */
  readonly header?: ReactElement;
  /** The mouse went down on a beat (`isExtending`: with shift); the hit names the staff's track. */
  readonly onPressBeat: (hit: RowHit, isExtending: boolean) => void;
  /** A drag reached another beat. */
  readonly onDragBeat: (hit: RowHit) => void;
  /** A right-click or ⌃-click on a beat: its annotation (keep the same function: the rows compare it). */
  readonly onContextBeat?: (hit: RowHit) => void;
  /** Design Mode: handles to drag beats, bar lines and spaces, and each system's + − × (View ▸ Design Mode). */
  readonly isDesignMode?: boolean;
  /** A Design Mode drag or button: one undo step. */
  readonly onLayoutEdit?: (action: LayoutAction) => void;
}

/** A canvas's place in its system for Design Mode, with the guideline when the drag snapped in its system. */
function rowDesign(item: ScoreLine, staffCount: number, guide: DesignGuide | undefined): RowDesign {
  const guideX = guide?.systemIndexes.includes(item.systemIndex) === true ? guide.x : undefined;
  return { isTop: item.staffIndex === 0, isLast: item.staffIndex === staffCount - 1, guideX };
}

/** Rows rendered at once and kept around the viewport. */
const INITIAL_ROWS = 6;
const WINDOW_SIZE = 5;
/** Grey desk around the page, and the page's foot. */
const DESK_MARGIN = 22;
const PAGE_FOOT = 48;

/** What every line of the page is drawn with: the layout, the cursor, playback, the selection, Design Mode and the handlers. */
interface LineView extends Pick<ScoreViewProps, 'trackIndex' | 'cursor' | 'isMultivoice' | 'playing' | 'playingTracks' | 'selection' | 'palette'> {
  readonly song: Song;
  readonly layout: ScoreLayout;
  readonly rowWidth: number;
  readonly zoom: number;
  readonly onPressRow: ScoreRowProps['onPress'];
  readonly onDragRow: ScoreRowProps['onDrag'];
  readonly onContextBeat?: ScoreRowProps['onContextBeat'];
  readonly isDesignMode: boolean;
  readonly guide?: DesignGuide;
  readonly onDesignEdit: (action: LayoutAction) => void;
  readonly onDesignPress: NonNullable<ScoreRowProps['onDesignPress']>;
  readonly onDesignMove: NonNullable<ScoreRowProps['onDesignMove']>;
  readonly onDesignRelease: NonNullable<ScoreRowProps['onDesignRelease']>;
}

/** The canvas of one staff of one system: what it draws of the cursor, playback and selection, and its Design Mode place. */
function lineRowProps(item: ScoreLine, staff: ScoreStaff, row: RowLayout, view: LineView): ScoreRowProps {
  const { song, layout, cursor } = view;
  const inRow = (measureIndex: number | undefined) => row.measures.some((m) => m.measureIndex === measureIndex);
  const isSelectedTrack = staff.trackIndex === view.trackIndex;
  const playingBeat = isSelectedTrack ? view.playing : view.playingTracks?.[staff.trackIndex];
  const firstBar = row.measures[0]?.measureIndex ?? 0;
  const lastBar = row.measures[row.measures.length - 1]?.measureIndex ?? 0;
  return {
    song, trackIndex: staff.trackIndex, row, width: view.rowWidth, headerWidth: layout.clefWidth, mode: staff.mode, geometry: staff.geometry,
    height: staff.height, palette: view.palette,
    cursor: cursor?.trackIndex === staff.trackIndex && inRow(cursor.measureIndex) ? cursor : undefined,
    playing: inRow(playingBeat?.measureIndex) ? playingBeat : undefined,
    selection: isSelectedTrack ? clipRange(view.selection, firstBar, lastBar) : undefined,
    markLanes: staff.markLanes, hasHeading: staff.hasHeading, decor: staffDecor(song, layout, item.systemIndex, item.staffIndex),
    editedVoiceIndex: editedVoiceOf(cursor, staff.trackIndex, view.isMultivoice), zoom: view.zoom, rowIndex: item.systemIndex,
    onPress: view.onPressRow, onDrag: view.onDragRow, onContextBeat: view.onContextBeat,
    design: view.isDesignMode ? rowDesign(item, layout.staves.length, view.guide) : undefined,
    onDesignPress: view.onDesignPress, onDesignMove: view.onDesignMove, onDesignRelease: view.onDesignRelease,
  };
}

/** One line of the page: a staff of a system on the paper, with the system's + − × over its top staff in Design Mode. */
function renderScoreLine(item: ScoreLine, view: LineView): ReactElement | null {
  const system = view.layout.systems[item.systemIndex];
  const staff = system?.staves[item.staffIndex];
  const row = system?.rows[item.staffIndex];
  if (staff === undefined || row === undefined) {
    return null;
  }
  const props = lineRowProps(item, staff, row, view);
  const { palette, song } = view;
  return (
    <View style={[styles.pageRow, { backgroundColor: palette.paper }]}>
      {props.design?.isTop === true ? (
        <SystemDesignButtons palette={palette} song={song} firstMeasureIndex={row.measures[0]?.measureIndex ?? 0} barCount={row.measures.length} onEdit={view.onDesignEdit} />
      ) : null}
      <ScoreRow {...props} />
    </View>
  );
}

/** A line's key: its system's first bar, and its track in a multitrack score (a moved track keeps its canvases). */
function lineKey(layout: ScoreLayout, line: ScoreLine): string {
  const firstBar = String(layout.systems[line.systemIndex]?.rows[0]?.measures[0]?.measureIndex ?? 0);
  return layout.staves.length === 1 ? firstBar : `${firstBar}:${layout.staves[line.staffIndex]?.trackIndex ?? 0}`;
}

/** The zoom the view shows for its setting (a fit to the printed page from the view's size), reported when it changes. */
function useShownZoom(props: ScoreViewProps, song: Song, width: number, height: number): ScoreFit {
  const sheet = stylesheetOf(song);
  const area = useMemo(() => printArea(sheet), [sheet]);
  const fit = fitScoreZoom(props.zoom, { width, height, deskMargin: DESK_MARGIN, sidePadding: ROW.sidePadding }, area);
  const { onShownZoom } = props;
  useEffect(() => {
    if (width > 0) {
      onShownZoom?.(fit.zoom);
    }
  }, [width, fit.zoom, onShownZoom]);
  return fit;
}

/** The page's size and the score's layout across it, zoomed by the stylesheet's scale too. */
function usePageLayout(props: ScoreViewProps, song: Song) {
  const [width, setWidth] = useState(0);
  const [height, setHeight] = useState(0);
  const fit = useShownZoom(props, song, width, height);
  // The stylesheet's overall proportions draw the whole score larger or smaller, as the zoom does.
  const zoom = fit.zoom * stylesheetOf(song).scale;
  // A fit to the whole page shows a page as wide as the paper's at that zoom, on the desk's middle.
  const pageWidth = fit.pageWidth ?? Math.max(0, width - DESK_MARGIN * 2);
  // Rows are laid out in unzoomed points: a zoomed page holds fewer bars per line, as in Guitar Pro.
  const rowWidth = Math.max(0, (pageWidth - ROW.sidePadding * 2) / zoom);
  const layout = useScoreLayout(song, props.staves, props.chordDisplay ?? DEFAULT_CHORD_DISPLAY, rowWidth);
  const onLayout = useCallback((event: LayoutChangeEvent) => {
    setWidth(event.nativeEvent.layout.width);
    setHeight(event.nativeEvent.layout.height);
  }, []);
  return { zoom, rowWidth, layout, viewportHeight: height, onLayout, deskSide: Math.max(DESK_MARGIN, (width - pageWidth) / 2) };
}

/** The page's lines, how each is drawn, and what follows the cursor and playback into view. */
function useScorePage(props: ScoreViewProps, listRef: RefObject<FlatList<ScoreLine> | null>, headerHeight: number) {
  const { trackIndex, cursor, isMultivoice, playing, playingTracks, selection, palette, isDesignMode = false, onLayoutEdit } = props;
  // A Design Mode drag shows its edit on the score before it becomes one.
  const designDrag = useDesignDrag(props.song, onLayoutEdit);
  const { song, guide } = designDrag;
  const { zoom, rowWidth, layout, viewportHeight, onLayout, deskSide } = usePageLayout(props, song);
  const lines = useMemo(
    () => layout.systems.flatMap((_, systemIndex) => layout.staves.map((__, staffIndex): ScoreLine => ({ systemIndex, staffIndex }))),
    [layout],
  );
  const { onPressRow, onDragRow } = useDragSelection({ song, layout, onPressBeat: props.onPressBeat, onDragBeat: props.onDragBeat });
  const onViewableItemsChanged = useScoreScroll(listRef, { layout, zoom, headerHeight, viewportHeight, topMargin: DESK_MARGIN, cursor, playing });
  const { onPress: pressDesign, onMove: onDesignMove, onRelease: onDesignRelease } = designDrag;
  const onDesignPress = useCallback(
    (systemIndex: number, handle: DesignHandle, x: number, y: number) => pressDesign({ handle, systemIndex, pointerX: x, pointerY: y, song, layout, rowWidth }),
    [pressDesign, song, layout, rowWidth],
  );
  const onDesignEdit = useCallback((action: LayoutAction) => onLayoutEdit?.(action), [onLayoutEdit]);
  const renderLine = useCallback(
    ({ item }: ListRenderItemInfo<ScoreLine>) => renderScoreLine(item, {
      song, layout, rowWidth, zoom, palette, trackIndex, cursor, isMultivoice, playing, playingTracks, selection, onPressRow, onDragRow, onContextBeat: props.onContextBeat,
      isDesignMode, guide, onDesignEdit, onDesignPress, onDesignMove, onDesignRelease,
    }),
    [song, trackIndex, layout, rowWidth, palette, cursor, isMultivoice, playing, playingTracks, selection, zoom, onPressRow, onDragRow, props.onContextBeat, isDesignMode, guide, onDesignEdit, onDesignPress, onDesignMove, onDesignRelease],
  );
  return { layout, zoom, lines, renderLine, onLayout, onViewableItemsChanged, deskSide };
}

/**
 * The score as one page on Guitar Pro's grey desk: the title block, then the systems — a staff group per shown track,
 * each its own canvas, virtualised —, zoomed. The playing system, and the cursor's line when it leaves the view (a bar
 * picked in the bar map), are scrolled into view.
 */
export function ScoreView(props: ScoreViewProps) {
  const { palette, header } = props;
  const listRef = useRef<FlatList<ScoreLine>>(null);
  const [headerHeight, setHeaderHeight] = useState(0);
  const { layout, zoom, lines, renderLine, onLayout, onViewableItemsChanged, deskSide } = useScorePage(props, listRef, headerHeight);
  return (
    <View style={[styles.desk, { backgroundColor: palette.desk }]} onLayout={onLayout}>
      <FlatList
        ref={listRef}
        data={lines}
        renderItem={renderLine}
        keyExtractor={(line) => lineKey(layout, line)}
        getItemLayout={(_, index) => {
          const place = linePlace(layout, lineAt(layout, index));
          return { length: place.height * zoom, offset: headerHeight + place.top * zoom, index };
        }}
        extraData={renderLine}
        ListHeaderComponent={
          <View style={[styles.pageRow, styles.pageTop, { backgroundColor: palette.paper }]} onLayout={(event) => setHeaderHeight(event.nativeEvent.layout.height)}>
            {header}
          </View>
        }
        ListFooterComponent={<View style={[styles.pageRow, styles.pageFoot, { backgroundColor: palette.paper }]} />}
        contentContainerStyle={[styles.content, { paddingHorizontal: deskSide }]}
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
