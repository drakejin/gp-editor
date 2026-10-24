import { StyleSheet, Text, View } from 'react-native';
import { type Translate, useT } from '../../hooks/use-i18n';
import type { MidiInput } from '../../hooks/use-midi-input';
import { CHORD_WINDOW_MS } from '../../lib/midi-input';
import type { Palette } from '../../theme';
import { ChromeButton } from '../chrome/ChromeButton';
import { InspectorSection } from './InspectorParts';

interface MidiInputSectionProps {
  readonly palette: Palette;
  readonly midiInput: MidiInput;
}

/** What MIDI input is doing now, under its settings. */
function statusText(midiInput: MidiInput, t: Translate): string {
  if (midiInput.error !== undefined) {
    return midiInput.error;
  }
  if (!midiInput.settings.isEnabled) {
    return t('tools.midiInput.off');
  }
  if (midiInput.sources.length === 0) {
    return t('tools.midiInput.noSource');
  }
  return midiInput.listening === 0 ? t('tools.midiInput.notConnected') : t('tools.midiInput.listening', { count: midiInput.listening });
}

/**
 * The SONG tab's MIDI INPUT: on/off, the source (every source, or one), MIDI guitar mode (one channel per string) and
 * velocity. Kept on this Mac, not in the file.
 */
export function MidiInputSection({ palette, midiInput }: MidiInputSectionProps) {
  const { settings, sources, changeSettings } = midiInput;
  const t = useT();
  const choices: readonly { readonly id?: number; readonly name: string }[] = [{ name: t('tools.midiInput.allSources') }, ...sources];
  return (
    <InspectorSection palette={palette} title={t('tools.midiInput.title')}>
      <View style={styles.row}>
        <ChromeButton
          palette={palette}
          label={settings.isEnabled ? `● ${t('common.on')}` : `○ ${t('common.off')}`}
          tooltip={settings.isEnabled ? t('tools.midiInput.stopTooltip') : t('tools.midiInput.startTooltip')}
          isActive={settings.isEnabled}
          onPress={() => changeSettings({ isEnabled: !settings.isEnabled })}
        />
      </View>
      {choices.map((choice) => (
        <View key={choice.id ?? 'all'} style={styles.row}>
          <ChromeButton
            palette={palette}
            label={`${choice.id === settings.sourceId ? '●' : '○'}  ${choice.name}`}
            tooltip={choice.id === undefined ? t('tools.midiInput.listenAll') : t('tools.midiInput.listenOne', { name: choice.name })}
            isActive={choice.id === settings.sourceId}
            onPress={() => changeSettings({ sourceId: choice.id })}
          />
        </View>
      ))}
      <View style={styles.row}>
        <ChromeButton
          palette={palette}
          label={`${settings.isGuitarMode ? '☑' : '☐'}  ${t('tools.midiInput.guitarMode')}`}
          tooltip={t('tools.midiInput.guitarModeTooltip')}
          isActive={settings.isGuitarMode}
          onPress={() => changeSettings({ isGuitarMode: !settings.isGuitarMode })}
        />
      </View>
      <View style={styles.row}>
        <ChromeButton
          palette={palette}
          label={`${settings.usesVelocity ? '☑' : '☐'}  ${t('tools.midiInput.velocity')}`}
          tooltip={t('tools.midiInput.velocityTooltip')}
          isActive={settings.usesVelocity}
          onPress={() => changeSettings({ usesVelocity: !settings.usesVelocity })}
        />
      </View>
      <Text style={[styles.note, { color: palette.chromeMuted }]}>{statusText(midiInput, t)}</Text>
      <Text style={[styles.note, { color: palette.chromeMuted }]}>{t('tools.midiInput.chordWindow', { ms: CHORD_WINDOW_MS })}</Text>
    </InspectorSection>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', marginBottom: 3 },
  note: { fontSize: 10, marginTop: 4 },
});
