import type { Dispatch } from 'react';
import { Pressable, StyleSheet, Text } from 'react-native';
import type { Song } from '@gp-editor/core';
import { useT } from '../hooks/use-i18n';
import { trackInstrument } from '../lib/instruments';
import type { EditorAction } from '../state/editor';
import { type Palette, STRIP_COLORS, onChrome } from '../theme';
import { InstrumentPicker } from './InstrumentPicker';

/** The instrument picker over the window for a track (none for a drum track: its kit is not a GM program). */
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
  const instrument = trackInstrument(song, trackIndex);
  if (instrument === undefined || instrument.isPercussion) {
    return null;
  }
  return (
    <InstrumentPicker
      trackName={song.tracks[trackIndex]?.name ?? ''}
      program={instrument.program}
      palette={onChrome(palette)}
      onSetProgram={(program) => dispatch({ type: 'setTrackProgram', trackIndex, program })}
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
