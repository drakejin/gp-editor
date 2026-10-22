import { Pressable, StyleSheet, Text } from 'react-native';
import type { Palette } from '../theme';

interface BarButtonProps {
  readonly label: string;
  readonly palette: Palette;
  readonly onPress: () => void;
  readonly isEnabled?: boolean;
  readonly isActive?: boolean;
  readonly isAccent?: boolean;
}

/** Button of the toolbar and the edit bar. */
export function BarButton({ label, palette, onPress, isEnabled = true, isActive = false, isAccent = false }: BarButtonProps) {
  return (
    <Pressable
      disabled={!isEnabled}
      onPress={onPress}
      style={[styles.button, { borderColor: palette.border, opacity: isEnabled ? 1 : 0.4 }, isActive ? { backgroundColor: palette.selection } : null]}
    >
      <Text style={[styles.label, { color: isAccent ? palette.accent : palette.text }]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: { paddingHorizontal: 9, paddingVertical: 4, borderWidth: StyleSheet.hairlineWidth, borderRadius: 5, marginRight: 4 },
  label: { fontSize: 12, fontWeight: '600' },
});
