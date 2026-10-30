import type { ReactNode } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import type { Palette } from '../../theme';
import { TextField } from '../TextField';

// The rows and fields of the AI Wizard's panels (Song Writer, Compose from Here).

export interface WizardRowProps {
  readonly palette: Palette;
  readonly label: string;
  readonly children: ReactNode;
}

/** A labelled row: the label in small capitals on the left, the controls beside it. */
export function WizardRow({ palette, label, children }: WizardRowProps) {
  return (
    <View style={styles.row}>
      <Text style={[styles.label, { color: palette.chromeMuted }]}>{label.toUpperCase()}</Text>
      <View style={styles.field}>{children}</View>
    </View>
  );
}

export interface WizardFieldProps {
  readonly palette: Palette;
  readonly label: string;
  readonly value: string;
  readonly placeholder: string;
  /** Room for this many lines of text; one: a one-line field. */
  readonly lines?: number;
  readonly onChange: (text: string) => void;
}

const LINE_HEIGHT = 16;
const fieldHeight = (lines: number): number => (lines > 1 ? lines * LINE_HEIGHT + 10 : 24);

/** A one-line field, or room for `lines` lines of text. */
export function WizardField({ palette, label, value, placeholder, lines = 1, onChange }: WizardFieldProps) {
  return (
    <TextField
      accessibilityLabel={label}
      value={value}
      onChangeText={onChange}
      placeholder={placeholder}
      placeholderTextColor={palette.chromeMuted}
      multiline={lines > 1}
      style={[styles.input, { height: fieldHeight(lines), color: palette.chromeText, borderColor: palette.chromeBorder, backgroundColor: palette.chromeDeep }]}
    />
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'flex-start', marginBottom: 8 },
  label: { width: 78, fontSize: 10, fontWeight: '800', letterSpacing: 0.6, paddingTop: 6 },
  field: { flex: 1 },
  input: { borderWidth: 1, borderRadius: 5, paddingHorizontal: 7, paddingVertical: 4, fontSize: 12 },
});
