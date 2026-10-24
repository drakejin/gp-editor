import { View } from 'react-native';
import { type EffectParamSpec, MASTER_GAIN, type MasterMix, setMasterGain } from '@gp-editor/core';
import type { Palette } from '../../theme';
import { EffectChainEditor } from './EffectChainEditor';
import { PARAM_SLIDER, ParamSlider } from './ParamSlider';

/** The master's output gain as a slider parameter (its English label names it: effectParamLabel). */
// i18n-exempt: the English name, shown through effectParamLabel
export const OUTPUT_GAIN: EffectParamSpec = { id: 'gainDb', label: 'Output', min: MASTER_GAIN.min, max: MASTER_GAIN.max, defaultValue: 0, unit: 'dB', step: 0.5 };
const SLIDER_MARGIN = PARAM_SLIDER.labelWidth + PARAM_SLIDER.valueWidth + 16;

export interface MasterStripEditorProps {
  readonly palette: Palette;
  readonly master: MasterMix;
  readonly width: number;
  readonly onChange: (master: MasterMix) => void;
  /** While a slider is dragged: the master to hear now; undefined when the drag ended unchanged. */
  readonly onPreview: (master: MasterMix | undefined) => void;
}

/** The master strip on the whole mix: EQ, compressor, reverb and limiter (each on or off), and the output gain. */
export function MasterStripEditor({ palette, master, width, onChange, onPreview }: MasterStripEditorProps) {
  return (
    <View style={{ width }}>
      <ParamSlider
        palette={palette}
        spec={OUTPUT_GAIN}
        value={master.gainDb}
        width={Math.max(40, width - SLIDER_MARGIN)}
        onChange={(gainDb) => onChange(setMasterGain(master, gainDb))}
        onPreview={(gainDb) => onPreview(gainDb === undefined ? undefined : setMasterGain(master, gainDb))}
      />
      <EffectChainEditor
        palette={palette}
        effects={master.effects}
        width={width}
        isFixed
        onChange={(effects) => onChange({ ...master, effects })}
        onPreview={(effects) => onPreview(effects === undefined ? undefined : { ...master, effects })}
      />
    </View>
  );
}
