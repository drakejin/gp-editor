import { memo, useRef, useState } from 'react';
import { type AccessibilityActionEvent, type GestureResponderEvent, Pressable, StyleSheet, View } from 'react-native';
import type { Palette } from '../theme';

/** A mixer value is a MIDI controller value, 0–127; pan's centre is 64. */
export const MIXER = {
  max: 127,
  centre: 64,
  /** Height of the slider (its whole height takes the pointer). */
  height: 22,
  trackHeight: 3,
  thumbSize: 10,
  /** One VoiceOver increment. */
  step: 8,
} as const;

export interface MixerSliderProps {
  /** 0–127. */
  readonly value: number;
  readonly width: number;
  /** What it sets, e.g. "Volume"; the tooltip adds the value. */
  readonly label: string;
  /** For VoiceOver when `label` alone is not enough (e.g. "Volume of track 2"); `label` by default. */
  readonly accessibilityLabel?: string;
  readonly palette: Palette;
  /** Pan: the fill runs from the centre to the thumb, and the value reads "L 20" / "centre" / "R 20". */
  readonly isCentred?: boolean;
  readonly isEnabled?: boolean;
  /** Called once when a drag (or click) ends on a new value, not on every move. */
  readonly onChange: (value: number) => void;
}

function clampValue(value: number): number {
  return Math.min(MIXER.max, Math.max(0, Math.round(value)));
}

/** Centre of the thumb for a value; the thumb stays inside the track. */
export function sliderThumbX(value: number, width: number): number {
  const half = MIXER.thumbSize / 2;
  return half + (clampValue(value) / MIXER.max) * Math.max(0, width - MIXER.thumbSize);
}

/** The value whose thumb is centred on x (0–127, clamped). */
export function sliderValueAt(x: number, width: number): number {
  const span = Math.max(1, width - MIXER.thumbSize);
  return clampValue(((x - MIXER.thumbSize / 2) / span) * MIXER.max);
}

/** "100" for a volume; "centre", "L 20" or "R 20" for a pan. */
export function formatMixerValue(value: number, isCentred: boolean): string {
  if (!isCentred) {
    return String(value);
  }
  const offset = value - MIXER.centre;
  return offset === 0 ? 'centre' : `${offset < 0 ? 'L' : 'R'} ${Math.abs(offset)}`;
}

interface DragStart {
  readonly x: number;
  readonly pageX: number;
}

/** How far the pointer may leave the slider while dragging and still drive it. */
const DRAG_RETENTION = { top: 400, bottom: 400, left: 2000, right: 2000 } as const;

/**
 * The value while dragging (undefined otherwise) and the press handlers that drive it. A Pressable's press events,
 * not a plain view's responder: react-native-macos delivers mouse clicks to pressables.
 */
function useSliderDrag(value: number, width: number, onChange: (value: number) => void) {
  const [dragValue, setDragValue] = useState<number | undefined>(undefined);
  const start = useRef<DragStart | undefined>(undefined);
  // The pointer is followed from where it went down, so a drag beyond the slider keeps tracking.
  const valueOf = (event: GestureResponderEvent): number => {
    const origin = start.current;
    const x = origin === undefined ? event.nativeEvent.locationX : origin.x + event.nativeEvent.pageX - origin.pageX;
    return sliderValueAt(x, width);
  };
  const handlers = {
    onPressIn: (event: GestureResponderEvent) => {
      start.current = { x: event.nativeEvent.locationX, pageX: event.nativeEvent.pageX };
      setDragValue(sliderValueAt(event.nativeEvent.locationX, width));
    },
    onPressMove: (event: GestureResponderEvent) => setDragValue(valueOf(event)),
    onPressOut: (event: GestureResponderEvent) => {
      const next = valueOf(event);
      start.current = undefined;
      setDragValue(undefined);
      if (next !== value) {
        onChange(next);
      }
    },
  };
  return { dragValue, handlers };
}

/** A thin horizontal mixer slider (volume, or pan with `isCentred`): click to jump, drag to slide. */
function MixerSliderView(props: MixerSliderProps) {
  const { value, width, label, palette, isCentred = false, isEnabled = true, onChange } = props;
  const { dragValue, handlers } = useSliderDrag(value, width, onChange);
  const shown = dragValue ?? value;
  const text = formatMixerValue(shown, isCentred);
  const thumbX = sliderThumbX(shown, width);
  const fromX = isCentred ? sliderThumbX(MIXER.centre, width) : 0;
  const onAccessibilityAction = (event: AccessibilityActionEvent) => {
    const step = event.nativeEvent.actionName === 'increment' ? MIXER.step : event.nativeEvent.actionName === 'decrement' ? -MIXER.step : 0;
    const next = clampValue(value + step);
    if (isEnabled && step !== 0 && next !== value) {
      onChange(next);
    }
  };
  return (
    <Pressable
      style={[styles.slider, { width }, isEnabled ? null : styles.disabled]}
      tooltip={`${label}: ${text}`}
      accessible
      accessibilityRole="adjustable"
      accessibilityLabel={props.accessibilityLabel ?? label}
      accessibilityState={{ disabled: !isEnabled }}
      accessibilityValue={{ min: 0, max: MIXER.max, now: shown, text }}
      accessibilityActions={[{ name: 'increment' }, { name: 'decrement' }]}
      onAccessibilityAction={onAccessibilityAction}
      disabled={!isEnabled}
      pressRetentionOffset={DRAG_RETENTION}
      {...handlers}
    >
      <View style={[styles.track, { width, backgroundColor: palette.chromeBorder }]} />
      {isCentred ? <View style={[styles.centreTick, { left: fromX - 0.5, backgroundColor: palette.chromeMuted }]} /> : null}
      <View
        testID="mixer-slider-fill"
        style={[styles.track, { left: Math.min(fromX, thumbX), width: Math.abs(thumbX - fromX), backgroundColor: palette.chromeAccent }]}
      />
      <View
        testID="mixer-slider-thumb"
        style={[styles.thumb, { left: thumbX - MIXER.thumbSize / 2, backgroundColor: palette.chromeText, borderColor: palette.chromeBorder }]}
      />
    </Pressable>
  );
}

export const MixerSlider = memo(MixerSliderView);

const styles = StyleSheet.create({
  slider: { height: MIXER.height, justifyContent: 'center' },
  disabled: { opacity: 0.35 },
  // Children never take the pointer: positions are read relative to the slider itself.
  track: {
    position: 'absolute',
    top: (MIXER.height - MIXER.trackHeight) / 2,
    height: MIXER.trackHeight,
    borderRadius: MIXER.trackHeight / 2,
    pointerEvents: 'none',
  },
  centreTick: { position: 'absolute', top: MIXER.height / 2 - 4, width: 1, height: 8, pointerEvents: 'none' },
  thumb: {
    position: 'absolute',
    top: (MIXER.height - MIXER.thumbSize) / 2,
    width: MIXER.thumbSize,
    height: MIXER.thumbSize,
    borderRadius: MIXER.thumbSize / 2,
    borderWidth: 1,
    pointerEvents: 'none',
  },
});
