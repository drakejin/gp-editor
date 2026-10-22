import type { ReactNode } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import type { MeasureHeader, Note, NoteValue, ToggleableEffect, Voice } from '@gp-editor/core';
import { type SongEdit, isTriplet } from '../state/song-edits';
import type { Palette } from '../theme';
import { BarButton } from './BarButton';

interface EditBarProps {
  readonly palette: Palette;
  /** Voice at the cursor (its duration), note at the cursor (its effects), header of the cursor's bar. */
  readonly voice?: Voice;
  readonly note?: Note;
  readonly header?: MeasureHeader;
  readonly keySignature: number;
  readonly onEdit: (edit: SongEdit) => void;
}

const NOTE_VALUE_LABELS: ReadonlyArray<readonly [NoteValue, string]> = [[1, '1'], [2, '½'], [4, '¼'], [8, '⅛'], [16, '1/16'], [32, '1/32'], [64, '1/64']];

const EFFECT_BUTTONS: ReadonlyArray<readonly [ToggleableEffect, string]> = [
  ['hammer', 'H/P'],
  ['palmMute', 'P.M.'],
  ['letRing', 'L.R.'],
  ['vibrato', '~'],
  ['deadNote', 'x'],
  ['ghostNote', '( )'],
  ['accentuatedNote', '>'],
  ['staccato', '·'],
];

/** Second toolbar row: duration, beats, note effects and bar settings at the cursor; wraps in a narrow window. */
export function EditBar({ palette, voice, note, header, keySignature, onEdit }: EditBarProps) {
  const duration = voice?.duration;
  const hasNote = note !== undefined;
  const bendPeak = Math.max(0, ...(note?.effect.bend?.points.map((p) => p.value) ?? []));
  return (
    <View style={[styles.container, { backgroundColor: palette.sidebar, borderColor: palette.border }]}>
      <View style={styles.content}>
        <Group title="Duration" palette={palette}>
          {NOTE_VALUE_LABELS.map(([value, label]) => (
            <BarButton key={value} label={label} palette={palette} isEnabled={voice !== undefined} isActive={duration?.value === value} onPress={() => onEdit({ type: 'setNoteValue', value })} />
          ))}
          <BarButton label="dot" palette={palette} isEnabled={voice !== undefined} isActive={duration?.dotted === true} onPress={() => onEdit({ type: 'toggleDot' })} />
          <BarButton label="3" palette={palette} isEnabled={voice !== undefined} isActive={duration !== undefined && isTriplet(duration)} onPress={() => onEdit({ type: 'toggleTriplet' })} />
        </Group>
        <Group title="Beat" palette={palette}>
          <BarButton label="+ Beat" palette={palette} isEnabled={voice !== undefined} onPress={() => onEdit({ type: 'insertBeat' })} />
          <BarButton label="− Beat" palette={palette} isEnabled={voice !== undefined} onPress={() => onEdit({ type: 'deleteBeat' })} />
        </Group>
        <Group title="Note" palette={palette}>
          {EFFECT_BUTTONS.map(([effect, label]) => (
            <BarButton key={effect} label={label} palette={palette} isEnabled={hasNote} isActive={note?.effect[effect] === true} onPress={() => onEdit({ type: 'toggleEffect', effect })} />
          ))}
          <BarButton label="sl." palette={palette} isEnabled={hasNote} isActive={(note?.effect.slides.length ?? 0) > 0} onPress={() => onEdit({ type: 'toggleSlide' })} />
          <BarButton label={bendPeak > 2 ? 'bend full' : bendPeak > 0 ? 'bend ½' : 'bend'} palette={palette} isEnabled={hasNote} isActive={bendPeak > 0} onPress={() => onEdit({ type: 'cycleBend' })} />
          <BarButton label="N.H." palette={palette} isEnabled={hasNote} isActive={note?.effect.harmonic !== undefined} onPress={() => onEdit({ type: 'toggleHarmonic' })} />
          <BarButton label="tie" palette={palette} isEnabled={hasNote} isActive={note?.isTied === true} onPress={() => onEdit({ type: 'toggleTie' })} />
        </Group>
        <BarGroup palette={palette} header={header} keySignature={keySignature} onEdit={onEdit} />
      </View>
    </View>
  );
}

function BarGroup({ palette, header, keySignature, onEdit }: Pick<EditBarProps, 'palette' | 'header' | 'keySignature' | 'onEdit'>) {
  const isEnabled = header !== undefined;
  const key = keySignature === 0 ? 'C' : `${Math.abs(keySignature)}${keySignature > 0 ? '♯' : '♭'}`;
  return (
    <Group title="Bar" palette={palette}>
      <BarButton label="+ Bar" palette={palette} isEnabled={isEnabled} onPress={() => onEdit({ type: 'insertMeasure' })} />
      <BarButton label="− Bar" palette={palette} isEnabled={isEnabled} onPress={() => onEdit({ type: 'deleteMeasure' })} />
      <Stepper label={header === undefined ? '–' : `${header.timeSignature.numerator}/${header.timeSignature.denominator}`} palette={palette} isEnabled={isEnabled}
        onMinus={() => onEdit({ type: 'shiftTimeSignature', part: 'numerator', delta: -1 })} onPlus={() => onEdit({ type: 'shiftTimeSignature', part: 'numerator', delta: 1 })} />
      <Stepper label={`÷${header?.timeSignature.denominator ?? ''}`} palette={palette} isEnabled={isEnabled}
        onMinus={() => onEdit({ type: 'shiftTimeSignature', part: 'denominator', delta: -1 })} onPlus={() => onEdit({ type: 'shiftTimeSignature', part: 'denominator', delta: 1 })} />
      <Stepper label={`♩ ${header?.tempo ?? ''}`} palette={palette} isEnabled={isEnabled} onMinus={() => onEdit({ type: 'shiftTempo', delta: -5 })} onPlus={() => onEdit({ type: 'shiftTempo', delta: 5 })} />
      <Stepper label={`Key ${key}`} palette={palette} isEnabled={isEnabled} onMinus={() => onEdit({ type: 'shiftKeySignature', delta: -1 })} onPlus={() => onEdit({ type: 'shiftKeySignature', delta: 1 })} />
      <BarButton label="|:" palette={palette} isEnabled={isEnabled} isActive={header?.repeatOpen === true} onPress={() => onEdit({ type: 'toggleRepeatOpen' })} />
      <BarButton label=":|" palette={palette} isEnabled={isEnabled} isActive={(header?.repeatClose ?? 0) > 0} onPress={() => onEdit({ type: 'toggleRepeatClose' })} />
    </Group>
  );
}

export interface StepperProps {
  readonly label: string;
  readonly palette: Palette;
  readonly isEnabled: boolean;
  readonly onMinus: () => void;
  readonly onPlus: () => void;
}

export function Stepper({ label, palette, isEnabled, onMinus, onPlus }: StepperProps) {
  return (
    <View style={styles.stepper}>
      <BarButton label="−" palette={palette} isEnabled={isEnabled} onPress={onMinus} />
      <Text style={[styles.stepperLabel, { color: palette.text }]}>{label}</Text>
      <BarButton label="+" palette={palette} isEnabled={isEnabled} onPress={onPlus} />
    </View>
  );
}

export interface GroupProps {
  readonly title: string;
  readonly palette: Palette;
  readonly children: ReactNode;
}

export function Group({ title, palette, children }: GroupProps) {
  return (
    <View style={styles.group}>
      <Text style={[styles.groupTitle, { color: palette.muted }]}>{title}</Text>
      <View style={styles.groupButtons}>{children}</View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { borderBottomWidth: StyleSheet.hairlineWidth },
  content: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'flex-end', paddingHorizontal: 12, paddingTop: 2, paddingBottom: 6 },
  group: { marginRight: 16, marginTop: 4 },
  groupTitle: { fontSize: 9, fontWeight: '700', letterSpacing: 0.8, marginBottom: 3, textTransform: 'uppercase' },
  groupButtons: { flexDirection: 'row', alignItems: 'center' },
  stepper: { flexDirection: 'row', alignItems: 'center', marginRight: 6 },
  stepperLabel: { fontSize: 12, fontWeight: '600', marginRight: 4, minWidth: 34, textAlign: 'center' },
});
