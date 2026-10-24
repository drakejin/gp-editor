import type { Dispatch } from 'react';
import { Pressable, StyleSheet, Text } from 'react-native';
import type { Song } from '@gp-editor/core';
import { trackInstrument } from '../lib/instruments';
import type { EditorAction } from '../state/editor';
import { type Palette, onChrome } from '../theme';
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
export function ErrorBanner({ message, palette, onDismiss }: { readonly message: string; readonly palette: Palette; readonly onDismiss: () => void }) {
  return (
    <Pressable onPress={onDismiss} style={[styles.error, { backgroundColor: palette.danger }]}>
      <Text style={styles.errorText}>{message} (click to dismiss)</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  error: { paddingHorizontal: 14, paddingVertical: 8 },
  errorText: { color: '#FFFFFF', fontSize: 12, fontWeight: '600' },
});
