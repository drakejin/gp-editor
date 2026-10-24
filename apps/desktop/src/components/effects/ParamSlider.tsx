import { memo } from 'react';
import { type AccessibilityActionEvent, Pressable, StyleSheet, Text, View } from 'react-native';
import type { EffectParamSpec } from '@gp-editor/core';
import { useLanguage, useT } from '../../hooks/use-i18n';
import { effectParamLabel, formatEffectValue, paramFromPosition, positionOfParam, stepChoice } from '../../lib/effect-values';
import type { Palette } from '../../theme';
import { ChromeButton } from '../chrome/ChromeButton';
import { DRAG_RETENTION, useSliderDrag } from '../slider-drag';

export const PARAM_SLIDER = { labelWidth: 62, valueWidth: 62, height: 22, trackHeight: 3, thumbSize: 10 } as const;
/** One VoiceOver step: a twentieth of the slider. */
const ACCESSIBILITY_STEP = 0.05;

export interface ParamSliderProps {
  readonly palette: Palette;
  readonly spec: EffectParamSpec;
  readonly value: number;
  /** The slider's own width (the label and the value text come on top). */
  readonly width: number;
  /** Once, when a drag or a click ends on a new value (one undo step). */
  readonly onChange: (value: number) => void;
  /** While dragging: the value to hear now; undefined when the drag ended where it started. */
  readonly onPreview?: (value: number | undefined) => void;
}

function thumbX(spec: EffectParamSpec, value: number, width: number): number {
  return PARAM_SLIDER.thumbSize / 2 + positionOfParam(spec, value) * Math.max(0, width - PARAM_SLIDER.thumbSize);
}

function valueAtX(spec: EffectParamSpec, x: number, width: number): number {
  return paramFromPosition(spec, (x - PARAM_SLIDER.thumbSize / 2) / Math.max(1, width - PARAM_SLIDER.thumbSize));
}

/** A choice (reverb room, cabinet …): its name between previous and next buttons. */
function ChoiceStepper({ palette, spec, value, width, onChange }: ParamSliderProps) {
  const t = useT();
  const name = effectParamLabel(spec).toLowerCase();
  return (
    <View style={[styles.stepper, { width }]}>
      <ChromeButton palette={palette} label="‹" tooltip={t('tools.effects.previousChoice', { name })} minWidth={20} onPress={() => onChange(stepChoice(spec, value, -1))} />
      <Text numberOfLines={1} style={[styles.choice, { color: palette.chromeText }]}>
        {formatEffectValue(spec, value)}
      </Text>
      <ChromeButton palette={palette} label="›" tooltip={t('tools.effects.nextChoice', { name })} minWidth={20} onPress={() => onChange(stepChoice(spec, value, 1))} />
    </View>
  );
}

function RangeSlider({ palette, spec, value, width, onChange, onPreview }: ParamSliderProps) {
  const { dragValue, handlers } = useSliderDrag(value, (x) => valueAtX(spec, x, width), {
    onChange,
    onDrag: onPreview,
    onDragEnd: () => onPreview?.(undefined),
  });
  const shown = dragValue ?? value;
  const text = formatEffectValue(spec, shown);
  const label = effectParamLabel(spec);
  const x = thumbX(spec, shown, width);
  const onAccessibilityAction = (event: AccessibilityActionEvent) => {
    const step = event.nativeEvent.actionName === 'increment' ? ACCESSIBILITY_STEP : -ACCESSIBILITY_STEP;
    const next = paramFromPosition(spec, positionOfParam(spec, value) + step);
    if (next !== value) {
      onChange(next);
    }
  };
  return (
    <>
      <Pressable
        style={[styles.slider, { width }]}
        tooltip={`${label}: ${text}`}
        accessible
        accessibilityRole="adjustable"
        accessibilityLabel={label}
        accessibilityValue={{ text }}
        accessibilityActions={[{ name: 'increment' }, { name: 'decrement' }]}
        onAccessibilityAction={onAccessibilityAction}
        pressRetentionOffset={DRAG_RETENTION}
        {...handlers}
      >
        <View style={[styles.track, { width, backgroundColor: palette.chromeBorder }]} />
        <View testID="param-slider-fill" style={[styles.track, { width: x, backgroundColor: palette.chromeAccent }]} />
        <View style={[styles.thumb, { left: x - PARAM_SLIDER.thumbSize / 2, backgroundColor: palette.chromeText, borderColor: palette.chromeBorder }]} />
      </Pressable>
      <Text numberOfLines={1} style={[styles.value, { color: palette.chromeText }]}>
        {text}
      </Text>
    </>
  );
}

/** One effect parameter: its label, then a slider and its value, or a stepper for a choice. */
function ParamSliderView(props: ParamSliderProps) {
  const { palette, spec } = props;
  // A memoised row: the language is a dependency of its names (effectParamLabel, the choices' names).
  useLanguage();
  return (
    <View style={styles.row}>
      <Text numberOfLines={1} style={[styles.label, { color: palette.chromeMuted }]}>
        {effectParamLabel(spec)}
      </Text>
      {spec.choices === undefined ? <RangeSlider {...props} /> : <ChoiceStepper {...props} width={props.width + PARAM_SLIDER.valueWidth} />}
    </View>
  );
}

export const ParamSlider = memo(ParamSliderView);

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', minHeight: PARAM_SLIDER.height + 2 },
  label: { width: PARAM_SLIDER.labelWidth, fontSize: 11, textAlign: 'right', marginRight: 8 },
  slider: { height: PARAM_SLIDER.height, justifyContent: 'center' },
  track: {
    position: 'absolute',
    top: (PARAM_SLIDER.height - PARAM_SLIDER.trackHeight) / 2,
    height: PARAM_SLIDER.trackHeight,
    borderRadius: PARAM_SLIDER.trackHeight / 2,
    pointerEvents: 'none',
  },
  thumb: {
    position: 'absolute',
    top: (PARAM_SLIDER.height - PARAM_SLIDER.thumbSize) / 2,
    width: PARAM_SLIDER.thumbSize,
    height: PARAM_SLIDER.thumbSize,
    borderRadius: PARAM_SLIDER.thumbSize / 2,
    borderWidth: 1,
    pointerEvents: 'none',
  },
  value: { width: PARAM_SLIDER.valueWidth, fontSize: 11, textAlign: 'right' },
  stepper: { flexDirection: 'row', alignItems: 'center' },
  choice: { flex: 1, fontSize: 11, fontWeight: '600', textAlign: 'center' },
});
