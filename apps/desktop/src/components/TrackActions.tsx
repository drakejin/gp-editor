import { StyleSheet, View } from 'react-native';
import { useT } from '../hooks/use-i18n';
import type { TrackPanelActions } from '../hooks/use-track-manager';
import type { Palette } from '../theme';
import { ChromeButton } from './chrome/ChromeButton';

interface TrackActionsProps {
  readonly palette: Palette;
  readonly trackCount: number;
  /** The track the buttons act on: the one shown in the score. */
  readonly selectedTrackIndex: number;
  readonly actions: TrackPanelActions;
}

/** Height of the buttons: the sections band's. */
const BUTTON_SIZE = 18;

/**
 * The tracks panel's track buttons (Guitar Pro 8's + of the Global View and its ▲ ▼): add a track, duplicate, delete,
 * move up and down the selected one — what the Track menu does.
 */
export function TrackActions({ palette, trackCount, selectedTrackIndex, actions }: TrackActionsProps) {
  const t = useT();
  const button = (label: string, tooltip: string, onPress: () => void, isEnabled = true) => (
    <ChromeButton palette={palette} label={label} tooltip={tooltip} width={BUTTON_SIZE + 2} height={BUTTON_SIZE} fontSize={11} isEnabled={isEnabled} onPress={onPress} />
  );
  return (
    <View style={styles.actions}>
      <ChromeButton
        testID="tracks-panel-add-track"
        palette={palette}
        label={t('window.trackActions.add')}
        tooltip={t('window.trackActions.addTooltip')}
        height={BUTTON_SIZE}
        fontSize={10}
        onPress={actions.onAddTrack}
      />
      {button('⧉', t('window.trackActions.duplicate'), () => actions.onDuplicateTrack(selectedTrackIndex))}
      {button('−', t('window.trackActions.delete'), () => actions.onDeleteTrack(selectedTrackIndex), trackCount > 1)}
      {button('▲', t('window.trackActions.moveUp'), () => actions.onMoveTrack(selectedTrackIndex, selectedTrackIndex - 1), selectedTrackIndex > 0)}
      {button('▼', t('window.trackActions.moveDown'), () => actions.onMoveTrack(selectedTrackIndex, selectedTrackIndex + 1), selectedTrackIndex < trackCount - 1)}
    </View>
  );
}

const styles = StyleSheet.create({
  actions: { flexDirection: 'row', alignItems: 'center', marginRight: 6 },
});
