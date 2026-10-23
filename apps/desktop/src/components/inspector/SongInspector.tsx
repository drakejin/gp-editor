import { StyleSheet, Text, View } from 'react-native';
import type { Song, SongInfo } from '@gp-editor/core';
import type { MidiInput } from '../../hooks/use-midi-input';
import { formatClock, songSeconds } from '../../lib/song-time';
import { plural } from '../../lib/wording';
import type { SoundBanks } from '../../native/player';
import type { Palette } from '../../theme';
import { ChromeButton } from '../chrome/ChromeButton';
import { InspectorField, InspectorSection, InspectorTextField } from './InspectorParts';
import { MidiInputSection } from './MidiInputSection';

/** The song fields the inspector edits, in Guitar Pro's order. */
const INFO_FIELDS: readonly { readonly key: keyof Omit<SongInfo, 'notice'>; readonly label: string }[] = [
  { key: 'title', label: 'Title' },
  { key: 'subtitle', label: 'Subtitle' },
  { key: 'artist', label: 'Artist' },
  { key: 'album', label: 'Album' },
  { key: 'music', label: 'Music' },
  { key: 'words', label: 'Words' },
  { key: 'transcriber', label: 'Tab by' },
  { key: 'copyright', label: 'Copyright' },
];

const FORMAT_NAMES: Readonly<Record<Song['source']['format'], string>> = {
  gp1: 'Guitar Pro 1',
  gp2: 'Guitar Pro 2',
  gp3: 'Guitar Pro 3',
  gp4: 'Guitar Pro 4',
  gp5: 'Guitar Pro 5',
  gpx: 'Guitar Pro 6',
  gp7: 'Guitar Pro 7+',
};

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
  return (
    <>
      <InspectorSection palette={palette} title="INFORMATION">
        {INFO_FIELDS.map(({ key, label }) => (
          <InspectorTextField key={key} palette={palette} label={label} value={song.info[key]} onCommit={(value) => props.onSetSongInfo({ [key]: value })} />
        ))}
        <InspectorField palette={palette} label="File">
          <Text style={[styles.facts, { color: palette.chromeMuted }]}>
            {[FORMAT_NAMES[song.source.format], plural(song.tracks.length, 'track'), plural(song.measureHeaders.length, 'bar'), formatClock(songSeconds(song))].join(' · ')}
          </Text>
        </InspectorField>
      </InspectorSection>
      <SoundBankSection {...props} />
      {props.midiInput === undefined ? null : <MidiInputSection palette={palette} midiInput={props.midiInput} />}
    </>
  );
}

function SoundBankSection({ palette, soundBanks, onSelectSoundBank, onAddSoundBank, onRemoveSoundBank }: SongInspectorProps) {
  return (
    <InspectorSection palette={palette} title="SOUND BANK">
      {soundBanks.banks.map((bank) => (
        <View key={bank.id} style={styles.bankRow}>
          <ChromeButton
            palette={palette}
            label={`${bank.id === soundBanks.selectedId ? '●' : '○'}  ${bank.name}`}
            tooltip={`Play every track with ${bank.name}`}
            isActive={bank.id === soundBanks.selectedId}
            onPress={() => onSelectSoundBank(bank.id)}
          />
          {bank.isRemovable ? <ChromeButton palette={palette} label="Remove" tooltip={`Remove ${bank.name} from the app`} onPress={() => onRemoveSoundBank(bank.id)} /> : null}
        </View>
      ))}
      <View style={styles.bankRow}>
        <ChromeButton palette={palette} label="Add SoundFont…" tooltip="Add a SoundFont (.sf2) or DLS bank" onPress={onAddSoundBank} />
      </View>
      <Text style={[styles.note, { color: palette.chromeMuted }]}>For playback on this Mac; not saved in the file.</Text>
    </InspectorSection>
  );
}

const styles = StyleSheet.create({
  facts: { fontSize: 11, flexShrink: 1 },
  bankRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 3 },
  note: { fontSize: 10, marginTop: 4 },
});
