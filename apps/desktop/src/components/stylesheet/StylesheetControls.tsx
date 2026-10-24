import type { ReactNode } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import type { Palette } from '../../theme';
import { BarButton } from '../BarButton';

/** One line of the dialog: controls side by side, wrapping. */
export function ControlRow({ children }: { readonly children: ReactNode }) {
  return <View style={styles.row}>{children}</View>;
}

interface LabelProps {
  readonly palette: Palette;
  readonly text: string;
  /** Room before it, when it starts a group further along the row. */
  readonly isSpaced?: boolean;
}

export function ControlLabel({ palette, text, isSpaced = false }: LabelProps) {
  return <Text style={[styles.label, isSpaced ? styles.spaced : null, { color: palette.text }]}>{text}</Text>;
}

/** Room between two groups of a row. */
export function Spacer() {
  return <View style={styles.spaced} />;
}

export function ControlHint({ palette, text }: { readonly palette: Palette; readonly text: string }) {
  return <Text style={[styles.hint, { color: palette.muted }]}>{text}</Text>;
}

interface StepperProps {
  readonly palette: Palette;
  readonly label: string;
  readonly value: string;
  readonly onStep: (delta: -1 | 1) => void;
  readonly isSpaced?: boolean;
}

/** "Label [−] value [+]": each press one step, one undo step. */
export function Stepper({ palette, label, value, onStep, isSpaced = true }: StepperProps) {
  return (
    <>
      <ControlLabel palette={palette} text={label} isSpaced={isSpaced} />
      <BarButton label="−" palette={palette} onPress={() => onStep(-1)} />
      <Text style={[styles.value, { color: palette.text }]}>{value}</Text>
      <BarButton label="+" palette={palette} onPress={() => onStep(1)} />
    </>
  );
}

interface ChoiceProps<T extends string> {
  readonly palette: Palette;
  readonly label: string;
  readonly options: readonly (readonly [T, string])[];
  readonly value: T;
  readonly onChoose: (value: T) => void;
  readonly isSpaced?: boolean;
}

/** "Label [one] [two] [three]": the chosen one lit. */
export function Choice<T extends string>({ palette, label, options, value, onChoose, isSpaced = false }: ChoiceProps<T>) {
  return (
    <>
      <ControlLabel palette={palette} text={label} isSpaced={isSpaced} />
      {options.map(([option, name]) => (
        <BarButton key={option} label={name} palette={palette} isActive={option === value} onPress={() => onChoose(option)} />
      ))}
    </>
  );
}

interface ToggleProps {
  readonly palette: Palette;
  readonly label: string;
  readonly isOn: boolean;
  readonly onToggle: (isOn: boolean) => void;
}

/** A button lit while its option is on. */
export function Toggle({ palette, label, isOn, onToggle }: ToggleProps) {
  return <BarButton label={label} palette={palette} isActive={isOn} onPress={() => onToggle(!isOn)} />;
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', rowGap: 4, marginBottom: 6 },
  label: { fontSize: 12, fontWeight: '600', marginRight: 8 },
  spaced: { marginLeft: 12 },
  hint: { fontSize: 11, marginLeft: 4, marginRight: 8 },
  value: { minWidth: 42, fontSize: 12, fontWeight: '600', textAlign: 'center', marginRight: 4 },
});
