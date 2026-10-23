import { memo } from 'react';
import { type AccessibilityActionEvent, Pressable, StyleSheet, View } from 'react-native';
import type { Palette } from '../theme';
import { DRAG_RETENTION, useSliderDrag } from './slider-drag';

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

/** A thin horizontal mixer slider (volume, or pan with `isCentred`): click to jump, drag to slide. */
function MixerSliderView(props: MixerSliderProps) {
  const { value, width, label, palette, isCentred = false, isEnabled = true, onChange } = props;
  const { dragValue, handlers } = useSliderDrag(value, (x) => sliderValueAt(x, width), { onChange });
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
