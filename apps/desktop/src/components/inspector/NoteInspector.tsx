import { StyleSheet, Text, View } from 'react-native';
import { DEFAULT_NOTE_AUDIO, type Note, type NoteAudio } from '@gp-editor/core';
import { useT } from '../../hooks/use-i18n';
import type { MessageKey } from '../../lib/i18n/i18n';
import type { SongEdit } from '../../state/song-edits';
import type { Palette } from '../../theme';
import { ChromeButton } from '../chrome/ChromeButton';
import { InspectorField, InspectorSection } from './InspectorParts';

export interface NoteInspectorProps {
  readonly palette: Palette;
  /** The note at the cursor; none on an empty string or a rest. */
  readonly note?: Note;
  /** Edits the note at the cursor (one undo step each). */
  readonly onEditNote?: (edit: SongEdit) => void;
}

/** −/+ step of each audio setting. */
const AUDIO_STEP = 5;

interface AudioSetting {
  readonly setting: keyof NoteAudio;
  readonly label: MessageKey;
  readonly less: MessageKey;
  readonly more: MessageKey;
  readonly format: (value: number) => string;
}

/** Guitar Pro 8's note inspector, "Audio": how the note plays back, never how it is written. */
const AUDIO_SETTINGS: readonly AudioSetting[] = [
  { setting: 'durationPercent', label: 'tools.inspector.duration', less: 'tools.inspector.durationLess', more: 'tools.inspector.durationMore', format: (value) => `${value}%` },
  { setting: 'offsetPercent', label: 'tools.inspector.offset', less: 'tools.inspector.offsetLess', more: 'tools.inspector.offsetMore', format: (value) => `${value}%` },
  { setting: 'velocityOffset', label: 'tools.inspector.velocity', less: 'tools.inspector.velocityLess', more: 'tools.inspector.velocityMore', format: (value) => (value < 0 ? `−${-value}` : `+${value}`) },
];

/** The NOTE tab: the audio settings of the note at the cursor. */
export function NoteInspector({ palette, note, onEditNote }: NoteInspectorProps) {
  const t = useT();
  if (note === undefined || onEditNote === undefined) {
    return (
      <InspectorSection palette={palette} title={t('tools.inspector.audio')}>
        <Text style={[styles.hint, { color: palette.chromeMuted }]}>{t('tools.inspector.noNote')}</Text>
      </InspectorSection>
    );
  }
  const audio = note.audio ?? DEFAULT_NOTE_AUDIO;
  const shift = (setting: keyof NoteAudio, delta: number) => onEditNote({ type: 'shiftNoteAudio', setting, delta });
  return (
    <InspectorSection palette={palette} title={t('tools.inspector.audio')}>
      {AUDIO_SETTINGS.map(({ setting, label, less, more, format }) => (
        <InspectorField key={setting} palette={palette} label={t(label)}>
          <ChromeButton palette={palette} label="−" tooltip={t(less)} onPress={() => shift(setting, -AUDIO_STEP)} />
          <Text style={[styles.value, { color: palette.chromeText }]}>{format(audio[setting])}</Text>
          <ChromeButton palette={palette} label="+" tooltip={t(more)} onPress={() => shift(setting, AUDIO_STEP)} />
        </InspectorField>
      ))}
      <View style={styles.reset}>
        <ChromeButton palette={palette} label={t('common.reset')} tooltip={t('tools.inspector.resetTooltip')} isEnabled={note.audio !== undefined} onPress={() => onEditNote({ type: 'resetNoteAudio' })} />
      </View>
      <Text style={[styles.hint, { color: palette.chromeMuted }]}>{t('tools.inspector.audioNote')}</Text>
    </InspectorSection>
  );
}

const styles = StyleSheet.create({
  value: { minWidth: 44, textAlign: 'center', fontSize: 12, fontWeight: '600' },
  reset: { flexDirection: 'row', justifyContent: 'flex-end', marginTop: 2 },
  hint: { fontSize: 11, lineHeight: 15, marginTop: 6 },
});
