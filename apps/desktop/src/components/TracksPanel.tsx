import { memo, useCallback, useMemo, useState } from 'react';
import { type GestureResponderEvent, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import type { Song } from '@gp-editor/core';
import { useBarInView } from '../hooks/use-bar-in-view';
import { trackInstrument } from '../lib/instruments';
import { ScoreCanvas } from '../native/score-canvas';
import { BAR_MAP, barMapHeight, barMapWidth, engraveBarMap, hitTestBarMap } from '../score/bar-map';
import { instrumentIconKind } from '../score/panel-icons';
import type { TrackPanelActions } from '../hooks/use-track-manager';
import type { Palette } from '../theme';
import { TrackActions } from './TrackActions';
import { TRACK_TABLE, TrackMixerRow, TrackTableFooter, TrackTableHeader } from './TrackMixerRow';

export const TRACKS_PANEL = {
  /** Past this the panel scrolls (about eight tracks). */
  maxHeight: 220,
} as const;

export interface TracksPanelProps {
  readonly song: Song;
  readonly selectedTrackIndex: number;
  readonly cursorMeasureIndex?: number;
  readonly playingMeasureIndex?: number;
  readonly palette: Palette;
  readonly onSelectTrack: (trackIndex: number) => void;
  /** A bar cell (or a bar number / section with the selected track) was clicked. */
  readonly onSelectBar: (trackIndex: number, measureIndex: number) => void;
  readonly onSetTrackMute: (trackIndex: number, isMute: boolean) => void;
  readonly onSetTrackSolo: (trackIndex: number, isSolo: boolean) => void;
  /** Called once when a drag ends (one undo step), not on every move. */
  readonly onSetTrackVolume: (trackIndex: number, volume: number) => void;
  readonly onSetTrackBalance: (trackIndex: number, balance: number) => void;
  /** The track's instrument icon was clicked (opens the instrument picker). */
  readonly onEditInstrument: (trackIndex: number) => void;
  /** Add, duplicate, delete and move tracks (the footer's buttons, dragging a track's name); none: no buttons. */
  readonly trackActions?: TrackPanelActions;
  /** Guitar Pro's "Audio track" button, while the song has none (Track ▸ Add Audio Track…). */
  readonly onAddAudioTrack?: () => void;
}

/**
 * Guitar Pro's tracks panel, dark in both appearances: the track table (instrument, name, show / mute / solo, volume,
 * pan) on the left and the bar map on the right — a cell per bar, filled where the track has notes, the cursor's bar
 * marked; clicking a cell goes there. The two halves share their row heights, and the whole panel scrolls vertically.
 */
function TracksPanelView(props: TracksPanelProps) {
  const { song, selectedTrackIndex, palette, trackActions } = props;
  // A track's name being dragged: where it would go.
  const [drag, setDrag] = useState<{ readonly fromIndex: number; readonly toIndex: number } | undefined>(undefined);
  const onDragTrack = useCallback((fromIndex: number, toIndex: number | undefined) => setDrag(toIndex === undefined ? undefined : { fromIndex, toIndex }), []);
  const rows = useMemo(
    () =>
      song.tracks.map((track, trackIndex) => ({
        channel: song.channels.find((channel) => channel.id === track.channelId),
        instrumentName: trackInstrument(song, trackIndex)?.name,
        iconKind: instrumentIconKind(song, trackIndex),
      })),
    [song],
  );
  return (
    <View style={[styles.panel, { backgroundColor: palette.chrome, borderTopColor: palette.chromeBorder }]}>
      <ScrollView style={styles.vertical}>
        <View style={styles.columns}>
          <View style={[styles.table, { borderRightColor: palette.chromeBorder }]}>
            <TrackTableHeader palette={palette} />
            {song.tracks.map((track, trackIndex) => (
              <TrackMixerRow
                key={trackIndex}
                track={track}
                trackIndex={trackIndex}
                channel={rows[trackIndex]?.channel}
                instrumentName={rows[trackIndex]?.instrumentName}
                iconKind={rows[trackIndex]?.iconKind ?? 'guitar'}
                isSelected={trackIndex === selectedTrackIndex}
                palette={palette}
                onSelectTrack={props.onSelectTrack}
                onSetTrackMute={props.onSetTrackMute}
                onSetTrackSolo={props.onSetTrackSolo}
                onSetTrackVolume={props.onSetTrackVolume}
                onSetTrackBalance={props.onSetTrackBalance}
                onEditInstrument={props.onEditInstrument}
                trackCount={song.tracks.length}
                isDragged={drag?.fromIndex === trackIndex}
                onDragTrack={trackActions === undefined ? undefined : onDragTrack}
                onMoveTrack={trackActions?.onMoveTrack}
              />
            ))}
            {drag === undefined ? null : <DropMarker palette={palette} {...drag} />}
            <TrackTableFooter
              palette={palette}
              onAddAudioTrack={props.onAddAudioTrack}
              trackActions={trackActions === undefined ? undefined : <TrackActions palette={palette} trackCount={song.tracks.length} selectedTrackIndex={selectedTrackIndex} actions={trackActions} />}
            />
          </View>
          <BarMap {...props} />
        </View>
      </ScrollView>
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

/** The bar map on the native canvas, in a horizontal scroll view that keeps the playing (else the cursor's) bar in view. */
function BarMap({ song, selectedTrackIndex, cursorMeasureIndex, playingMeasureIndex, palette, onSelectBar }: TracksPanelProps) {
  const commands = useMemo(
    () => engraveBarMap({ song, selectedTrackIndex, cursorMeasureIndex, playingMeasureIndex, palette }),
    [song, selectedTrackIndex, cursorMeasureIndex, playingMeasureIndex, palette],
  );
  const { scrollRef, onLayout, onScroll } = useBarInView(playingMeasureIndex ?? cursorMeasureIndex);
  const size = { width: barMapWidth(song), height: barMapHeight(song) };
  const handlePress = (event: GestureResponderEvent) => {
    const hit = hitTestBarMap(song, event.nativeEvent.locationX, event.nativeEvent.locationY);
    if (hit !== undefined) {
      onSelectBar('trackIndex' in hit ? hit.trackIndex : selectedTrackIndex, hit.measureIndex);
    }
  };
  return (
    <ScrollView horizontal ref={scrollRef} onLayout={onLayout} onScroll={onScroll} scrollEventThrottle={16} style={styles.map}>
      <Pressable
        testID="tracks-panel-bar-map"
        onPress={handlePress}
        tooltip="Filled bars hold notes. Click a bar to go there."
        accessibilityRole="button"
        accessibilityLabel="Bar map"
        accessibilityHint="Goes to the clicked track and bar"
        style={size}
      >
        <ScoreCanvas commands={commands} style={size} />
      </Pressable>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  panel: { borderTopWidth: 1 },
  // ScrollView grows by default; the panel keeps its content's height up to its maximum.
  vertical: { flexGrow: 0, maxHeight: TRACKS_PANEL.maxHeight },
  columns: { flexDirection: 'row' },
  table: { width: TRACK_TABLE.width, borderRightWidth: 1 },
  map: { flex: 1 },
  dropMarker: { position: 'absolute', left: 0, right: 0, height: 2 },
});
