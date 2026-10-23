import type { ReactNode } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import type { EffectParamSpec } from '@gp-editor/core';
import type { LineIn } from '../../hooks/use-line-in';
import { LINE_IN_GAIN, hasFeedbackRisk, levelFraction } from '../../lib/line-in';
import type { Palette } from '../../theme';
import { ChromeButton } from '../chrome/ChromeButton';
import { PARAM_SLIDER, ParamSlider } from './ParamSlider';

export const LINE_IN_PANEL = { width: 330, top: 92, right: 286 } as const;
const INPUT_GAIN: EffectParamSpec = { id: 'gainDb', label: 'Input gain', min: LINE_IN_GAIN.min, max: LINE_IN_GAIN.max, defaultValue: 0, unit: 'dB', step: 0.5 };
const INNER_WIDTH = LINE_IN_PANEL.width - 24;
const METER_HEIGHT = 6;

export interface LineInPanelProps {
  readonly palette: Palette;
  readonly lineIn: LineIn;
  /** "2. Lead guitar": the track whose effects the input plays through. */
  readonly trackLabel: string;
}

function Row({ palette, label, children }: { readonly palette: Palette; readonly label: string; readonly children: ReactNode }) {
  return (
    <View style={styles.row}>
      <Text style={[styles.label, { color: palette.chromeMuted }]}>{label}</Text>
      <View style={styles.control}>{children}</View>
    </View>
  );
}

/**
 * Tools ▸ Line In: a card over the score (the score stays usable beside it): the input, the track whose effects it
 * plays through — following the selected track, or locked to one ("sound lock") —, input gain, level, monitoring, on/off.
 */
export function LineInPanel({ palette, lineIn, trackLabel }: LineInPanelProps) {
  const isRisky = hasFeedbackRisk(lineIn.devices, lineIn.deviceId);
  const inputs = [{ id: '', name: 'Default' }, ...lineIn.devices.devices];
  return (
    <View style={[styles.card, { backgroundColor: palette.chrome, borderColor: palette.chromeBorder }]}>
      <View style={styles.header}>
        <Text style={[styles.title, { color: palette.chromeText }]}>LINE IN</Text>
        <Text style={[styles.state, { color: lineIn.isOn ? palette.chromeAccent : palette.chromeMuted }]}>{lineIn.isOn ? '● On' : '○ Off'}</Text>
        <ChromeButton palette={palette} label="✕" tooltip="Close the line in (it goes off)" onPress={lineIn.close} />
      </View>
      <Row palette={palette} label="Input">
        {inputs.map((input) => (
          <ChromeButton key={input.id} palette={palette} label={input.name} tooltip={`Play from ${input.name}`} fontSize={11} isActive={lineIn.deviceId === input.id} onPress={() => lineIn.chooseDevice(input.id)} />
        ))}
      </Row>
      {isRisky ? (
        <Text style={[styles.warning, { color: palette.chromeText }]}>
          The Mac’s own microphone hears its own speakers: monitoring would howl. Use headphones or an audio interface.
        </Text>
      ) : null}
      <Row palette={palette} label="Sound of">
        <Text numberOfLines={1} style={[styles.track, { color: palette.chromeText }]}>
          {trackLabel}
        </Text>
        <ChromeButton
          palette={palette}
          label={lineIn.lockedTrackIndex === undefined ? 'Lock' : 'Locked'}
          tooltip={lineIn.lockedTrackIndex === undefined ? 'Keep this track’s sound while you select other tracks' : 'Follow the selected track again'}
          isActive={lineIn.lockedTrackIndex !== undefined}
          onPress={lineIn.toggleLock}
        />
      </Row>
      <ParamSlider palette={palette} spec={INPUT_GAIN} value={lineIn.gainDb} width={INNER_WIDTH - PARAM_SLIDER.labelWidth - PARAM_SLIDER.valueWidth - 8} onChange={lineIn.setGainDb} />
      <View style={[styles.meter, { backgroundColor: palette.chromeBorder }]}>
        <View testID="line-in-level" style={[styles.meterFill, { width: levelFraction(lineIn.levelDb) * INNER_WIDTH, backgroundColor: palette.chromeAccent }]} />
      </View>
      <View style={styles.buttons}>
        <ChromeButton palette={palette} label="Monitor" tooltip="Hear the input through the track’s effects" isActive={lineIn.isMonitoring} onPress={lineIn.toggleMonitoring} />
        <ChromeButton
          palette={palette}
          label={lineIn.isOn ? 'Turn off' : 'Turn on'}
          tooltip={lineIn.isOn ? 'Stop listening to the input' : 'Listen to the input (asks for microphone access the first time)'}
          isActive={lineIn.isOn}
          onPress={lineIn.isOn ? lineIn.turnOff : lineIn.turnOn}
        />
      </View>
      {lineIn.error === undefined ? null : <Text style={[styles.warning, { color: palette.danger }]}>{lineIn.error}</Text>}
    </View>
  );
}

const styles = StyleSheet.create({
  card: { position: 'absolute', top: LINE_IN_PANEL.top, right: LINE_IN_PANEL.right, width: LINE_IN_PANEL.width, padding: 12, borderWidth: 1, borderRadius: 8 },
  header: { flexDirection: 'row', alignItems: 'center', marginBottom: 6 },
  title: { flex: 1, fontSize: 13, fontWeight: '800', letterSpacing: 0.4 },
  state: { fontSize: 11, fontWeight: '700', marginRight: 6 },
  row: { flexDirection: 'row', alignItems: 'center', minHeight: 28 },
  label: { width: 62, fontSize: 11, textAlign: 'right', marginRight: 8 },
  control: { flex: 1, flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center' },
  track: { flex: 1, fontSize: 12, fontWeight: '600' },
  warning: { fontSize: 11, marginVertical: 4 },
  meter: { height: METER_HEIGHT, borderRadius: METER_HEIGHT / 2, marginVertical: 6, overflow: 'hidden' },
  meterFill: { height: METER_HEIGHT },
  buttons: { flexDirection: 'row', justifyContent: 'flex-end' },
});
