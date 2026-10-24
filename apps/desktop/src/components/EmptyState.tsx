import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { useT } from '../hooks/use-i18n';
import { SCORE_MODES, SCORE_MODE_LABELS, type ScoreMode } from '../score/geometry';
import type { Palette } from '../theme';
import type { ReactNode } from 'react';

interface EmptyStateProps {
  readonly isLoading: boolean;
  readonly palette: Palette;
  readonly onCreate: (mode: ScoreMode) => void;
  readonly onOpen: () => void;
  readonly onImportPdf: () => void;
  /** Recent files (pinned on top), under the buttons. */
  readonly recentFiles?: ReactNode;
  /** Recent PDF import projects, under the recent files. */
  readonly projects?: ReactNode;
}

/** Start screen: a new sheet (score + tab, score or tab) or a Guitar Pro, Power Tab or TablEdit file. */
export function EmptyState({ isLoading, palette, onCreate, onOpen, onImportPdf, recentFiles, projects }: EmptyStateProps) {
  const t = useT();
  if (isLoading) {
    return (
      <View style={styles.empty}>
        <ActivityIndicator />
      </View>
    );
  }
  return (
    <View style={styles.empty}>
      {/* i18n-exempt: the app's name */}
      <Text style={[styles.title, { color: palette.text }]}>GP Editor</Text>
      <Text style={[styles.text, { color: palette.muted }]}>
        {t('window.start.intro')}
      </Text>
      <Text style={[styles.sectionTitle, { color: palette.muted }]}>{t('window.start.newSheet')}</Text>
      <View style={styles.row}>
        {SCORE_MODES.map((mode) => (
          <Pressable key={mode} onPress={() => onCreate(mode)} style={[styles.newButton, { borderColor: palette.accent }]}>
            <Text style={[styles.newButtonText, { color: palette.accent }]}>{SCORE_MODE_LABELS[mode]}</Text>
          </Pressable>
        ))}
      </View>
      <View style={styles.row}>
        <Pressable onPress={onOpen} style={[styles.openButton, { backgroundColor: palette.accent }]}>
          <Text style={[styles.openButtonText, { color: palette.accentText }]}>{t('window.start.open')}</Text>
        </Pressable>
        <Pressable onPress={onImportPdf} style={[styles.openButton, { backgroundColor: palette.accent }]}>
          <Text style={[styles.openButtonText, { color: palette.accentText }]}>{t('window.start.importPdf')}</Text>
        </Pressable>
      </View>
      {recentFiles === undefined ? null : <View style={styles.recentFiles}>{recentFiles}</View>}
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
  recentFiles: { marginTop: 26 },
});
