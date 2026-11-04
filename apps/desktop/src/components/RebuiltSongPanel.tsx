import { useT } from '../hooks/use-i18n';
import type { Palette } from '../theme';
import { ChromeButton } from './chrome/ChromeButton';
import { QuestionGap, QuestionPanel } from './QuestionPanel';

interface RebuiltSongPanelProps {
  readonly palette: Palette;
  /** The edited tab, as its tab names it. */
  readonly name: string;
  /** Show Rebuilt Song: the tab shows the song the import rebuilt, its changes lost. */
  readonly onShow: () => void;
  /** Keep My Changes, Esc and a click outside: the tab stays as it is. */
  readonly onKeep: () => void;
}

/** Asked when a PDF import rebuilt the song an edited tab shows (Resume): show the rebuilt song or keep the changes. */
export function RebuiltSongPanel({ palette, name, onShow, onKeep }: RebuiltSongPanelProps) {
  const t = useT();
  return (
    <QuestionPanel
      palette={palette}
      title={t('window.rebuilt.title', { name })}
      message={t('window.rebuilt.message')}
      accessibilityLabel={t('window.rebuilt.accessibility')}
      onCancel={onKeep}
      backdropTestID="rebuilt-song-backdrop"
    >
      <QuestionGap />
      <ChromeButton palette={palette} label={t('window.rebuilt.keep')} tooltip={t('window.rebuilt.keepTooltip')} minWidth={86} onPress={onKeep} />
      <ChromeButton palette={palette} label={t('window.rebuilt.show')} tooltip={t('window.rebuilt.showTooltip')} minWidth={86} isActive onPress={onShow} />
    </QuestionPanel>
  );
}
