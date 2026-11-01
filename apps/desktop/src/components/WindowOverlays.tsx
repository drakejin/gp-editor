import type { Dispatch } from 'react';
import { Pressable, StyleSheet, Text } from 'react-native';
import type { Song } from '@gp-editor/core';
import { useT } from '../hooks/use-i18n';
import { trackChoice } from '../lib/instrument-picker';
import type { EditorAction } from '../state/editor';
import { type Palette, STRIP_COLORS, onChrome } from '../theme';
import { InstrumentPicker } from './InstrumentPicker';

/**
 * The instrument picker over the window for a track: its choice makes the track that instrument (one undo step). None
 * for a track without a channel, which has no sound to change.
 */
export function PickerOverlay({
  palette,
  song,
  trackIndex,
  dispatch,
  onClose,
}: {
  readonly palette: Palette;
  readonly song: Song;
  readonly trackIndex: number;
  readonly dispatch: Dispatch<EditorAction>;
  readonly onClose: () => void;
}) {
  if (trackChoice(song, trackIndex) === undefined) {
    return null;
  }
  return (
    <InstrumentPicker
      song={song}
      trackIndex={trackIndex}
      palette={onChrome(palette)}
      onChoose={(instrument, keepsTrack) => dispatch({ type: 'setTrackInstrument', trackIndex, instrument, keepsTrack })}
      onClose={onClose}
    />
  );
}

/** The error banner over the score; a click dismisses it. */
export function ErrorBanner({ message, onDismiss }: { readonly message: string; readonly onDismiss: () => void }) {
  const t = useT();
  return (
    <Pressable onPress={onDismiss} style={styles.error}>
      <Text style={styles.errorText}>{t('window.error.banner', { message })}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  error: { paddingHorizontal: 14, paddingVertical: 8, backgroundColor: STRIP_COLORS.errorBackground },
  errorText: { color: STRIP_COLORS.errorText, fontSize: 12, fontWeight: '600' },
});
