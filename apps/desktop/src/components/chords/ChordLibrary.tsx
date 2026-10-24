import { useDeferredValue, useMemo, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { type Chord, type NoteSpelling, type Song, type VoicingStyle, buildChordVoicings, parseChordName, recognizeChord, songChords } from '@gp-editor/core';
import { useT } from '../../hooks/use-i18n';
import type { MessageKey } from '../../lib/i18n/i18n';
import type { Palette } from '../../theme';
import { ChromeButton } from '../chrome/ChromeButton';
import { TextField } from '../TextField';
import { ChordThumb } from './ChordDiagramView';

/** The library's three lists, as Guitar Pro's chord library: by name, by the grid's frets, and the score's own chords. */
export type ChordLibraryTab = 'name' | 'position' | 'song';

const TABS: readonly { readonly id: ChordLibraryTab; readonly label: MessageKey; readonly tooltip: MessageKey }[] = [
  { id: 'name', label: 'tools.chords.byName', tooltip: 'tools.chords.byNameTooltip' },
  { id: 'position', label: 'tools.chords.byPosition', tooltip: 'tools.chords.byPositionTooltip' },
  { id: 'song', label: 'tools.chords.inTrack', tooltip: 'tools.chords.inTrackTooltip' },
];

const STYLES: readonly { readonly id: VoicingStyle; readonly label: MessageKey; readonly tooltip: MessageKey }[] = [
  { id: 'normal', label: 'tools.chords.style.normal', tooltip: 'tools.chords.style.normalTooltip' },
  { id: 'inversions', label: 'tools.chords.style.inversions', tooltip: 'tools.chords.style.inversionsTooltip' },
  { id: 'closeVoiced', label: 'tools.chords.style.close', tooltip: 'tools.chords.style.closeTooltip' },
  { id: 'openVoiced', label: 'tools.chords.style.open', tooltip: 'tools.chords.style.openTooltip' },
];

export interface ChordLibraryProps {
  readonly palette: Palette;
  readonly song: Song;
  readonly trackIndex: number;
  /** Open-string pitches of the track, string 1 first. */
  readonly tuning: readonly number[];
  readonly spelling: NoteSpelling;
  /** The grid's frets, for the names they can have. */
  readonly frets: readonly number[];
  /** A diagram was clicked: load it into the grid. */
  readonly onLoad: (chord: Chord) => void;
  /** A name was clicked: give the grid's chord that name. */
  readonly onName: (name: string) => void;
}

/** The chord library beside the chord editor: voicings found by name, names found by position, and the track's chords. */
export function ChordLibrary(props: ChordLibraryProps) {
  const { palette } = props;
  const [tab, setTab] = useState<ChordLibraryTab>('name');
  const t = useT();
  return (
    <View style={styles.library}>
      <View style={styles.tabs}>
        {TABS.map((candidate) => (
          <ChromeButton
            key={candidate.id}
            testID={`chord-library-${candidate.id}`}
            palette={palette}
            label={t(candidate.label)}
            tooltip={t(candidate.tooltip)}
            fontSize={11}
            isActive={tab === candidate.id}
            onPress={() => setTab(candidate.id)}
          />
        ))}
      </View>
      {tab === 'name' ? <ByName {...props} /> : tab === 'position' ? <ByPosition {...props} /> : <InSong {...props} />}
    </View>
  );
}

function ByName({ palette, tuning, spelling, onLoad }: ChordLibraryProps) {
  const [query, setQuery] = useState('');
  const [style, setStyle] = useState<VoicingStyle>('normal');
  const t = useT();
  // The field shows each key at once; the voicings follow when React has time (an 8-string search takes a moment).
  const searched = useDeferredValue(query);
  const spec = useMemo(() => parseChordName(searched), [searched]);
  const voicings = useMemo(() => (spec === undefined ? [] : buildChordVoicings(spec, tuning, { style, spelling })), [spec, tuning, style, spelling]);
  const message =
    searched.trim() === '' ? t('tools.chords.typeName') : spec === undefined ? t('tools.chords.notAChord', { name: searched.trim() }) : voicings.length === 0 ? t('tools.chords.noVoicing') : undefined;
  return (
    <>
      <View style={styles.searchRow}>
        <TextField
          testID="chord-search"
          accessibilityLabel={t('tools.chords.searchLabel')}
          value={query}
          onChangeText={setQuery}
          placeholder={t('tools.chords.searchPlaceholder')}
          placeholderTextColor={palette.chromeMuted}
          autoCorrect={false}
          style={[styles.field, { color: palette.chromeText, backgroundColor: palette.chromeDeep, borderColor: palette.chromeBorder }]}
        />
        {STYLES.map((candidate) => (
          <ChromeButton key={candidate.id} palette={palette} label={t(candidate.label)} tooltip={t(candidate.tooltip)} fontSize={10} isActive={style === candidate.id} onPress={() => setStyle(candidate.id)} />
        ))}
      </View>
      {message === undefined ? <ThumbGrid palette={palette} chords={voicings} onLoad={onLoad} testPrefix="chord-voicing" /> : <Hint palette={palette} text={message} />}
    </>
  );
}

function ByPosition({ palette, tuning, spelling, frets, onName }: ChordLibraryProps) {
  const proposals = useMemo(() => recognizeChord(frets, tuning, { spelling }), [frets, tuning, spelling]);
  const t = useT();
  if (proposals.length === 0) {
    return <Hint palette={palette} text={frets.some((fret) => fret >= 0) ? t('tools.chords.noKnownChord') : t('tools.chords.putFingers')} />;
  }
  return (
    <ScrollView style={styles.results} contentContainerStyle={styles.names}>
      {proposals.map((proposal, index) => (
        <ChromeButton
          key={proposal.name}
          testID={`chord-name-${index}`}
          palette={palette}
          label={`${proposal.name}  ${proposal.completeness}%`}
          tooltip={t('tools.chords.nameTooltip', { name: proposal.name, percent: proposal.completeness })}
          fontSize={12}
          onPress={() => onName(proposal.name)}
        />
      ))}
    </ScrollView>
  );
}

function InSong({ palette, song, trackIndex, onLoad }: ChordLibraryProps) {
  const chords = useMemo(() => songChords(song, trackIndex), [song, trackIndex]);
  const t = useT();
  return chords.length === 0 ? <Hint palette={palette} text={t('tools.chords.noChordsInTrack')} /> : <ThumbGrid palette={palette} chords={chords} onLoad={onLoad} testPrefix="chord-in-song" />;
}

function ThumbGrid({ palette, chords, onLoad, testPrefix }: { readonly palette: Palette; readonly chords: readonly Chord[]; readonly onLoad: (chord: Chord) => void; readonly testPrefix: string }) {
  return (
    <ScrollView style={styles.results} contentContainerStyle={styles.thumbs}>
      {chords.map((chord, index) => (
        <ChordThumb key={`${chord.name}-${chord.frets.join(',')}-${index}`} testID={`${testPrefix}-${index}`} palette={palette} chord={chord} onPress={() => onLoad(chord)} />
      ))}
    </ScrollView>
  );
}

function Hint({ palette, text }: { readonly palette: Palette; readonly text: string }) {
  return <Text style={[styles.hint, { color: palette.chromeMuted }]}>{text}</Text>;
}

const styles = StyleSheet.create({
  library: { flex: 1, minHeight: 0 },
  tabs: { flexDirection: 'row', marginBottom: 8 },
  searchRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 6 },
  field: { flex: 1, height: 24, borderWidth: 1, borderRadius: 5, paddingHorizontal: 7, fontSize: 13, marginRight: 6 },
  results: { flex: 1 },
  thumbs: { flexDirection: 'row', flexWrap: 'wrap' },
  names: { flexDirection: 'row', flexWrap: 'wrap', rowGap: 4 },
  hint: { fontSize: 12, marginTop: 8 },
});
