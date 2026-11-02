import { useEffect, useMemo, useRef, useState } from 'react';
import { type GestureResponderEvent, type LayoutChangeEvent, type NativeScrollEvent, type NativeSyntheticEvent, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { type AudioSyncPoint, type SecondsRange, type SyncMap, audioSecondsAt, playedBarIndex } from '@gp-editor/core';
import { useT } from '../../hooks/use-i18n';
import type { AudioPeaks } from '../../lib/audio-track';
import { ScoreCanvas } from '../../native/score-canvas';
import { AUDIO_LANE, draggedSeconds, engraveAudioLane, hitTestAudioLane, laneWidth, laneWindow, laneX, scrollToShow } from '../../score/audio-lane';
import type { Palette } from '../../theme';
import { DRAG_RETENTION } from '../slider-drag';

export interface AudioWaveformProps {
  readonly map: SyncMap;
  readonly points: readonly AudioSyncPoint[];
  readonly peaks?: AudioPeaks;
  readonly durationSeconds: number;
  readonly pixelsPerSecond: number;
  readonly barNumbers: readonly number[];
  readonly cursorMeasureIndex?: number;
  readonly selectedPointIndex?: number;
  readonly playingSeconds?: number;
  readonly palette: Palette;
  readonly onSelectPoint: (pointIndex: number | undefined) => void;
  /** Once, when a marker's drag ends somewhere else (one undo step). */
  readonly onMovePoint: (pointIndex: number, seconds: number) => void;
  /** A click away from the markers: the bar heard there. */
  readonly onSelectBar: (measureIndex: number) => void;
  /** Where a point may be dragged (between its neighbours). */
  readonly pointRange: (pointIndex: number) => SecondsRange | undefined;
}

interface Drag {
  readonly pointIndex: number;
  readonly x: number;
  readonly pageX: number;
  readonly range: SecondsRange;
}

/** The map while a marker is dragged: the point at its new moment, so the bars over the waveform move along. */
function previewMap(map: SyncMap, pointIndex: number | undefined, seconds: number | undefined): SyncMap {
  if (pointIndex === undefined || seconds === undefined) {
    return map;
  }
  return { ...map, anchors: map.anchors.map((anchor) => (anchor.pointIndex === pointIndex ? { ...anchor, seconds } : anchor)) };
}

/** Keeps the playing moment in view while the audio plays, else the cursor's bar when it moves. */
function useFollow(props: AudioWaveformProps, scroll: { readonly current: number }, viewport: number, scrollRef: { readonly current: ScrollView | null }) {
  const { map, pixelsPerSecond, playingSeconds, cursorMeasureIndex } = props;
  const cursorBar = cursorMeasureIndex === undefined ? undefined : playedBarIndex(map, cursorMeasureIndex, 0);
  const cursorBarTick = cursorBar === undefined ? undefined : map.bars[cursorBar]?.tick;
  const followed = playingSeconds ?? (cursorBarTick === undefined ? undefined : audioSecondsAt(map, cursorBarTick));
  useEffect(() => {
    if (followed === undefined) {
      return;
    }
    const offset = scrollToShow(laneX(followed, pixelsPerSecond), scroll.current, viewport);
    if (offset !== undefined) {
      scrollRef.current?.scrollTo({ x: offset, animated: false });
    }
  }, [followed, pixelsPerSecond, viewport, scroll, scrollRef]);
}

/** A marker shown where it is being dragged. */
interface DragPreview {
  readonly pointIndex: number;
  readonly seconds: number;
}

/**
 * A click on a marker selects it and a drag moves it (the lane shows the bars following it until the mouse goes up,
 * and the point goes where it is let go); a click elsewhere goes to the bar heard there. The gesture is a ref, not
 * state: a quick drag's press, moves and release can all be handled before the lane draws again, and state read then
 * was the press's — no drag —, so the marker stayed where it was.
 */
function useMarkerDrag(props: AudioWaveformProps) {
  const { map, pixelsPerSecond } = props;
  const drag = useRef<Drag | undefined>(undefined);
  const [preview, setPreview] = useState<DragPreview | undefined>(undefined);
  const shownMap = useMemo(() => previewMap(map, preview?.pointIndex, preview?.seconds), [map, preview]);
  const secondsAt = (gesture: Drag, event: GestureResponderEvent) => draggedSeconds(gesture.x + event.nativeEvent.pageX - gesture.pageX, pixelsPerSecond, gesture.range);
  const onPressIn = (event: GestureResponderEvent) => {
    const hit = hitTestAudioLane(map, pixelsPerSecond, event.nativeEvent.locationX);
    const range = hit.kind === 'marker' ? props.pointRange(hit.pointIndex) : undefined;
    drag.current = hit.kind === 'marker' && range !== undefined ? { pointIndex: hit.pointIndex, x: event.nativeEvent.locationX, pageX: event.nativeEvent.pageX, range } : undefined;
    if (drag.current !== undefined) {
      props.onSelectPoint(drag.current.pointIndex);
    }
  };
  const onPressMove = (event: GestureResponderEvent) => {
    const gesture = drag.current;
    if (gesture !== undefined) {
      setPreview({ pointIndex: gesture.pointIndex, seconds: secondsAt(gesture, event) });
    }
  };
  const onPressOut = (event: GestureResponderEvent) => {
    const gesture = drag.current;
    drag.current = undefined;
    setPreview(undefined);
    if (gesture !== undefined) {
      if (event.nativeEvent.pageX !== gesture.pageX) {
        props.onMovePoint(gesture.pointIndex, secondsAt(gesture, event));
      }
      return;
    }
    const hit = hitTestAudioLane(map, pixelsPerSecond, event.nativeEvent.locationX);
    props.onSelectPoint(undefined);
    if (hit.kind === 'audio' && hit.measureIndex !== undefined) {
      props.onSelectBar(hit.measureIndex);
    }
  };
  return { shownMap, onPressIn, onPressMove, onPressOut };
}

/** The lane's waveform in a horizontal scroll view, drawn a few screens at a time (useMarkerDrag: clicks and drags). */
export function AudioWaveform(props: AudioWaveformProps) {
  const { map, pixelsPerSecond, palette } = props;
  const scrollRef = useRef<ScrollView>(null);
  const scroll = useRef(0);
  const t = useT();
  const [scrollX, setScrollX] = useState(0);
  const [viewport, setViewport] = useState(0);
  useFollow(props, scroll, viewport, scrollRef);
  const { shownMap, onPressIn, onPressMove, onPressOut } = useMarkerDrag(props);
  const { points, peaks, durationSeconds, barNumbers, cursorMeasureIndex, selectedPointIndex, playingSeconds } = props;
  const width = laneWidth(map, durationSeconds, pixelsPerSecond);
  const { fromX, toX } = laneWindow(scrollX, viewport, width);
  const commands = useMemo(
    () => engraveAudioLane({ map: shownMap, points, peaks, durationSeconds, pixelsPerSecond, barNumbers, cursorMeasureIndex, selectedPointIndex, playingSeconds, fromX, toX, palette }),
    [shownMap, points, peaks, durationSeconds, pixelsPerSecond, barNumbers, cursorMeasureIndex, selectedPointIndex, playingSeconds, fromX, toX, palette],
  );
  const onScroll = (event: NativeSyntheticEvent<NativeScrollEvent>) => {
    scroll.current = event.nativeEvent.contentOffset.x;
    setScrollX(scroll.current);
  };
  return (
    <ScrollView horizontal ref={scrollRef} style={styles.scroll} onLayout={(event: LayoutChangeEvent) => setViewport(event.nativeEvent.layout.width)} onScroll={onScroll} scrollEventThrottle={32}>
      <Pressable
        testID="audio-lane-waveform"
        style={{ width, height: AUDIO_LANE.height }}
        onPressIn={onPressIn}
        onPressMove={onPressMove}
        onPressOut={onPressOut}
        pressRetentionOffset={DRAG_RETENTION}
        tooltip={t('tools.audioTrack.waveformTooltip')}
        accessibilityRole="adjustable"
        accessibilityLabel={t('tools.audioTrack.waveform')}
      >
        <View style={[styles.window, { left: fromX, width: toX - fromX }]}>
          <ScoreCanvas commands={commands} style={styles.canvas} />
        </View>
      </Pressable>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scroll: { flex: 1, height: AUDIO_LANE.height },
  window: { position: 'absolute', top: 0, height: AUDIO_LANE.height, pointerEvents: 'none' },
  canvas: { flex: 1 },
});
