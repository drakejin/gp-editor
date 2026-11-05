import { memo, useCallback, useMemo, useRef, useState } from 'react';
import { type GestureResponderEvent, type NativeMouseEvent, type NativeSyntheticEvent, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import type { Song } from '@gp-editor/core';
import { useBarInView } from '../hooks/use-bar-in-view';
import { useLanguage, useT } from '../hooks/use-i18n';
import { trackInstrument } from '../lib/instruments';
import { ScoreCanvas } from '../native/score-canvas';
import { BAR_MAP, barMapHeight, barMapWidth, engraveBarMap, hitTestBarMap } from '../score/bar-map';
import { shownTrackIcon } from '../score/track-icons';
import { type PanelAnchor, anchorAt } from '../hooks/use-track-info';
import type { TrackPanelActions } from '../hooks/use-track-manager';
import type { Palette } from '../theme';
import { TrackActions } from './TrackActions';
import { TRACK_TABLE, TrackMixerRow, TrackTableHeader, TrackTableSections } from './TrackMixerRow';
import { TRACKS_FOOTER_HEIGHT, TracksPanelFooter } from './TracksPanelFooter';

export const TRACKS_PANEL = {
  /** Past this the table and the bar map scroll (about eight tracks). */
  maxHeight: 220,
  /** The track and bar buttons' row under them, outside their scroll (TracksPanelFooter). */
  footerHeight: TRACKS_FOOTER_HEIGHT,
  /**
   * The least it shrinks to (its header, three tracks and the buttons' row) when a panel over the score needs the room —
   * a lyrics or annotation field at 1280 × 800 with the keyboard and fretboard shown —; the tracks scroll inside.
   */
  minHeight: BAR_MAP.headerHeight + 3 * BAR_MAP.rowHeight + TRACKS_FOOTER_HEIGHT,
} as const;

export interface TracksPanelProps {
  readonly song: Song;
  readonly selectedTrackIndex: number;
  /** The tracks the score shows (their eyes are lit); the selected one alone by default. */
  readonly shownTrackIndexes?: readonly number[];
  /** View ▸ Multitrack is on (the Multitrack button over the table is lit). */
  readonly isMultitrack?: boolean;
  /** A track's eye: shows or hides it in the multitrack view. */
  readonly onToggleTrackShown: (trackIndex: number) => void;
  readonly onToggleMultitrack: () => void;
  readonly cursorMeasureIndex?: number;
  readonly playingMeasureIndex?: number;
  readonly palette: Palette;
  readonly onSelectTrack: (trackIndex: number) => void;
  /** A bar cell (or a bar number / section with the selected track) was clicked. */
  readonly onSelectBar: (trackIndex: number, measureIndex: number) => void;
  /** A bar cell was right-clicked or ⌃-clicked: its menu opens at `anchor` (window points); none: no menu. */
  readonly onContextBar?: (trackIndex: number, measureIndex: number, anchor: PanelAnchor) => void;
  readonly onSetTrackMute: (trackIndex: number, isMute: boolean) => void;
  readonly onSetTrackSolo: (trackIndex: number, isSolo: boolean) => void;
  /** Called once when a drag ends (one undo step), not on every move. */
  readonly onSetTrackVolume: (trackIndex: number, volume: number) => void;
  readonly onSetTrackBalance: (trackIndex: number, balance: number) => void;
  /** A track's colour strip or icon was clicked: its track information (name, short name, colour, icon) opens there. */
  readonly onOpenTrackInfo?: (trackIndex: number, anchor: PanelAnchor) => void;
  /** A track renamed in place (one undo step). */
  readonly onRenameTrack?: (trackIndex: number, name: string) => void;
  /** Renaming in place ended: the keyboard goes back to the score. */
  readonly onRenameEnd?: () => void;
  /** Add, duplicate, delete and move tracks (the footer's buttons, dragging a track's name); none: no buttons. */
  readonly trackActions?: TrackPanelActions;
  /** Guitar Pro's "Audio track" button, while the song has none (Track ▸ Add Audio Track…). */
  readonly onAddAudioTrack?: () => void;
  /**
   * The bar map's menu is open: the panel takes no clicks — react-native-macos hit-tested the cells and rows under the
   * menu before the menu (its lower items and its backdrop over the panel lost their clicks to them, in the app).
   */
  readonly isMenuOpen?: boolean;
}

/**
 * Guitar Pro's tracks panel, dark in both appearances: the track table (colour strip and icon — both open the track's
 * information —, name, show / mute / solo, volume, pan; Multitrack over it, the eyes choosing the tracks it shows) on the left and the bar map on the right — a cell per bar, filled where the track has notes, the cursor's bar
 * marked; clicking a cell goes there, a right-click opens its menu. The two halves share their row heights and scroll
 * vertically together; the track and bar buttons stay under them.
 */
function TracksPanelView(props: TracksPanelProps) {
  const { song, palette, trackActions, selectedTrackIndex } = props;
  return (
    <View pointerEvents={props.isMenuOpen === true ? 'none' : 'auto'} style={[styles.panel, { backgroundColor: palette.chrome, borderTopColor: palette.chromeBorder }]}>
      <ScrollView style={styles.vertical}>
        <View style={styles.columns}>
          <TrackTable {...props} />
          <BarMap {...props} />
        </View>
      </ScrollView>
      <TracksPanelFooter
        palette={palette}
        onAddAudioTrack={props.onAddAudioTrack}
        trackActions={
          trackActions === undefined ? undefined : <TrackActions palette={palette} trackCount={song.tracks.length} selectedTrackIndex={selectedTrackIndex} hasCursor={props.cursorMeasureIndex !== undefined} actions={trackActions} />
        }
      />
    </View>
  );
}

/** The track table: Multitrack over it, a row per track (dragged by its name to move it), the buttons under it. */
function TrackTable(props: TracksPanelProps) {
  const { song, selectedTrackIndex, palette, trackActions, shownTrackIndexes = [selectedTrackIndex] } = props;
  // The instrument names are in the shown language: the rows are rebuilt when it changes.
  const language = useLanguage();
  // A track's name being dragged: where it would go.
  const [drag, setDrag] = useState<{ readonly fromIndex: number; readonly toIndex: number } | undefined>(undefined);
  const onDragTrack = useCallback((fromIndex: number, toIndex: number | undefined) => setDrag(toIndex === undefined ? undefined : { fromIndex, toIndex }), []);
  const rows = useMemo(
    () =>
      song.tracks.map((track, trackIndex) => ({
        channel: song.channels.find((channel) => channel.id === track.channelId),
        instrumentName: trackInstrument(song, trackIndex)?.name,
        icon: shownTrackIcon(song, trackIndex),
      })),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `language` is read by trackInstrument's names (global t)
    [song, language],
  );
  return (
    <View style={[styles.table, { borderRightColor: palette.chromeBorder }]}>
      <TrackTableHeader palette={palette} isMultitrack={props.isMultitrack === true} onToggleMultitrack={props.onToggleMultitrack} />
      {song.tracks.map((track, trackIndex) => (
        <TrackMixerRow
          key={trackIndex}
          track={track}
          trackIndex={trackIndex}
          channel={rows[trackIndex]?.channel}
          instrumentName={rows[trackIndex]?.instrumentName}
          icon={rows[trackIndex]?.icon ?? 'steelGuitar'}
          isSelected={trackIndex === selectedTrackIndex}
          isShown={shownTrackIndexes.includes(trackIndex)}
          palette={palette}
          onSelectTrack={props.onSelectTrack}
          onToggleShown={props.onToggleTrackShown}
          onSetTrackMute={props.onSetTrackMute}
          onSetTrackSolo={props.onSetTrackSolo}
          onSetTrackVolume={props.onSetTrackVolume}
          onSetTrackBalance={props.onSetTrackBalance}
          onOpenTrackInfo={props.onOpenTrackInfo}
          onRenameTrack={props.onRenameTrack}
          onRenameEnd={props.onRenameEnd}
          trackCount={song.tracks.length}
          isDragged={drag?.fromIndex === trackIndex}
          onDragTrack={trackActions === undefined ? undefined : onDragTrack}
          onMoveTrack={trackActions?.onMoveTrack}
        />
      ))}
      {drag === undefined ? null : <DropMarker palette={palette} {...drag} />}
      <TrackTableSections palette={palette} />
    </View>
  );
}

/** Where a dragged track would go: a line over the rows, above the target row (moving up) or below it (moving down). */
function DropMarker({ palette, fromIndex, toIndex }: { readonly palette: Palette; readonly fromIndex: number; readonly toIndex: number }) {
  const rowEdge = toIndex > fromIndex ? toIndex + 1 : toIndex;
  return <View pointerEvents="none" style={[styles.dropMarker, { top: BAR_MAP.headerHeight + rowEdge * BAR_MAP.rowHeight - 1, backgroundColor: palette.chromeAccent }]} />;
}

/** Memoized: it re-renders when the song, selection, cursor bar, playing bar or palette changes, not on every beat. */
export const TracksPanel = memo(TracksPanelView);

/** The right mouse button, as onAuxClick reports it (a middle click is 1). */
const RIGHT_BUTTON = 2;

/** The bar map's clicks: a cell goes there; a right-click or ⌃-click on a cell opens its menu (when there is one). */
function useBarMapPointer({ song, selectedTrackIndex, onSelectBar, onContextBar }: TracksPanelProps) {
  const mapRef = useRef<View>(null);
  // True when the point is a track's bar and its menu opens.
  const openMenu = (x: number, y: number): boolean => {
    const hit = hitTestBarMap(song, x, y);
    if (onContextBar === undefined || hit === undefined || !('trackIndex' in hit)) {
      return false;
    }
    anchorAt(mapRef.current, x, y, (anchor) => onContextBar(hit.trackIndex, hit.measureIndex, anchor));
    return true;
  };
  const onPress = (event: GestureResponderEvent) => {
    const { locationX, locationY, ctrlKey } = event.nativeEvent;
    if (ctrlKey === true && openMenu(locationX, locationY)) {
      return;
    }
    const hit = hitTestBarMap(song, locationX, locationY);
    if (hit !== undefined) {
      onSelectBar('trackIndex' in hit ? hit.trackIndex : selectedTrackIndex, hit.measureIndex);
    }
  };
  const onAuxClick =
    onContextBar === undefined
      ? undefined
      : (event: NativeSyntheticEvent<NativeMouseEvent>) => {
          if (event.nativeEvent.button === RIGHT_BUTTON) {
            openMenu(event.nativeEvent.clientX, event.nativeEvent.clientY);
          }
        };
  return { mapRef, onPress, onAuxClick };
}

/** The bar map on the native canvas, in a horizontal scroll view that keeps the playing (else the cursor's) bar in view. */
function BarMap(props: TracksPanelProps) {
  const { song, selectedTrackIndex, cursorMeasureIndex, playingMeasureIndex, palette } = props;
  const t = useT();
  const commands = useMemo(
    () => engraveBarMap({ song, selectedTrackIndex, cursorMeasureIndex, playingMeasureIndex, palette }),
    [song, selectedTrackIndex, cursorMeasureIndex, playingMeasureIndex, palette],
  );
  const { scrollRef, onLayout, onScroll } = useBarInView(playingMeasureIndex ?? cursorMeasureIndex);
  const size = { width: barMapWidth(song), height: barMapHeight(song) };
  const pointer = useBarMapPointer(props);
  return (
    <ScrollView horizontal ref={scrollRef} onLayout={onLayout} onScroll={onScroll} scrollEventThrottle={16} style={styles.map}>
      <Pressable
        ref={pointer.mapRef}
        testID="tracks-panel-bar-map"
        onPress={pointer.onPress}
        onAuxClick={pointer.onAuxClick}
        tooltip={t('window.tracks.barMapTooltip')}
        accessibilityRole="button"
        accessibilityLabel={t('window.tracks.barMap')}
        accessibilityHint={t('window.tracks.barMapHint')}
        style={size}
      >
        <ScoreCanvas commands={commands} style={size} />
      </Pressable>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  panel: { borderTopWidth: 1, flexShrink: 1, minHeight: TRACKS_PANEL.minHeight },
  // ScrollView grows by default; the panel keeps its content's height up to its maximum.
  vertical: { flexGrow: 0, maxHeight: TRACKS_PANEL.maxHeight },
  columns: { flexDirection: 'row' },
  table: { width: TRACK_TABLE.width, borderRightWidth: 1 },
  map: { flex: 1 },
  dropMarker: { position: 'absolute', left: 0, right: 0, height: 2 },
});
