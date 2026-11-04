import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useT } from '../hooks/use-i18n';
import { type Palette, STRIP_COLORS } from '../theme';


interface HintBarProps {
  readonly palette: Palette;
  readonly message: string;
  /** A click dismisses it; without, it is a label laid over the window (a note being dragged), the clicks going through. */
  readonly onDismiss?: () => void;
}

/** Why the last edit did nothing, under the tab strip; a click dismisses it. Or what a note being dragged will do. */
export function HintBar({ palette, message, onDismiss }: HintBarProps) {
  const t = useT();
  if (onDismiss === undefined) {
    return (
      // No alert role: it changes at every semitone of the drag, which a screen reader would announce each time.
      <View pointerEvents="none" style={[styles.bar, styles.floating, { borderColor: palette.chromeBorder }]}>
        <Text style={styles.text}>{message}</Text>
      </View>
    );
  }
  return (
    <Pressable onPress={onDismiss} tooltip={t('common.dismiss')} accessibilityRole="alert" style={[styles.bar, { borderColor: palette.chromeBorder }]}>
      <Text style={styles.text}>{message}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  bar: { backgroundColor: STRIP_COLORS.hintBackground, paddingHorizontal: 14, paddingVertical: 5, borderBottomWidth: 1 },
  /** Low enough for the tab strip it is laid over. */
  floating: { borderWidth: 1, borderRadius: 4, paddingVertical: 3 },
  text: { color: STRIP_COLORS.hintText, fontSize: 12, fontWeight: '600' },
});
