import { StyleSheet, Text, View } from 'react-native';
import { DEFAULT_NOTE_AUDIO, type Note, type NoteAudio } from '@gp-editor/core';
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
  readonly label: string;
  readonly less: string;
  readonly more: string;
  readonly format: (value: number) => string;
}

/** Guitar Pro 8's note inspector, "Audio": how the note plays back, never how it is written. */
const AUDIO_SETTINGS: readonly AudioSetting[] = [
  { setting: 'durationPercent', label: 'Duration', less: 'Play duration: shorter', more: 'Play duration: longer', format: (value) => `${value}%` },
  { setting: 'offsetPercent', label: 'Start offset', less: 'Start offset: earlier', more: 'Start offset: later (a share of the beat)', format: (value) => `${value}%` },
  { setting: 'velocityOffset', label: 'Velocity', less: 'Velocity change: less', more: 'Velocity change: more', format: (value) => (value < 0 ? `−${-value}` : `+${value}`) },
];

/** The NOTE tab: the audio settings of the note at the cursor. */
export function NoteInspector({ palette, note, onEditNote }: NoteInspectorProps) {
  if (note === undefined || onEditNote === undefined) {
    return (
      <InspectorSection palette={palette} title="AUDIO">
        <Text style={[styles.hint, { color: palette.chromeMuted }]}>Put the cursor on a note to set how it plays back.</Text>
      </InspectorSection>
    );
  }
  const audio = note.audio ?? DEFAULT_NOTE_AUDIO;
  const shift = (setting: keyof NoteAudio, delta: number) => onEditNote({ type: 'shiftNoteAudio', setting, delta });
  return (
    <InspectorSection palette={palette} title="AUDIO">
      {AUDIO_SETTINGS.map(({ setting, label, less, more, format }) => (
        <InspectorField key={setting} palette={palette} label={label}>
          <ChromeButton palette={palette} label="−" tooltip={less} onPress={() => shift(setting, -AUDIO_STEP)} />
          <Text style={[styles.value, { color: palette.chromeText }]}>{format(audio[setting])}</Text>
          <ChromeButton palette={palette} label="+" tooltip={more} onPress={() => shift(setting, AUDIO_STEP)} />
        </InspectorField>
      ))}
      <View style={styles.reset}>
        <ChromeButton palette={palette} label="Reset" tooltip="Play the note as written" isEnabled={note.audio !== undefined} onPress={() => onEditNote({ type: 'resetNoteAudio' })} />
      </View>
      <Text style={[styles.hint, { color: palette.chromeMuted }]}>Playback only. Saved in GP5 files as the duration; .gp, GP4 and GP3 files leave them out.</Text>
    </InspectorSection>
  );
}

const styles = StyleSheet.create({
  value: { minWidth: 44, textAlign: 'center', fontSize: 12, fontWeight: '600' },
  reset: { flexDirection: 'row', justifyContent: 'flex-end', marginTop: 2 },
  hint: { fontSize: 11, lineHeight: 15, marginTop: 6 },
});
