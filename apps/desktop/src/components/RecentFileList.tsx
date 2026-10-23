import { StyleSheet, Text, View } from 'react-native';
import { type RecentFile, recentFileFolder } from '../lib/recent-files';
import type { Palette } from '../theme';
import { BarButton } from './BarButton';

interface RecentFileListProps {
  readonly files: readonly RecentFile[];
  readonly palette: Palette;
  /** Above the list (the start screen's "RECENT FILES"). */
  readonly heading?: string;
  /** At most this many files, with a button for all of them (`onShowAll`); every file when absent. */
  readonly limit?: number;
  readonly onOpen: (path: string) => void;
  readonly onTogglePin: (path: string) => void;
  readonly onRemove: (path: string) => void;
  readonly onShowAll?: () => void;
}

interface RecentFileRowProps {
  readonly file: RecentFile;
  readonly palette: Palette;
  readonly onOpen: (path: string) => void;
  readonly onTogglePin: (path: string) => void;
  readonly onRemove: (path: string) => void;
}

/** One file: its name (pinned, missing), its folder, then Open, Pin / Unpin and Remove. */
function RecentFileRow({ file, palette, onOpen, onTogglePin, onRemove }: RecentFileRowProps) {
  const { path, name, isPinned, isMissing } = file;
  return (
    <View style={[styles.item, { borderColor: palette.border }]}>
      <View style={styles.texts}>
        <Text numberOfLines={1} style={[styles.name, { color: isMissing ? palette.muted : palette.text }]}>
          {name}
          {isPinned ? <Text style={[styles.tag, { color: palette.accent }]}> · pinned</Text> : null}
          {isMissing ? <Text style={[styles.tag, { color: palette.danger }]}> · missing</Text> : null}
        </Text>
        <Text numberOfLines={1} ellipsizeMode="middle" style={[styles.folder, { color: palette.muted }]}>
          {recentFileFolder(path)}
        </Text>
      </View>
      <BarButton label="Open" palette={palette} isAccent isEnabled={!isMissing} onPress={() => onOpen(path)} />
      <BarButton label={isPinned ? 'Unpin' : 'Pin'} palette={palette} onPress={() => onTogglePin(path)} />
      <BarButton label="Remove" palette={palette} onPress={() => onRemove(path)} />
    </View>
  );
}

/** Recent files (pinned on top): open one, pin or unpin it, remove it. Nothing when there are none. */
export function RecentFileList({ files, palette, heading, limit, onOpen, onTogglePin, onRemove, onShowAll }: RecentFileListProps) {
  if (files.length === 0) {
    return null;
  }
  const shown = limit === undefined ? files : files.slice(0, limit);
  return (
    <View style={styles.container}>
      {heading === undefined ? null : <Text style={[styles.heading, { color: palette.muted }]}>{heading}</Text>}
      {shown.map((file) => (
        <RecentFileRow key={file.path} file={file} palette={palette} onOpen={onOpen} onTogglePin={onTogglePin} onRemove={onRemove} />
      ))}
      {shown.length < files.length && onShowAll !== undefined ? (
        <View style={styles.more}>
          <BarButton label={`All ${files.length} Recent Files…`} palette={palette} onPress={onShowAll} />
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { width: 560, maxWidth: '100%' },
  heading: { fontSize: 10, fontWeight: '700', letterSpacing: 0.8, marginBottom: 6, textAlign: 'center' },
  item: { flexDirection: 'row', alignItems: 'center', paddingVertical: 6, borderBottomWidth: StyleSheet.hairlineWidth },
  texts: { flex: 1, marginRight: 8 },
  name: { fontSize: 13, fontWeight: '600' },
  tag: { fontSize: 11, fontWeight: '600' },
  folder: { fontSize: 11, marginTop: 1 },
  more: { alignItems: 'center', marginTop: 8 },
});
