import { Pressable, StyleSheet, Text, View } from 'react-native';
import type { Palette } from '../theme';
import { ChromeButton } from './chrome/ChromeButton';

interface DeleteTrackPanelProps {
  readonly palette: Palette;
  /** "2. Bass": the track as the tracks panel names it. */
  readonly trackLabel: string;
  readonly onDelete: () => void;
  /** Cancel, Esc and a click outside: the track stays. */
  readonly onCancel: () => void;
}

/** Asked before a track with notes is deleted (Track ▸ Delete Track, the tracks panel's −): a small dark panel. */
export function DeleteTrackPanel({ palette, trackLabel, onDelete, onCancel }: DeleteTrackPanelProps) {
  return (
    <View style={styles.overlay}>
      <Pressable testID="delete-track-backdrop" style={[StyleSheet.absoluteFill, styles.backdrop]} onPress={onCancel} />
      <View style={[styles.panel, { backgroundColor: palette.chrome, borderColor: palette.chromeBorder }]} accessibilityLabel="Delete track">
        <Text style={[styles.title, { color: palette.chromeText }]}>{`Delete track “${trackLabel}”?`}</Text>
        <Text style={[styles.message, { color: palette.chromeMuted }]}>Its notes go with it. Edit ▸ Undo (⌘Z) brings it back.</Text>
        <View style={styles.buttons}>
          <View style={styles.gap} />
          <ChromeButton palette={palette} label="Cancel" tooltip="Keep the track (Esc)" minWidth={72} onPress={onCancel} />
          <ChromeButton palette={palette} label="Delete" tooltip="Delete the track and its notes" minWidth={72} isActive onPress={onDelete} />
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
