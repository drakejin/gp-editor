import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { GM_INSTRUMENT_FAMILIES, GM_INSTRUMENT_NAMES, gmFamilyIndex } from '@gp-editor/core';
import type { Palette } from '../theme';
import { BarButton } from './BarButton';

interface InstrumentPickerProps {
  readonly trackName: string;
  /** General MIDI program the track plays now. */
  readonly program: number;
  readonly palette: Palette;
  readonly onSetProgram: (program: number) => void;
  readonly onClose: () => void;
}

const FAMILY_SIZE = 8;

/**
 * The 128 General MIDI instruments as 16 families of 8: pick a family, then a sound. The picker stays open so sounds
 * can be tried one after another (playback restarts with the new sound); Done closes it.
 */
export function InstrumentPicker({ trackName, program, palette, onSetProgram, onClose }: InstrumentPickerProps) {
  const [familyIndex, setFamilyIndex] = useState(gmFamilyIndex(program));
  const first = familyIndex * FAMILY_SIZE;
  const programs = Array.from({ length: FAMILY_SIZE }, (_, i) => first + i);
  return (
    <View style={[styles.container, { backgroundColor: palette.sidebar, borderColor: palette.border }]}>
      <View style={styles.row}>
        <Text style={[styles.title, { color: palette.text }]}>{`Instrument · ${trackName}`}</Text>
        <BarButton label="Done" palette={palette} isAccent onPress={onClose} />
      </View>
      <View style={styles.row}>
        {GM_INSTRUMENT_FAMILIES.map((family, index) => (
          <BarButton
            key={family}
            label={family}
            palette={palette}
            isActive={index === familyIndex}
            onPress={() => setFamilyIndex(index)}
          />
        ))}
      </View>
      <View style={styles.row}>
        {programs.map((candidate) => (
          <BarButton
            key={candidate}
            label={GM_INSTRUMENT_NAMES[candidate] ?? `Program ${candidate + 1}`}
            palette={palette}
            isActive={candidate === program}
            onPress={() => onSetProgram(candidate)}
          />
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { paddingHorizontal: 24, paddingTop: 8, paddingBottom: 4, borderBottomWidth: StyleSheet.hairlineWidth },
  row: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', rowGap: 4, marginBottom: 6 },
  title: { fontSize: 12, fontWeight: '700', marginRight: 12 },
});
