import { StyleSheet, View } from 'react-native';
import { EFFECT_PARAMS, EFFECT_PRESETS, type Effect, applyEffectPreset, matchingEffectPreset, setEffectParam } from '@gp-editor/core';
import type { Palette } from '../../theme';
import { ChromeButton } from '../chrome/ChromeButton';
import { PARAM_SLIDER, ParamSlider } from './ParamSlider';

export interface EffectEditorProps {
  readonly palette: Palette;
  readonly effect: Effect;
  readonly width: number;
  readonly onChange: (effect: Effect) => void;
  /** While a slider is dragged: the effect to hear now; undefined when the drag ended unchanged. */
  readonly onPreview: (effect: Effect | undefined) => void;
}

/** Room the label, the value and the row's margins take beside a slider. */
const SLIDER_MARGIN = PARAM_SLIDER.labelWidth + PARAM_SLIDER.valueWidth + 16;

/** One effect's presets and parameters (values heard while dragging, written to the song when the drag ends). */
export function EffectEditor({ palette, effect, width, onChange, onPreview }: EffectEditorProps) {
  const preset = matchingEffectPreset(effect);
  const withParam = (id: string, value: number): Effect => setEffectParam([effect], 0, id, value)[0] ?? effect;
  return (
    <View style={[styles.editor, { width }]}>
      <View style={styles.presets}>
        {EFFECT_PRESETS[effect.type].map(({ name }) => (
          <ChromeButton
            key={name}
            palette={palette}
            label={name}
            tooltip={`${name} preset`}
            fontSize={11}
            isActive={preset === name}
            onPress={() => onChange(applyEffectPreset([effect], 0, name)[0] ?? effect)}
          />
        ))}
      </View>
      {EFFECT_PARAMS[effect.type].map((spec) => (
        <ParamSlider
          key={spec.id}
          palette={palette}
          spec={spec}
          value={effect.params[spec.id] ?? spec.defaultValue}
          width={Math.max(40, width - SLIDER_MARGIN)}
          onChange={(value) => onChange(withParam(spec.id, value))}
          onPreview={(value) => onPreview(value === undefined ? undefined : withParam(spec.id, value))}
        />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  editor: { paddingVertical: 4 },
  presets: { flexDirection: 'row', flexWrap: 'wrap', marginBottom: 4 },
});
