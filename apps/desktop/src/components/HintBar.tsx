import { Pressable, StyleSheet, Text } from 'react-native';
import type { Palette } from '../theme';

const HINT_BACKGROUND = '#4A3B12';
const HINT_TEXT = '#FFE08A';

interface HintBarProps {
  readonly palette: Palette;
  readonly message: string;
  readonly onDismiss: () => void;
}

/** Why the last edit did nothing, under the document tab; a click dismisses it. */
export function HintBar({ palette, message, onDismiss }: HintBarProps) {
  return (
    <Pressable onPress={onDismiss} tooltip="Dismiss" accessibilityRole="alert" style={[styles.bar, { borderColor: palette.chromeBorder }]}>
      <Text style={styles.text}>{message}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  bar: { backgroundColor: HINT_BACKGROUND, paddingHorizontal: 14, paddingVertical: 5, borderBottomWidth: 1 },
  text: { color: HINT_TEXT, fontSize: 12, fontWeight: '600' },
});
