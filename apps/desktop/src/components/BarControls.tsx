import type { ReactNode } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import type { Palette } from '../theme';
import { BarButton } from './BarButton';

/** Default room for a stepper's value between its − and + buttons. */
const STEPPER_LABEL_WIDTH = 34;

export interface StepperProps {
  readonly label: string;
  readonly palette: Palette;
  readonly isEnabled: boolean;
  /** Fixed room for the value, wide enough for its longest text, so − and + stay put while it changes. */
  readonly labelWidth?: number;
  readonly onMinus: () => void;
  readonly onPlus: () => void;
}

/** − value + control of the edit and transport bars. */
export function Stepper({ label, palette, isEnabled, labelWidth = STEPPER_LABEL_WIDTH, onMinus, onPlus }: StepperProps) {
  return (
    <View style={styles.stepper}>
      <BarButton label="−" palette={palette} isEnabled={isEnabled} onPress={onMinus} />
      <Text numberOfLines={1} style={[styles.stepperLabel, { color: palette.text, width: labelWidth }]}>
        {label}
      </Text>
      <BarButton label="+" palette={palette} isEnabled={isEnabled} onPress={onPlus} />
    </View>
  );
}

export interface GroupProps {
  readonly title: string;
  readonly palette: Palette;
  readonly children: ReactNode;
}

/** Titled group of controls in the edit and transport bars. */
export function Group({ title, palette, children }: GroupProps) {
  return (
    <View style={styles.group}>
      <Text style={[styles.groupTitle, { color: palette.muted }]}>{title}</Text>
      <View style={styles.groupButtons}>{children}</View>
    </View>
  );
}

const styles = StyleSheet.create({
  group: { marginRight: 16, marginTop: 4 },
  groupTitle: { fontSize: 9, fontWeight: '700', letterSpacing: 0.8, marginBottom: 3, textTransform: 'uppercase' },
  groupButtons: { flexDirection: 'row', alignItems: 'center' },
  stepper: { flexDirection: 'row', alignItems: 'center', marginRight: 6 },
  stepperLabel: { fontSize: 12, fontWeight: '600', marginRight: 4, textAlign: 'center' },
});
