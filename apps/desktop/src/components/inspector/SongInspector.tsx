import { StyleSheet, Text, View } from 'react-native';
import type { Song, SongInfo } from '@gp-editor/core';
import { useT } from '../../hooks/use-i18n';
import type { MidiInput } from '../../hooks/use-midi-input';
import { type MessageKey, t } from '../../lib/i18n/i18n';
import { formatClock, songSeconds } from '../../lib/song-time';
import type { SoundBanks } from '../../native/player';
import type { Palette } from '../../theme';
import { ChromeButton } from '../chrome/ChromeButton';
import { InspectorField, InspectorSection, InspectorTextField } from './InspectorParts';
import { MidiInputSection } from './MidiInputSection';

/** The song fields the inspector edits, in Guitar Pro's order. */
const INFO_FIELDS: readonly { readonly key: keyof Omit<SongInfo, 'notice'>; readonly label: MessageKey }[] = [
  { key: 'title', label: 'tools.inspector.info.title' },
  { key: 'subtitle', label: 'tools.inspector.info.subtitle' },
  { key: 'artist', label: 'tools.inspector.info.artist' },
  { key: 'album', label: 'tools.inspector.info.album' },
  { key: 'music', label: 'tools.inspector.info.music' },
  { key: 'words', label: 'tools.inspector.info.words' },
  { key: 'transcriber', label: 'tools.inspector.info.transcriber' },
  { key: 'copyright', label: 'tools.inspector.info.copyright' },
];

/** The programs the song's file came from, as every language writes them (a MIDI file is named in words: formatName). */
const FORMAT_NAMES: Readonly<Record<Exclude<Song['source']['format'], 'midi'>, string>> = {
  // i18n-exempt: product names
  gp1: 'Guitar Pro 1', gp2: 'Guitar Pro 2', gp3: 'Guitar Pro 3', gp4: 'Guitar Pro 4', gp5: 'Guitar Pro 5', gpx: 'Guitar Pro 6', gp7: 'Guitar Pro 7+', ptb: 'Power Tab', tef: 'TablEdit', musicxml: 'MusicXML',
};

function formatName(format: Song['source']['format']): string {
  return format === 'midi' ? t('tools.inspector.format.midi') : FORMAT_NAMES[format];
}

export interface SongInspectorProps {
  readonly palette: Palette;
  readonly song: Song;
  readonly soundBanks: SoundBanks;
  readonly onSetSongInfo: (info: Partial<SongInfo>) => void;
  readonly onSelectSoundBank: (id: string) => void;
  readonly onAddSoundBank: () => void;
  readonly onRemoveSoundBank: (id: string) => void;
  /** MIDI input settings (on this Mac); the section is left out without them. */
  readonly midiInput?: MidiInput;
}

/** The SONG tab: the song's information (saved in the file) and the sound bank every track plays with (not saved). */
export function SongInspector(props: SongInspectorProps) {
  const { palette, song } = props;
  const translate = useT();
  return (
    <>
      <InspectorSection palette={palette} title={translate('tools.inspector.information')}>
        {INFO_FIELDS.map(({ key, label }) => (
          <InspectorTextField key={key} palette={palette} label={translate(label)} value={song.info[key]} onCommit={(value) => props.onSetSongInfo({ [key]: value })} />
        ))}
        <InspectorField palette={palette} label={translate('tools.inspector.file')}>
          <Text style={[styles.facts, { color: palette.chromeMuted }]}>
            {[formatName(song.source.format), translate('common.tracks', { count: song.tracks.length }), translate('common.bars', { count: song.measureHeaders.length }), formatClock(songSeconds(song))].join(' · ')}
          </Text>
        </InspectorField>
      </InspectorSection>
      <SoundBankSection {...props} />
      {props.midiInput === undefined ? null : <MidiInputSection palette={palette} midiInput={props.midiInput} />}
    </>
  );
}

function SoundBankSection({ palette, soundBanks, onSelectSoundBank, onAddSoundBank, onRemoveSoundBank }: SongInspectorProps) {
  const translate = useT();
  return (
    <InspectorSection palette={palette} title={translate('tools.inspector.soundBank')}>
      {soundBanks.banks.map((bank) => (
        <View key={bank.id} style={styles.bankRow}>
          <ChromeButton
            palette={palette}
            label={`${bank.id === soundBanks.selectedId ? '●' : '○'}  ${bank.name}`}
            tooltip={translate('tools.inspector.playWithBank', { name: bank.name })}
            isActive={bank.id === soundBanks.selectedId}
            onPress={() => onSelectSoundBank(bank.id)}
          />
          {bank.isRemovable ? <ChromeButton palette={palette} label={translate('common.remove')} tooltip={translate('tools.inspector.removeBank', { name: bank.name })} onPress={() => onRemoveSoundBank(bank.id)} /> : null}
        </View>
      ))}
      <View style={styles.bankRow}>
        <ChromeButton palette={palette} label={translate('tools.inspector.addSoundFont')} tooltip={translate('tools.inspector.addSoundFontTooltip')} onPress={onAddSoundBank} />
      </View>
      <Text style={[styles.note, { color: palette.chromeMuted }]}>{translate('tools.inspector.onThisMac')}</Text>
    </InspectorSection>
  );
}

const styles = StyleSheet.create({
  facts: { fontSize: 11, flexShrink: 1 },
  bankRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 3 },
  note: { fontSize: 10, marginTop: 4 },
});
