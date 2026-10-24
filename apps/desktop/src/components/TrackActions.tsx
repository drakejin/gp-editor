import { StyleSheet, View } from 'react-native';
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
  const button = (label: string, tooltip: string, onPress: () => void, isEnabled = true) => (
    <ChromeButton palette={palette} label={label} tooltip={tooltip} width={BUTTON_SIZE + 2} height={BUTTON_SIZE} fontSize={11} isEnabled={isEnabled} onPress={onPress} />
  );
  return (
    <View style={styles.actions}>
      <ChromeButton
        testID="tracks-panel-add-track"
        palette={palette}
        label="+ Track"
        tooltip="Add a track (Track ▸ Add Track…, ⌥⌘N)"
        height={BUTTON_SIZE}
        fontSize={10}
        onPress={actions.onAddTrack}
      />
      {button('⧉', 'Duplicate the selected track (Track ▸ Duplicate Track)', () => actions.onDuplicateTrack(selectedTrackIndex))}
      {button('−', 'Delete the selected track (Track ▸ Delete Track, ⌥⌘R)', () => actions.onDeleteTrack(selectedTrackIndex), trackCount > 1)}
      {button('▲', 'Move the selected track up (Track ▸ Move Track Up)', () => actions.onMoveTrack(selectedTrackIndex, selectedTrackIndex - 1), selectedTrackIndex > 0)}
      {button('▼', 'Move the selected track down (Track ▸ Move Track Down)', () => actions.onMoveTrack(selectedTrackIndex, selectedTrackIndex + 1), selectedTrackIndex < trackCount - 1)}
    </View>
  );
}

const styles = StyleSheet.create({
  actions: { flexDirection: 'row', alignItems: 'center', marginRight: 6 },
});
