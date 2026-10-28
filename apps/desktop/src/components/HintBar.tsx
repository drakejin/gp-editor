import { Pressable, StyleSheet, Text } from 'react-native';
import { useT } from '../hooks/use-i18n';
import { type Palette, STRIP_COLORS } from '../theme';


interface HintBarProps {
  readonly palette: Palette;
  readonly message: string;
  readonly onDismiss: () => void;
}

/** Why the last edit did nothing, under the tab strip; a click dismisses it. */
export function HintBar({ palette, message, onDismiss }: HintBarProps) {
  const t = useT();
  return (
    <Pressable onPress={onDismiss} tooltip={t('common.dismiss')} accessibilityRole="alert" style={[styles.bar, { borderColor: palette.chromeBorder }]}>
      <Text style={styles.text}>{message}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  bar: { backgroundColor: STRIP_COLORS.hintBackground, paddingHorizontal: 14, paddingVertical: 5, borderBottomWidth: 1 },
  text: { color: STRIP_COLORS.hintText, fontSize: 12, fontWeight: '600' },
});
