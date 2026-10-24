import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { useT } from '../hooks/use-i18n';
import { MAX_RECENT_FILES, type RecentFile } from '../lib/recent-files';
import type { Palette } from '../theme';
import { BarButton } from './BarButton';
import { RecentFileList } from './RecentFileList';

interface RecentFilesPanelProps {
  readonly files: readonly RecentFile[];
  readonly palette: Palette;
  readonly onOpen: (path: string) => void;
  readonly onTogglePin: (path: string) => void;
  readonly onRemove: (path: string) => void;
  /** Every unpinned file goes. */
  readonly onClear: () => void;
  readonly onClose: () => void;
}

/** Room for about ten files; the rest scroll. */
const LIST_HEIGHT = 360;

/**
 * File ▸ Recent Files…: every recent file (the ones File ▸ Open Recent lists), pinned files on top. Pin keeps a file
 * in the list whatever is opened after it; a file that cannot be found any more shows as missing until removed.
 */
export function RecentFilesPanel({ files, palette, onOpen, onTogglePin, onRemove, onClear, onClose }: RecentFilesPanelProps) {
  const hasUnpinned = files.some((file) => !file.isPinned);
  const t = useT();
  return (
    <View style={[styles.container, { backgroundColor: palette.sidebar, borderColor: palette.border }]}>
      <View style={styles.row}>
        <Text style={[styles.title, { color: palette.text }]}>{t('window.recentFiles.title')}</Text>
        <Text style={[styles.hint, { color: palette.muted }]}>
          {t('window.recentFiles.hint', { count: MAX_RECENT_FILES })}
        </Text>
      </View>
      {files.length === 0 ? (
        <Text style={[styles.empty, { color: palette.muted }]}>{t('window.recentFiles.empty')}</Text>
      ) : (
        <ScrollView style={styles.list}>
          <RecentFileList files={files} palette={palette} onOpen={onOpen} onTogglePin={onTogglePin} onRemove={onRemove} />
        </ScrollView>
      )}
      <View style={[styles.row, styles.buttons]}>
        <BarButton label={t('window.recentFiles.clearUnpinned')} palette={palette} isEnabled={hasUnpinned} onPress={onClear} />
        <BarButton label={t('common.close')} palette={palette} onPress={onClose} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { paddingHorizontal: 16, paddingTop: 10, paddingBottom: 4, borderBottomWidth: StyleSheet.hairlineWidth },
  row: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', rowGap: 4, marginBottom: 8 },
  buttons: { marginTop: 8 },
  title: { fontSize: 13, fontWeight: '700', marginRight: 12 },
  hint: { fontSize: 11, marginLeft: 4, marginRight: 8 },
  empty: { fontSize: 12, marginBottom: 4 },
  list: { maxHeight: LIST_HEIGHT },
});
