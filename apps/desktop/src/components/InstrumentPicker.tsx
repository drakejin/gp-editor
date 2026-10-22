import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
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

function instrumentName(program: number): string {
  return GM_INSTRUMENT_NAMES[program] ?? `Program ${program + 1}`;
}

/**
 * Picks a track's instrument in two clearly separate steps, in a panel over the score: on the left (step 1) one of the
 * 16 General MIDI families — browsing only; on the right (step 2) one of that family's 8 instruments, which the track
 * plays at once (heard live while playing). The panel stays open to try sounds one after another; Done or a click
 * outside closes it.
 */
export function InstrumentPicker({ trackName, program, palette, onSetProgram, onClose }: InstrumentPickerProps) {
  const [familyIndex, setFamilyIndex] = useState(gmFamilyIndex(program));
  const programs = Array.from({ length: FAMILY_SIZE }, (_, i) => familyIndex * FAMILY_SIZE + i);
  return (
    <View style={styles.overlay}>
      <Pressable testID="instrument-picker-backdrop" style={[StyleSheet.absoluteFill, styles.backdrop]} onPress={onClose} />
      <View style={[styles.panel, { backgroundColor: palette.paper, borderColor: palette.border }]}>
        <View style={[styles.header, { borderColor: palette.border }]}>
          <View style={styles.headerTexts}>
            <Text style={[styles.title, { color: palette.text }]}>{`Instrument · ${trackName}`}</Text>
            <Text style={[styles.now, { color: palette.muted }]}>{`Now: ${instrumentName(program)}`}</Text>
          </View>
          <BarButton label="Done" palette={palette} isAccent onPress={onClose} />
        </View>
        <View style={styles.panes}>
          <View style={[styles.familyPane, { backgroundColor: palette.sidebar, borderColor: palette.border }]}>
            <Text style={[styles.paneTitle, { color: palette.muted }]}>1  Family</Text>
            <ScrollView>
              {GM_INSTRUMENT_FAMILIES.map((family, index) => (
                <PickerRow key={family} pane="family" label={family} isSelected={index === familyIndex} palette={palette} onPress={() => setFamilyIndex(index)} />
              ))}
            </ScrollView>
          </View>
          <View style={styles.instrumentPane}>
            <Text style={[styles.paneTitle, { color: palette.muted }]}>2  Instrument</Text>
            {programs.map((candidate) => (
              <PickerRow
                key={candidate}
                pane="instrument"
                label={instrumentName(candidate)}
                isSelected={candidate === program}
                palette={palette}
                onPress={() => onSetProgram(candidate)}
              />
            ))}
          </View>
        </View>
        <Text style={[styles.footer, { color: palette.muted, borderColor: palette.border }]}>
          Choose a family on the left, then an instrument on the right. The track plays it at once — while the song plays,
          you hear it straight away. Saved with the song.
        </Text>
      </View>
    </View>
  );
}

export interface PickerRowProps {
  /** Which step the row belongs to: a family (browse) or an instrument (pick). */
  readonly pane: 'family' | 'instrument';
  readonly label: string;
  readonly isSelected: boolean;
  readonly palette: Palette;
  readonly onPress: () => void;
}

/** A family row is marked by a bar and a tint (where you are); an instrument row by ● / ○ (what the track plays). */
export function PickerRow({ pane, label, isSelected, palette, onPress }: PickerRowProps) {
  const isFamily = pane === 'family';
  return (
    <Pressable
      onPress={onPress}
      style={[
        isFamily ? styles.familyRow : styles.instrumentRow,
        isSelected ? { backgroundColor: palette.selection } : null,
        isSelected && isFamily ? { borderLeftColor: palette.accent } : null,
      ]}
    >
      {isFamily ? null : <Text style={[styles.marker, { color: isSelected ? palette.accent : palette.muted }]}>{isSelected ? '●' : '○'}</Text>}
      <Text numberOfLines={1} style={[styles.rowText, isSelected ? styles.selectedText : null, { color: palette.text }]}>
        {label}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  overlay: { ...StyleSheet.absoluteFillObject, alignItems: 'center', justifyContent: 'center' },
  backdrop: { backgroundColor: 'rgba(0, 0, 0, 0.28)' },
  panel: { width: 620, borderRadius: 10, borderWidth: StyleSheet.hairlineWidth, overflow: 'hidden' },
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 10, borderBottomWidth: StyleSheet.hairlineWidth },
  headerTexts: { flex: 1 },
  title: { fontSize: 14, fontWeight: '700' },
  now: { fontSize: 12, marginTop: 2 },
  panes: { flexDirection: 'row', height: 360 },
  familyPane: { width: 210, borderRightWidth: StyleSheet.hairlineWidth, paddingTop: 8 },
  instrumentPane: { flex: 1, paddingTop: 8, paddingHorizontal: 8 },
  paneTitle: { fontSize: 10, fontWeight: '700', letterSpacing: 0.8, textTransform: 'uppercase', paddingHorizontal: 12, marginBottom: 6 },
  familyRow: { flexDirection: 'row', alignItems: 'center', height: 20, paddingHorizontal: 9, borderLeftWidth: 3, borderLeftColor: 'transparent' },
  instrumentRow: { flexDirection: 'row', alignItems: 'center', height: 38, paddingHorizontal: 10, borderRadius: 6 },
  marker: { width: 18, fontSize: 13 },
  rowText: { fontSize: 13, fontWeight: '500', flexShrink: 1 },
  selectedText: { fontWeight: '700' },
  footer: { fontSize: 11, paddingHorizontal: 16, paddingVertical: 9, borderTopWidth: StyleSheet.hairlineWidth },
});
