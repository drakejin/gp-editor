import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SHORTCUT_GROUPS, type ShortcutGroup } from '../lib/shortcuts';
import type { Palette } from '../theme';
import { ChromeButton } from './chrome/ChromeButton';

interface ShortcutSheetProps {
  readonly palette: Palette;
  readonly onClose: () => void;
}

/** Help ▸ Keyboard Shortcuts (⌘H): every key the app answers, as a sheet over the window; a click outside closes it. */
export function ShortcutSheet({ palette, onClose }: ShortcutSheetProps) {
  const half = Math.ceil(SHORTCUT_GROUPS.length / 2);
  const columns = [SHORTCUT_GROUPS.slice(0, half), SHORTCUT_GROUPS.slice(half)];
  return (
    <View style={styles.overlay}>
      <Pressable testID="shortcut-sheet-backdrop" style={[StyleSheet.absoluteFill, styles.backdrop]} onPress={onClose} />
      <View style={[styles.sheet, { backgroundColor: palette.chrome, borderColor: palette.chromeBorder }]} accessibilityLabel="Keyboard shortcuts">
        <View style={[styles.header, { borderColor: palette.chromeBorder }]}>
          <Text style={[styles.title, { color: palette.chromeText }]}>Keyboard Shortcuts</Text>
          <ChromeButton palette={palette} label="Done" tooltip="Close the shortcut sheet" onPress={onClose} />
        </View>
        <ScrollView contentContainerStyle={styles.columns}>
          {columns.map((groups, index) => (
            <View key={index} style={styles.column}>
              {groups.map((group) => (
                <GroupView key={group.title} palette={palette} group={group} />
              ))}
            </View>
          ))}
        </ScrollView>
      </View>
    </View>
  );
}

function GroupView({ palette, group }: { readonly palette: Palette; readonly group: ShortcutGroup }) {
  return (
    <View style={styles.group}>
      <Text style={[styles.groupTitle, { color: palette.chromeMuted }]}>{group.title.toUpperCase()}</Text>
      {group.shortcuts.map((shortcut) => (
        <View key={shortcut.keys} style={styles.row}>
          <View style={styles.keys}>
            <Text style={[styles.keyCap, { color: palette.chromeText, backgroundColor: palette.chromeRaised, borderColor: palette.chromeBorder }]}>{shortcut.keys}</Text>
          </View>
          <Text style={[styles.action, { color: palette.chromeText }]}>{shortcut.action}</Text>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  overlay: { ...StyleSheet.absoluteFillObject, alignItems: 'center', justifyContent: 'center' },
  backdrop: { backgroundColor: 'rgba(0, 0, 0, 0.4)' },
  sheet: { width: 820, maxHeight: '88%', borderRadius: 10, borderWidth: 1, overflow: 'hidden' },
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 18, paddingVertical: 10, borderBottomWidth: 1 },
  title: { flex: 1, fontSize: 16, fontWeight: '800' },
  columns: { flexDirection: 'row', paddingHorizontal: 18, paddingVertical: 12, columnGap: 28 },
  column: { flex: 1 },
  group: { marginBottom: 14 },
  groupTitle: { fontSize: 10, fontWeight: '800', letterSpacing: 0.8, marginBottom: 6 },
  row: { flexDirection: 'row', alignItems: 'center', minHeight: 24 },
  keys: { width: 128 },
  keyCap: { alignSelf: 'flex-start', fontSize: 12, fontWeight: '700', paddingHorizontal: 7, paddingVertical: 2, borderRadius: 4, borderWidth: 1, overflow: 'hidden' },
  action: { flex: 1, fontSize: 12 },
});
