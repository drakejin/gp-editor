import { useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { type Song, suggestTunings } from '@gp-editor/core';
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
}

/**
 * Above the neck: the track's instrument and tuning, its instrument's presets (✓ = plays every note on the 24-fret neck;
 * a click retunes and re-frets the tab), and — when the track is not on a preset that plays it — why, with suggestions.
 */
export function NeckSettings({ song, trackIndex, notice, palette, onSetTuning, onDismissNotice }: NeckSettingsProps) {
  const advice = useMemo(() => suggestTunings(song, trackIndex), [song, trackIndex]);
  const track = song.tracks[trackIndex];
  if (advice === undefined || track === undefined || advice.instrument === 'percussion') {
    return null;
  }
  const hint = tuningHint(advice, track);
  return (
    <View style={[styles.container, { backgroundColor: palette.sidebar }]}>
      <View style={styles.row}>
        <Text style={[styles.title, { color: palette.text }]}>{neckTitle(advice, track)}</Text>
        {advice.presets.map(({ preset, unplayableNotes }) => (
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

const styles = StyleSheet.create({
  container: { paddingHorizontal: 24, paddingTop: 8 },
  row: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', rowGap: 4, marginBottom: 4 },
  title: { fontSize: 12, fontWeight: '700', marginRight: 12 },
  message: { fontSize: 12, fontWeight: '600', marginRight: 8, flexShrink: 1 },
});
