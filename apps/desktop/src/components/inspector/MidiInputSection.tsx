import { StyleSheet, Text, View } from 'react-native';
import type { MidiInput } from '../../hooks/use-midi-input';
import { CHORD_WINDOW_MS } from '../../lib/midi-input';
import { plural } from '../../lib/wording';
import type { Palette } from '../../theme';
import { ChromeButton } from '../chrome/ChromeButton';
import { InspectorSection } from './InspectorParts';

interface MidiInputSectionProps {
  readonly palette: Palette;
  readonly midiInput: MidiInput;
}

/** What MIDI input is doing now, under its settings. */
function statusText(midiInput: MidiInput): string {
  if (midiInput.error !== undefined) {
    return midiInput.error;
  }
  if (!midiInput.settings.isEnabled) {
    return 'Off.';
  }
  if (midiInput.sources.length === 0) {
    return 'No MIDI source found: connect a keyboard or MIDI guitar.';
  }
  return midiInput.listening === 0 ? 'The chosen source is not connected.' : `Listening to ${plural(midiInput.listening, 'source')}.`;
}

/**
 * The SONG tab's MIDI INPUT: on/off, the source (every source, or one), MIDI guitar mode (one channel per string) and
 * velocity. Kept on this Mac, not in the file.
 */
export function MidiInputSection({ palette, midiInput }: MidiInputSectionProps) {
  const { settings, sources, changeSettings } = midiInput;
  const choices: readonly { readonly id?: number; readonly name: string }[] = [{ name: 'All sources' }, ...sources];
  return (
    <InspectorSection palette={palette} title="MIDI INPUT">
      <View style={styles.row}>
        <ChromeButton
          palette={palette}
          label={settings.isEnabled ? '● On' : '○ Off'}
          tooltip={settings.isEnabled ? 'Stop entering notes from MIDI' : 'Enter notes at the cursor from a MIDI keyboard or MIDI guitar'}
          isActive={settings.isEnabled}
          onPress={() => changeSettings({ isEnabled: !settings.isEnabled })}
        />
      </View>
      {choices.map((choice) => (
        <View key={choice.id ?? 'all'} style={styles.row}>
          <ChromeButton
            palette={palette}
            label={`${choice.id === settings.sourceId ? '●' : '○'}  ${choice.name}`}
            tooltip={choice.id === undefined ? 'Listen to every MIDI source' : `Listen to ${choice.name} only`}
            isActive={choice.id === settings.sourceId}
            onPress={() => changeSettings({ sourceId: choice.id })}
          />
        </View>
      ))}
      <View style={styles.row}>
        <ChromeButton
          palette={palette}
          label={`${settings.isGuitarMode ? '☑' : '☐'}  MIDI guitar (one channel per string)`}
          tooltip="Channel 1 is string 1, channel 2 string 2 … as a MIDI guitar sends them"
          isActive={settings.isGuitarMode}
          onPress={() => changeSettings({ isGuitarMode: !settings.isGuitarMode })}
        />
      </View>
      <View style={styles.row}>
        <ChromeButton
          palette={palette}
          label={`${settings.usesVelocity ? '☑' : '☐'}  Velocity sets the dynamic`}
          tooltip="Notes get the velocity they were played with"
          isActive={settings.usesVelocity}
          onPress={() => changeSettings({ usesVelocity: !settings.usesVelocity })}
        />
      </View>
      <Text style={[styles.note, { color: palette.chromeMuted }]}>{statusText(midiInput)}</Text>
      <Text style={[styles.note, { color: palette.chromeMuted }]}>
        Notes struck within {CHORD_WINDOW_MS} ms make one beat at the cursor, which then moves on. On this Mac; not saved in the file.
      </Text>
    </InspectorSection>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', marginBottom: 3 },
  note: { fontSize: 10, marginTop: 4 },
});
