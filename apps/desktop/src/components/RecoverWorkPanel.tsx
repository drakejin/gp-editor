import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { AUTOSAVE_KEEP_DAYS, timeLabel } from '../autosave/autosave-days';
import type { AutosavedWork } from '../autosave/autosave-recovery';
import { type Translate, useT } from '../hooks/use-i18n';
import type { RecoveryMode } from '../hooks/use-autosave-recovery';
import type { Palette } from '../theme';
import { ChromeButton } from './chrome/ChromeButton';
import { QuestionGap, QuestionPanel } from './QuestionPanel';

/** The list's height before it scrolls (about five documents). */
const LIST_MAX_HEIGHT = 220;

export interface RecoverWorkPanelProps {
  readonly palette: Palette;
  /** `launch`: the question after a session ended with unsaved work; `list`: File ▸ Recover Autosaved Work…. */
  readonly mode: RecoveryMode;
  readonly works: readonly AutosavedWork[];
  /** False where nothing is autosaved (Windows, for now): the empty list says so. */
  readonly isAvailable: boolean;
  readonly onRestoreAll: () => void;
  readonly onRestore: (documentId: string) => void;
  readonly onDecline: () => void;
  /** Esc, a click outside, Close: nothing answered. */
  readonly onClose: () => void;
  readonly onShowFolder: () => void;
}

/** A document's line under its title: its file (Untitled for a new song) and when it was autosaved. */
function detailOf(work: AutosavedWork, t: Translate): string {
  const { fileName, savedAt } = work.newest.manifest;
  return `${fileName} · ${t('window.recover.savedAt', { time: timeLabel(new Date(savedAt)) })}`;
}

interface WorkRowProps {
  readonly palette: Palette;
  readonly work: AutosavedWork;
  /** In the list: its own Restore button. */
  readonly onRestore?: (documentId: string) => void;
}

function WorkRow({ palette, work, onRestore }: WorkRowProps) {
  const t = useT();
  return (
    <View style={[styles.row, { borderColor: palette.chromeBorder }]}>
      <View style={styles.texts}>
        <Text numberOfLines={1} style={[styles.title, { color: palette.chromeText }]}>
          {work.newest.manifest.title}
        </Text>
        <Text numberOfLines={1} style={[styles.detail, { color: palette.chromeMuted }]}>
          {detailOf(work, t)}
        </Text>
      </View>
      {onRestore === undefined ? null : (
        <ChromeButton palette={palette} label={t('window.recover.restore')} tooltip={t('window.recover.restoreOneTooltip')} minWidth={64} onPress={() => onRestore(work.documentId)} />
      )}
    </View>
  );
}

function WorkList({ palette, works, isAvailable, onRestore }: Pick<RecoverWorkPanelProps, 'palette' | 'works' | 'isAvailable'> & { readonly onRestore?: (documentId: string) => void }) {
  const t = useT();
  if (works.length === 0) {
    const empty = isAvailable ? t('window.recover.empty', { days: AUTOSAVE_KEEP_DAYS }) : t('window.recover.notOnWindows');
    return <Text style={[styles.empty, { color: palette.chromeMuted }]}>{empty}</Text>;
  }
  return (
    <ScrollView style={styles.list}>
      {works.map((work) => (
        <WorkRow key={work.documentId} palette={palette} work={work} onRestore={onRestore} />
      ))}
    </ScrollView>
  );
}

/**
 * The work autosave kept, over the window: at launch, the question about the work a session left unsaved (Restore /
 * Don't Restore, as SaveChangesPanel asks); from File ▸ Recover Autosaved Work…, the list to restore one at a time.
 */
export function RecoverWorkPanel(props: RecoverWorkPanelProps) {
  const { palette, mode, works, isAvailable, onRestoreAll, onRestore, onDecline, onClose, onShowFolder } = props;
  const t = useT();
  const isLaunch = mode === 'launch';
  return (
    <QuestionPanel
      palette={palette}
      title={isLaunch ? t('window.recover.title') : t('window.recover.listTitle')}
      message={isLaunch ? t('window.recover.message') : t('window.recover.listMessage', { days: AUTOSAVE_KEEP_DAYS })}
      accessibilityLabel={t('window.recover.accessibility')}
      onCancel={onClose}
      backdropTestID="recover-work-backdrop"
      body={<WorkList palette={palette} works={works} isAvailable={isAvailable} onRestore={isLaunch ? undefined : onRestore} />}
    >
      {isLaunch ? (
        <>
          <ChromeButton palette={palette} label={t('window.recover.decline')} tooltip={t('window.recover.declineTooltip')} minWidth={86} onPress={onDecline} />
          <QuestionGap />
          <ChromeButton palette={palette} label={t('window.recover.restore')} tooltip={t('window.recover.restoreTooltip')} minWidth={86} isActive onPress={onRestoreAll} />
        </>
      ) : (
        <>
          <ChromeButton palette={palette} label={t('window.recover.showFolder')} tooltip={t('window.recover.showFolderTooltip')} minWidth={86} isEnabled={isAvailable} onPress={onShowFolder} />
          <QuestionGap />
          <ChromeButton palette={palette} label={t('common.close')} tooltip={t('window.recover.closeTooltip')} minWidth={72} isActive onPress={onClose} />
        </>
      )}
    </QuestionPanel>
  );
}

const styles = StyleSheet.create({
  list: { maxHeight: LIST_MAX_HEIGHT, marginTop: 10 },
  row: { flexDirection: 'row', alignItems: 'center', paddingVertical: 5, borderTopWidth: StyleSheet.hairlineWidth, columnGap: 8 },
  texts: { flex: 1 },
  title: { fontSize: 12, fontWeight: '700' },
  detail: { fontSize: 11, marginTop: 1 },
  empty: { fontSize: 12, marginTop: 10 },
});
