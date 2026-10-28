import { StyleSheet, Text, View } from 'react-native';
import { DEFAULT_GATE_DB, SILENCE_DB } from '@gp-editor/core';
import { useT } from '../../hooks/use-i18n';
import { IN_TUNE_CENTS, isInTune, levelFraction, needleFraction } from '../../lib/tuner-display';
import type { Palette } from '../../theme';

/** The tuner's "in tune" green, on the dark chrome. */
export const IN_TUNE_COLOR = '#4CD964';
/** The needle and note while out of tune. */
export const OUT_OF_TUNE_COLOR = '#F5A623';

const TICKS: readonly number[] = [-50, -25, 0, 25, 50];
const TICK_LABEL_WIDTH = 32;

function percent(fraction: number): `${number}%` {
  return `${fraction * 100}%`;
}

function tickLabel(cents: number): string {
  return cents > 0 ? `+${cents}` : cents < 0 ? `−${-cents}` : '0';
}

interface CentsNeedleProps {
  readonly palette: Palette;
  /** Cents off the nearest note; no needle when undefined. */
  readonly cents?: number;
}

/** A strip from -50 to +50 cents: the in-tune zone in green around 0, the ticks, and the needle. */
export function CentsNeedle({ palette, cents }: CentsNeedleProps) {
  const t = useT();
  const zone = needleFraction(IN_TUNE_CENTS) - needleFraction(-IN_TUNE_CENTS);
  return (
    <View>
      <View style={[styles.strip, { backgroundColor: palette.chromeDeep, borderColor: palette.chromeBorder }]} accessibilityLabel={t('tools.tuner.centsStrip')}>
        <View style={[styles.zone, { left: percent(needleFraction(-IN_TUNE_CENTS)), width: percent(zone) }]} />
        {TICKS.map((tick) => (
          <View key={tick} style={[tick === 0 ? styles.centreTick : styles.tick, { left: percent(needleFraction(tick)), backgroundColor: palette.chromeMuted }]} />
        ))}
        {cents === undefined ? null : (
          <View
            testID="tuner-needle"
            style={[styles.needle, { left: percent(needleFraction(cents)), backgroundColor: isInTune(cents) ? IN_TUNE_COLOR : OUT_OF_TUNE_COLOR }]}
          />
        )}
      </View>
      <View style={styles.tickLabels}>
        {TICKS.map((tick) => (
          <Text key={tick} style={[styles.tickLabel, { left: percent(needleFraction(tick)), color: palette.chromeMuted }]}>
            {tickLabel(tick)}
          </Text>
        ))}
      </View>
    </View>
  );
}

interface LevelMeterProps {
  readonly palette: Palette;
  readonly levelDb: number;
}

/** The input level, -60 … 0 dBFS, lit green over the noise gate; the gate is a tick. */
export function LevelMeter({ palette, levelDb }: LevelMeterProps) {
  const t = useT();
  const isOverGate = levelDb >= DEFAULT_GATE_DB;
  const text = levelDb <= SILENCE_DB ? '– dB' : `${Math.round(levelDb)} dB`;
  return (
    <View style={styles.meterRow} accessibilityLabel={t('tools.tuner.inputLevel', { level: text })}>
      <View style={[styles.meter, { backgroundColor: palette.chromeDeep, borderColor: palette.chromeBorder }]}>
        <View style={[styles.fill, { width: percent(levelFraction(levelDb)), backgroundColor: isOverGate ? IN_TUNE_COLOR : palette.chromeMuted }]} />
        <View style={[styles.gate, { left: percent(levelFraction(DEFAULT_GATE_DB)), backgroundColor: palette.chromeText }]} />
      </View>
      <Text style={[styles.level, { color: palette.chromeMuted }]}>{text}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  strip: { height: 40, borderRadius: 6, borderWidth: 1, overflow: 'hidden' },
  zone: { position: 'absolute', top: 0, bottom: 0, backgroundColor: 'rgba(76, 217, 100, 0.22)' },
  tick: { position: 'absolute', top: 28, bottom: 0, width: 1, marginLeft: -0.5 },
  centreTick: { position: 'absolute', top: 0, bottom: 0, width: 1, marginLeft: -0.5 },
  needle: { position: 'absolute', top: 2, bottom: 2, width: 4, marginLeft: -2, borderRadius: 2 },
  tickLabels: { height: 14, marginTop: 3 },
  tickLabel: { position: 'absolute', width: TICK_LABEL_WIDTH, marginLeft: -TICK_LABEL_WIDTH / 2, textAlign: 'center', fontSize: 10, fontWeight: '600' },
  meterRow: { flex: 1, flexDirection: 'row', alignItems: 'center', columnGap: 8 },
  meter: { flex: 1, height: 8, borderRadius: 4, borderWidth: 1, overflow: 'hidden' },
  fill: { position: 'absolute', left: 0, top: 0, bottom: 0 },
  gate: { position: 'absolute', top: 0, bottom: 0, width: 1 },
  level: { width: 56, fontSize: 11, textAlign: 'right' },
});
