import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { SCORE_MODES, SCORE_MODE_LABELS, type ScoreMode } from '../score/geometry';
import type { Palette } from '../theme';
import type { ReactNode } from 'react';

interface EmptyStateProps {
  readonly isLoading: boolean;
  readonly palette: Palette;
  readonly onCreate: (mode: ScoreMode) => void;
  readonly onOpen: () => void;
  readonly onImportPdf: () => void;
  /** Recent PDF import projects, under the buttons. */
  readonly projects?: ReactNode;
}

/** Start screen: a new sheet (score + tab, score or tab) or a Guitar Pro, Power Tab or TablEdit file. */
export function EmptyState({ isLoading, palette, onCreate, onOpen, onImportPdf, projects }: EmptyStateProps) {
  if (isLoading) {
    return (
      <View style={styles.empty}>
        <ActivityIndicator />
      </View>
    );
  }
  return (
    <View style={styles.empty}>
      <Text style={[styles.title, { color: palette.text }]}>GP Editor</Text>
      <Text style={[styles.text, { color: palette.muted }]}>
        Start a new sheet, import a PDF of sheet music or tab, or open a Guitar Pro file — .gp (7/8), .gpx (6), .gp5, .gp4, .gp3, .gtp (1/2) —,{'\n'}a
        Power Tab (.ptb) or a TablEdit (.tef) file, or drop one onto this window.
      </Text>
      <Text style={[styles.sectionTitle, { color: palette.muted }]}>NEW SHEET (⌘N)</Text>
      <View style={styles.row}>
        {SCORE_MODES.map((mode) => (
          <Pressable key={mode} onPress={() => onCreate(mode)} style={[styles.newButton, { borderColor: palette.accent }]}>
            <Text style={[styles.newButtonText, { color: palette.accent }]}>{SCORE_MODE_LABELS[mode]}</Text>
          </Pressable>
        ))}
      </View>
      <View style={styles.row}>
        <Pressable onPress={onOpen} style={[styles.openButton, { backgroundColor: palette.accent }]}>
          <Text style={[styles.openButtonText, { color: palette.accentText }]}>Open File… (⌘O)</Text>
        </Pressable>
        <Pressable onPress={onImportPdf} style={[styles.openButton, { backgroundColor: palette.accent }]}>
          <Text style={[styles.openButtonText, { color: palette.accentText }]}>Import PDF… (⇧⌘I)</Text>
        </Pressable>
      </View>
      {projects}
    </View>
  );
}

const styles = StyleSheet.create({
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  title: { fontSize: 28, fontWeight: '800' },
  text: { fontSize: 13, textAlign: 'center', marginTop: 10, lineHeight: 20 },
  sectionTitle: { fontSize: 10, fontWeight: '700', letterSpacing: 0.8, marginTop: 24 },
  row: { flexDirection: 'row', marginTop: 8 },
  newButton: { marginHorizontal: 5, paddingHorizontal: 16, paddingVertical: 8, borderRadius: 8, borderWidth: 1.5 },
  newButtonText: { fontSize: 14, fontWeight: '700' },
  openButton: { marginTop: 20, marginHorizontal: 5, paddingHorizontal: 18, paddingVertical: 9, borderRadius: 8 },
  openButtonText: { fontSize: 14, fontWeight: '700' },
});
