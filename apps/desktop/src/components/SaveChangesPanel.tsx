import { Pressable, StyleSheet, Text, View } from 'react-native';
import type { Palette } from '../theme';
import { ChromeButton } from './chrome/ChromeButton';

interface SaveChangesPanelProps {
  readonly palette: Palette;
  /** The tab being closed, as its tab names it. */
  readonly name: string;
  readonly onSave: () => void;
  readonly onDiscard: () => void;
  /** Cancel, and a click outside the panel: the tab stays open. */
  readonly onCancel: () => void;
}

/** Asked before an edited tab closes (its ×, File ▸ Close Tab): a small dark panel over the window. */
export function SaveChangesPanel({ palette, name, onSave, onDiscard, onCancel }: SaveChangesPanelProps) {
  return (
    <View style={styles.overlay}>
      <Pressable testID="save-changes-backdrop" style={[StyleSheet.absoluteFill, styles.backdrop]} onPress={onCancel} />
      <View style={[styles.panel, { backgroundColor: palette.chrome, borderColor: palette.chromeBorder }]} accessibilityLabel="Save changes">
        <Text style={[styles.title, { color: palette.chromeText }]}>{`Save changes to “${name}”?`}</Text>
        <Text style={[styles.message, { color: palette.chromeMuted }]}>Your changes will be lost if you don’t save them.</Text>
        <View style={styles.buttons}>
          <ChromeButton palette={palette} label="Don’t Save" tooltip="Close the tab without saving" minWidth={86} onPress={onDiscard} />
          <View style={styles.gap} />
          <ChromeButton palette={palette} label="Cancel" tooltip="Keep the tab open (Esc)" minWidth={72} onPress={onCancel} />
          <ChromeButton palette={palette} label="Save" tooltip="Save, then close the tab" minWidth={72} isActive onPress={onSave} />
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
