import type { ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useT } from '../hooks/use-i18n';
import type { Palette } from '../theme';
import { TRACK_TABLE } from './TrackMixerRow';

/** The footer's height in points: the chrome's 18-point buttons with room above and below. */
export const TRACKS_FOOTER_HEIGHT = 24;

export interface TracksPanelFooterProps {
  readonly palette: Palette;
  /** The track buttons (+ Track, duplicate, delete, move up / down) and the cursor's track's bar buttons. */
  readonly trackActions?: ReactNode;
  /** Guitar Pro's "Audio track" button (the song has none yet). */
  readonly onAddAudioTrack?: () => void;
}

/**
 * Under the tracks and the bar map, outside their scroll: the track and bar buttons and "+ Audio Track" show with any
 * number of tracks, and when the panel gives way to a panel over the score (down to TRACKS_PANEL.minHeight).
 */
export function TracksPanelFooter({ palette, trackActions, onAddAudioTrack }: TracksPanelFooterProps) {
  const t = useT();
  return (
    <View testID="tracks-panel-footer" style={[styles.footer, { backgroundColor: palette.chromeDeep, borderTopColor: palette.chromeBorder }]}>
      {trackActions}
      {onAddAudioTrack === undefined ? null : (
        <Pressable
          testID="tracks-panel-add-audio-track"
          onPress={onAddAudioTrack}
          tooltip={t('window.tracks.addAudioTooltip')}
          accessibilityRole="button"
          accessibilityLabel={t('window.tracks.addAudioAccessibility')}
          style={styles.audio}
        >
          <Text style={[styles.caption, { color: palette.chromeText }]}>{t('window.tracks.addAudio')}</Text>
        </Pressable>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  footer: { height: TRACKS_FOOTER_HEIGHT, flexDirection: 'row', alignItems: 'center', paddingHorizontal: TRACK_TABLE.padding, borderTopWidth: 1 },
  audio: { marginLeft: 6 },
  caption: { fontSize: 10, fontWeight: '600' },
});
