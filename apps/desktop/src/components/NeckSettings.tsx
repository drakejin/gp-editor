import { memo, useDeferredValue, useMemo, useState } from 'react';
import { type StyleProp, StyleSheet, Text, View, type ViewStyle } from 'react-native';
import { type Song, suggestTrackTunings } from '@gp-editor/core';
import { neckTitle, tuningHint } from '../lib/tuning-hint';
import type { Palette } from '../theme';
import { BarButton } from './BarButton';

interface NeckSettingsProps {
  readonly song: Song;
  readonly trackIndex: number;
  /** What the last retune could not keep. */
  readonly notice?: string;
  readonly palette: Palette;
  /** Open-string MIDI pitches, string 1 first. */
  readonly onSetTuning: (tuning: readonly number[]) => void;
  readonly onDismissNotice: () => void;
  readonly style?: StyleProp<ViewStyle>;
}

/**
 * Above the neck: the track's instrument and tuning, its instrument's presets behind a Tunings button (✓ = plays every
 * note on the 24-fret neck; a click retunes and re-frets the tab), and — when the track is not on a preset that plays
 * it — why, with suggestions. Collapsed it takes one line, so the score keeps its room.
 */
function NeckSettingsView({ song, trackIndex, notice, palette, onSetTuning, onDismissNotice, style }: NeckSettingsProps) {
  const track = song.tracks[trackIndex];
  // Only the shown track and the channels feed the advice, so edits to other tracks do not recompute it; it trails
  // edits (deferred) so typing on a long track is not held up by it.
  const advised = useDeferredValue(track);
  const { channels } = song;
  const advice = useMemo(() => (advised === undefined ? undefined : suggestTrackTunings(advised, channels)), [advised, channels]);
  const [isOpen, setIsOpen] = useState(false);
  if (advice === undefined || track === undefined || advice.instrument === 'percussion') {
    return null;
  }
  const hint = tuningHint(advice, track);
  return (
    <View style={[styles.container, { backgroundColor: palette.sidebar }, style]}>
      <View style={styles.row}>
        <Text style={[styles.title, { color: palette.text }]}>{neckTitle(advice, track)}</Text>
        <BarButton label={isOpen ? 'Tunings ▴' : 'Tunings ▾'} palette={palette} isActive={isOpen} onPress={() => setIsOpen(!isOpen)} />
        {(isOpen ? advice.presets : []).map(({ preset, unplayableNotes }) => (
          <BarButton
            key={preset.id}
            label={unplayableNotes === 0 ? `${preset.name} ✓` : preset.name}
            palette={palette}
            isActive={advice.current?.id === preset.id}
            onPress={() => onSetTuning(preset.tuning)}
          />
        ))}
      </View>
      {hint === undefined ? null : (
        <View style={styles.row}>
          <Text style={[styles.message, { color: palette.accent }]}>
            {hint.message} {hint.lead}
          </Text>
          {hint.presets.map((preset) => (
            <BarButton key={preset.id} label={`Use ${preset.name}`} palette={palette} isAccent onPress={() => onSetTuning(preset.tuning)} />
          ))}
        </View>
      )}
      {notice === undefined ? null : (
        <View style={styles.row}>
          <Text style={[styles.message, { color: palette.muted }]}>{notice}</Text>
          <BarButton label="Dismiss" palette={palette} onPress={onDismissNotice} />
        </View>
      )}
    </View>
  );
}

/** Memoized: it only changes with its own props, not with the cursor or the playing beat. */
export const NeckSettings = memo(NeckSettingsView);

const styles = StyleSheet.create({
  container: { paddingHorizontal: 24, paddingTop: 8 },
  row: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', rowGap: 4, marginBottom: 4 },
  title: { fontSize: 12, fontWeight: '700', marginRight: 12 },
  message: { fontSize: 12, fontWeight: '600', marginRight: 8, flexShrink: 1 },
});
