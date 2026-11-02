import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useT } from '../hooks/use-i18n';
import type { Palette } from '../theme';
import { ChromeButton } from './chrome/ChromeButton';

interface SaveChangesPanelProps {
  readonly palette: Palette;
  /** The tab being closed, as its tab names it. */
  readonly name: string;
  /** Asked while the app quits (⌘Q, the window's close button): the texts say so. */
  readonly isQuitting?: boolean;
  readonly onSave: () => void;
  readonly onDiscard: () => void;
  /** Cancel, and a click outside the panel: the tab stays open. */
  readonly onCancel: () => void;
}

/** Asked before an edited tab closes (its ×, File ▸ Close Tab, the app quitting): a small dark panel over the window. */
export function SaveChangesPanel({ palette, name, isQuitting = false, onSave, onDiscard, onCancel }: SaveChangesPanelProps) {
  const t = useT();
  const texts = isQuitting
    ? { message: t('window.saveChanges.quitMessage'), discard: t('window.saveChanges.quitDiscardTooltip'), cancel: t('window.saveChanges.quitCancelTooltip'), save: t('window.saveChanges.quitSaveTooltip') }
    : { message: t('window.saveChanges.message'), discard: t('window.saveChanges.discardTooltip'), cancel: t('window.saveChanges.cancelTooltip'), save: t('window.saveChanges.saveTooltip') };
  return (
    <View style={styles.overlay}>
      <Pressable testID="save-changes-backdrop" style={[StyleSheet.absoluteFill, styles.backdrop]} onPress={onCancel} />
      <View style={[styles.panel, { backgroundColor: palette.chrome, borderColor: palette.chromeBorder }]} accessibilityLabel={t('window.saveChanges.accessibility')}>
        <Text style={[styles.title, { color: palette.chromeText }]}>{t('window.saveChanges.title', { name })}</Text>
        <Text style={[styles.message, { color: palette.chromeMuted }]}>{texts.message}</Text>
        <View style={styles.buttons}>
          <ChromeButton palette={palette} label={t('window.saveChanges.discard')} tooltip={texts.discard} minWidth={86} onPress={onDiscard} />
          <View style={styles.gap} />
          <ChromeButton palette={palette} label={t('common.cancel')} tooltip={texts.cancel} minWidth={72} onPress={onCancel} />
          <ChromeButton palette={palette} label={t('common.save')} tooltip={texts.save} minWidth={72} isActive onPress={onSave} />
        </View>
      </View>
    </View>
  );
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
