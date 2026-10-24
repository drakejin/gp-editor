import { type ReactNode, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { GM_INSTRUMENT_FAMILIES, GM_INSTRUMENT_NAMES, type NewTrack, TRACK_KINDS, gmFamilyIndex, trackKindSpec } from '@gp-editor/core';
import {
  type AddTrackDraft,
  defaultTrackName,
  draftTuning,
  initialAddTrackDraft,
  shiftDraftCapo,
  soundChoices,
  toNewTrack,
  tuningChoices,
  withFamily,
  withKind,
  withProgram,
  withStringCount,
  withTuning,
} from '../lib/add-track-draft';
import { tuningLabel } from '../lib/pitch';
import type { Palette } from '../theme';
import { ChromeButton } from './chrome/ChromeButton';
import { TextField } from './TextField';

interface AddTrackPanelProps {
  readonly palette: Palette;
  readonly onAdd: (track: NewTrack) => void;
  /** Cancel, Esc and a click outside: nothing is added. */
  readonly onCancel: () => void;
}

interface ChoiceRowProps {
  readonly palette: Palette;
  readonly label: string;
  readonly children: ReactNode;
}

function ChoiceRow({ palette, label, children }: ChoiceRowProps) {
  return (
    <View style={styles.row}>
      <Text style={[styles.label, { color: palette.chromeMuted }]}>{label}</Text>
      <View style={styles.choices}>{children}</View>
    </View>
  );
}

interface ChoiceProps {
  readonly palette: Palette;
  readonly label: string;
  readonly tooltip?: string;
  readonly isActive: boolean;
  readonly onPress: () => void;
}

/** A choice of the panel, lit while chosen. */
function Choice({ palette, label, tooltip, isActive, onPress }: ChoiceProps) {
  return <ChromeButton palette={palette} label={label} tooltip={tooltip ?? label} isActive={isActive} height={22} onPress={onPress} />;
}

/** Instrument, and for "Other" the General MIDI family; then the sound (a family's eight programs). */
function SoundRows({ palette, draft, change }: DraftRowsProps) {
  const sounds = soundChoices(draft);
  return (
    <>
      <ChoiceRow palette={palette} label="Instrument">
        {TRACK_KINDS.map((spec) => (
          <Choice key={spec.kind} palette={palette} label={spec.name} tooltip={`A ${spec.name.toLowerCase()} track`} isActive={draft.kind === spec.kind} onPress={() => change(withKind(draft, spec.kind))} />
        ))}
      </ChoiceRow>
      {draft.kind === 'other' ? (
        <ChoiceRow palette={palette} label="Family">
          {GM_INSTRUMENT_FAMILIES.map((family, index) => (
            <Choice key={family} palette={palette} label={family} isActive={gmFamilyIndex(draft.program) === index} onPress={() => change(withFamily(draft, index))} />
          ))}
        </ChoiceRow>
      ) : null}
      {sounds.length === 0 ? null : (
        <ChoiceRow palette={palette} label="Sound">
          {sounds.map((program) => (
            <Choice key={program} palette={palette} label={GM_INSTRUMENT_NAMES[program] ?? `Program ${program + 1}`} isActive={draft.program === program} onPress={() => change(withProgram(draft, program))} />
          ))}
        </ChoiceRow>
      )}
    </>
  );
}

interface DraftRowsProps {
  readonly palette: Palette;
  readonly draft: AddTrackDraft;
  readonly change: (next: AddTrackDraft) => void;
}

/** Strings, tuning (its notes from the lowest string) and capo; drums have none of them. */
function NeckRows({ palette, draft, change }: DraftRowsProps) {
  const stringCounts = trackKindSpec(draft.kind)?.stringCounts ?? [];
  const tuning = draftTuning(draft);
  if (draft.kind === 'drums') {
    return <Text style={[styles.note, { color: palette.chromeMuted }]}>A drum kit on MIDI channel 10: each note is a drum, entered from the drum kit view or by its General MIDI key.</Text>;
  }
  return (
    <>
      {stringCounts.length > 1 ? (
        <ChoiceRow palette={palette} label="Strings">
          {stringCounts.map((count) => (
            <Choice key={count} palette={palette} label={String(count)} tooltip={`${count} strings`} isActive={draft.stringCount === count} onPress={() => change(withStringCount(draft, count))} />
          ))}
        </ChoiceRow>
      ) : null}
      <ChoiceRow palette={palette} label="Tuning">
        {tuningChoices(draft).map((choice) => (
          <Choice key={choice.id} palette={palette} label={choice.name} tooltip={tuningLabel(choice.tuning)} isActive={draft.tuningId === choice.id} onPress={() => change(withTuning(draft, choice.id))} />
        ))}
        <Text style={[styles.value, { color: palette.chromeText }]}>{tuning === undefined ? '' : tuningLabel(tuning.tuning)}</Text>
      </ChoiceRow>
      <ChoiceRow palette={palette} label="Capo">
        <ChromeButton palette={palette} label="−" tooltip="Capo a fret lower" height={22} onPress={() => change(shiftDraftCapo(draft, -1))} />
        <Text style={[styles.value, { color: palette.chromeText }]}>{draft.capo === 0 ? 'None' : `Fret ${draft.capo}`}</Text>
        <ChromeButton palette={palette} label="+" tooltip="Capo a fret higher" height={22} onPress={() => change(shiftDraftCapo(draft, 1))} />
      </ChoiceRow>
    </>
  );
}

/**
 * Track ▸ Add Track… (⌥⌘N) and the tracks panel's +: Guitar Pro 8's instrument window, narrowed to what the app keeps —
 * the instrument (guitar, bass, banjo, ukulele, drums, piano, or any General MIDI instrument), its sound, strings, tuning,
 * capo and name. Add Track adds it after the last track and shows it (one undo step).
 */
export function AddTrackPanel({ palette, onAdd, onCancel }: AddTrackPanelProps) {
  const [draft, setDraft] = useState<AddTrackDraft>(initialAddTrackDraft);
  return (
    <View style={styles.overlay}>
      <Pressable testID="add-track-backdrop" style={[StyleSheet.absoluteFill, styles.backdrop]} onPress={onCancel} />
      <View style={[styles.panel, { backgroundColor: palette.chrome, borderColor: palette.chromeBorder }]} accessibilityLabel="Add track">
        <Text style={[styles.title, { color: palette.chromeText }]}>Add Track</Text>
        <SoundRows palette={palette} draft={draft} change={setDraft} />
        <NeckRows palette={palette} draft={draft} change={setDraft} />
        <ChoiceRow palette={palette} label="Name">
          <TextField
            testID="add-track-name"
            value={draft.name}
            placeholder={defaultTrackName(draft)}
            placeholderTextColor={palette.chromeMuted}
            onChangeText={(name) => setDraft((current) => ({ ...current, name }))}
            style={[styles.field, { color: palette.chromeText, borderColor: palette.chromeBorder }]}
          />
        </ChoiceRow>
        <View style={styles.buttons}>
          <Text style={[styles.note, styles.grow, { color: palette.chromeMuted }]}>Added after the last track; ⌘Z takes it away.</Text>
          <ChromeButton palette={palette} label="Cancel" tooltip="Add nothing (Esc)" minWidth={72} onPress={onCancel} />
          <ChromeButton palette={palette} label="Add Track" tooltip="Add this track after the last one" minWidth={86} isActive onPress={() => onAdd(toNewTrack(draft))} />
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  overlay: { ...StyleSheet.absoluteFillObject, alignItems: 'center', justifyContent: 'center' },
  backdrop: { backgroundColor: 'rgba(0, 0, 0, 0.3)' },
  panel: { width: 640, borderRadius: 10, borderWidth: 1, paddingHorizontal: 18, paddingTop: 16, paddingBottom: 12 },
  title: { fontSize: 14, fontWeight: '800', marginBottom: 10 },
  row: { flexDirection: 'row', alignItems: 'flex-start', marginBottom: 6 },
  label: { width: 76, fontSize: 11, fontWeight: '700', paddingTop: 5 },
  choices: { flex: 1, flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', rowGap: 2 },
  value: { fontSize: 12, fontWeight: '600', marginHorizontal: 8 },
  note: { fontSize: 11, marginBottom: 6 },
  grow: { flex: 1, marginBottom: 0 },
  field: { flex: 1, fontSize: 12, paddingVertical: 3, paddingHorizontal: 6, borderWidth: 1, borderRadius: 4 },
  buttons: { flexDirection: 'row', alignItems: 'center', marginTop: 10, columnGap: 6 },
});
