import type { ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import type { Palette } from '../theme';

interface QuestionPanelProps {
  readonly palette: Palette;
  readonly title: string;
  readonly message: string;
  readonly accessibilityLabel: string;
  /** A click outside the panel: the answer that changes nothing. */
  readonly onCancel: () => void;
  readonly backdropTestID: string;
  /** The answers, left to right (`QuestionGap` pushes the later ones right). */
  readonly children: ReactNode;
}

/** A question over the window (an edited tab closing, a rebuilt file): a small dark panel over a dimmed backdrop. */
export function QuestionPanel({ palette, title, message, accessibilityLabel, onCancel, backdropTestID, children }: QuestionPanelProps) {
  return (
    <View style={styles.overlay}>
      <Pressable testID={backdropTestID} style={[StyleSheet.absoluteFill, styles.backdrop]} onPress={onCancel} />
      <View style={[styles.panel, { backgroundColor: palette.chrome, borderColor: palette.chromeBorder }]} accessibilityLabel={accessibilityLabel}>
        <Text style={[styles.title, { color: palette.chromeText }]}>{title}</Text>
        <Text style={[styles.message, { color: palette.chromeMuted }]}>{message}</Text>
        <View style={styles.buttons}>{children}</View>
      </View>
    </View>
  );
}

/** Between the answers on the left and those on the right. */
export function QuestionGap() {
  return <View style={styles.gap} />;
}

const styles = StyleSheet.create({
  overlay: { ...StyleSheet.absoluteFillObject, alignItems: 'center', justifyContent: 'center' },
  backdrop: { backgroundColor: 'rgba(0, 0, 0, 0.3)' },
  panel: { width: 400, borderRadius: 10, borderWidth: 1, paddingHorizontal: 18, paddingTop: 16, paddingBottom: 12 },
  title: { fontSize: 14, fontWeight: '800' },
  message: { fontSize: 12, marginTop: 6 },
  buttons: { flexDirection: 'row', alignItems: 'center', marginTop: 16, columnGap: 6 },
  gap: { flex: 1 },
});
