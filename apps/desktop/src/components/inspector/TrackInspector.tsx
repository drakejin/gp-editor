import { StyleSheet, Text, View } from 'react-native';
import type { Song } from '@gp-editor/core';
import { trackInstrument } from '../../lib/instruments';
import { type ScoreMode, type Staff, showsStaff, toggleStaff } from '../../score/geometry';
import { type Palette, onChrome } from '../../theme';
import { ChromeButton } from '../chrome/ChromeButton';
import { NeckSettings } from '../NeckSettings';
import { InspectorField, InspectorSection, InspectorTextField } from './InspectorParts';

/** Highest capo fret the inspector offers. */
const MAX_CAPO = 24;

export interface TrackInspectorProps {
  readonly palette: Palette;
  readonly song: Song;
  readonly trackIndex: number;
  readonly mode: ScoreMode;
  /** What the last retune could not keep. */
  readonly notice?: string;
  readonly onChangeMode: (mode: ScoreMode) => void;
  readonly onSetTrackName: (trackIndex: number, name: string) => void;
  readonly onSetTrackCapo: (trackIndex: number, capo: number) => void;
  readonly onSetTrackTuning: (trackIndex: number, tuning: readonly number[]) => void;
  readonly onDismissNotice: () => void;
  readonly onEditInstrument: (trackIndex: number) => void;
}

const STAVES: readonly { readonly staff: Staff; readonly label: string; readonly tooltip: string }[] = [
  { staff: 'standard', label: 'Standard', tooltip: 'Show standard notation' },
  { staff: 'tab', label: 'Tab', tooltip: 'Show tablature' },
];

/** The TRACK tab: the shown track's name, notation, tuning and capo, and its instrument. */
export function TrackInspector(props: TrackInspectorProps) {
  const { palette, song, trackIndex, mode } = props;
  const track = song.tracks[trackIndex];
  if (track === undefined) {
    return null;
  }
  const instrument = trackInstrument(song, trackIndex);
  return (
    <>
      <InspectorSection palette={palette} title="INFORMATION">
        <InspectorTextField palette={palette} label="Name" value={track.name} onCommit={(name) => props.onSetTrackName(trackIndex, name)} />
        <InspectorField palette={palette} label="Track">
          <View style={[styles.swatch, { backgroundColor: `rgb(${track.color.r},${track.color.g},${track.color.b})` }]} />
          <Text style={[styles.value, { color: palette.chromeText }]}>{`${track.number} of ${song.tracks.length} · ${track.strings.length} strings`}</Text>
        </InspectorField>
      </InspectorSection>
      <InspectorSection palette={palette} title="MUSICAL NOTATION">
        <InspectorField palette={palette} label="Notation">
          {STAVES.map(({ staff, label, tooltip }) => (
            <ChromeButton key={staff} palette={palette} label={label} tooltip={tooltip} isActive={showsStaff(mode, staff)} onPress={() => props.onChangeMode(toggleStaff(mode, staff))} />
          ))}
        </InspectorField>
        {track.isPercussion ? null : (
          <>
            <InspectorField palette={palette} label="Capo">
              <ChromeButton palette={palette} label="−" tooltip="Capo one fret lower" isEnabled={track.offset > 0} onPress={() => props.onSetTrackCapo(trackIndex, track.offset - 1)} />
              <Text style={[styles.capo, { color: palette.chromeText }]}>{track.offset === 0 ? 'None' : `Fret ${track.offset}`}</Text>
              <ChromeButton palette={palette} label="+" tooltip="Capo one fret higher" isEnabled={track.offset < MAX_CAPO} onPress={() => props.onSetTrackCapo(trackIndex, track.offset + 1)} />
            </InspectorField>
            <NeckSettings
              song={song}
              trackIndex={trackIndex}
              notice={props.notice}
              palette={onChrome(palette)}
              onSetTuning={(tuning) => props.onSetTrackTuning(trackIndex, tuning)}
              onDismissNotice={props.onDismissNotice}
              style={styles.tuning}
            />
          </>
        )}
      </InspectorSection>
      <InspectorSection palette={palette} title="SOUNDS">
        <InspectorField palette={palette} label="Instrument">
          <ChromeButton
            palette={palette}
            label={track.isPercussion ? '♪ Drums (standard kit)' : `♪ ${instrument?.name ?? 'Instrument'} ▾`}
            tooltip={track.isPercussion ? 'Guitar Pro 3–5 files hold no drum-kit setting' : 'Choose the track’s instrument'}
            isEnabled={!track.isPercussion}
            onPress={() => props.onEditInstrument(trackIndex)}
          />
        </InspectorField>
      </InspectorSection>
    </>
  );
}

const styles = StyleSheet.create({
  swatch: { width: 12, height: 12, borderRadius: 3, marginRight: 6 },
  value: { fontSize: 11 },
  capo: { minWidth: 52, textAlign: 'center', fontSize: 12, fontWeight: '600' },
  tuning: { paddingHorizontal: 0, paddingTop: 4, backgroundColor: 'transparent' },
});
