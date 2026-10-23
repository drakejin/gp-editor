import { type ReactNode, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { SCALE_ROOTS, type ScaleChoice, type ScaleMatch, type Song, findScales, scaleNoteNames, scaleTitle } from '@gp-editor/core';
import { type NoteSource, hasScaleNeck, selectionNotes, sourceSummary, trackNotes } from '../../lib/scale-sources';
import type { BeatRange } from '../../score/selection-tint';
import type { Palette } from '../../theme';
import { ChromeButton } from '../chrome/ChromeButton';
import { ScaleBoxes } from './ScaleBoxes';
import { MatchList, ScaleList } from './ScaleList';

/** The panel takes the inspector's place on the right while it is open. */
export const SCALES_PANEL_WIDTH = 320;
const BODY_PADDING = 12;
const DIAGRAM_WIDTH = SCALES_PANEL_WIDTH - BODY_PADDING * 2;

export interface ScalesPanelProps {
  readonly palette: Palette;
  readonly song: Song;
  /** The shown track: its notes for the finder, its neck for the boxes. */
  readonly trackIndex: number;
  /** The selected beats; without one, Find reads the cursor's bar. */
  readonly selection?: BeatRange;
  readonly cursorMeasureIndex: number;
  /** The scale marked on the keyboard and the fretboard. */
  readonly choice?: ScaleChoice;
  readonly onChoose: (choice: ScaleChoice) => void;
  readonly onClear: () => void;
  readonly onClose: () => void;
}

/** The finder's last answer: where the notes came from and the scales that hold them. */
interface Found {
  readonly source: NoteSource;
  readonly matches: readonly ScaleMatch[];
}

function Section({ palette, label, children }: { readonly palette: Palette; readonly label: string; readonly children: ReactNode }) {
  return (
    <View style={styles.section}>
      <Text style={[styles.label, { color: palette.chromeMuted }]}>{label.toUpperCase()}</Text>
      {children}
    </View>
  );
}

/**
 * Tools ▸ Scales… (TuxGuitar's scale dialog, with Guitar Pro 8's scale finder and boxes): pick a root and a scale from
 * the searchable list, or find the scales that hold the selection's or the track's notes. The chosen scale is marked
 * on the piano keyboard and the fretboard, and drawn here box by box on the track's neck.
 */
export function ScalesPanel(props: ScalesPanelProps) {
  const { palette, song, trackIndex, choice, onChoose } = props;
  const [rootIndex, setRootIndex] = useState(choice?.rootIndex ?? 0);
  const [query, setQuery] = useState('');
  const [found, setFound] = useState<Found | undefined>(undefined);
  const chooseRoot = (index: number) => {
    setRootIndex(index);
    if (choice !== undefined) {
      onChoose({ rootIndex: index, scaleIndex: choice.scaleIndex });
    }
  };
  const find = (source: NoteSource) => setFound({ source, matches: findScales(source.pitches) });
  const chooseMatch = (next: ScaleChoice) => {
    setRootIndex(next.rootIndex);
    onChoose(next);
  };
  const where = props.selection === undefined ? `bar ${props.cursorMeasureIndex + 1}` : 'the selection';
  return (
    <View style={[styles.panel, { backgroundColor: palette.chrome, borderColor: palette.chromeBorder }]} accessibilityLabel="Scales">
      <View style={[styles.header, { backgroundColor: palette.chromeDeep }]}>
        <Text style={[styles.title, { color: palette.chromeText }]}>Scales</Text>
        <ChromeButton palette={palette} label="Clear" tooltip="Clear the scale from the keyboard and the fretboard" fontSize={11} isEnabled={choice !== undefined} onPress={props.onClear} />
        <ChromeButton palette={palette} label="Close" tooltip="Close the Scales panel" fontSize={11} onPress={props.onClose} />
      </View>
      <ScrollView contentContainerStyle={styles.body}>
        <Section palette={palette} label="Root">
          <View style={styles.wrap}>
            {SCALE_ROOTS.map((root, index) => (
              <ChromeButton key={root.name} palette={palette} label={root.name} tooltip={`Root: ${root.name}`} fontSize={11} minWidth={28} isActive={index === rootIndex} onPress={() => chooseRoot(index)} />
            ))}
          </View>
        </Section>
        <Section palette={palette} label="Find">
          <View style={styles.wrap}>
            <ChromeButton palette={palette} label={props.selection === undefined ? `From bar ${props.cursorMeasureIndex + 1}` : 'From selection'} tooltip={props.selection === undefined ? `Find the scales that hold the notes of ${where}` : 'Find the scales that hold the selected notes'} fontSize={11} onPress={() => find(selectionNotes(song, trackIndex, props.selection, props.cursorMeasureIndex))} />
            <ChromeButton palette={palette} label="From track" tooltip="Find the scales that hold every note of the track" fontSize={11} onPress={() => find(trackNotes(song, trackIndex))} />
            {found === undefined ? null : <ChromeButton palette={palette} label="All scales" tooltip="Back to every scale" fontSize={11} onPress={() => setFound(undefined)} />}
          </View>
          {found === undefined ? null : <Text style={[styles.note, { color: palette.chromeMuted }]}>{sourceSummary(found.source)}</Text>}
        </Section>
        <Section palette={palette} label={found === undefined ? 'Scale' : 'Matches'}>
          {found === undefined ? (
            <ScaleList palette={palette} query={query} onChangeQuery={setQuery} selectedScaleIndex={choice?.scaleIndex} onChooseScale={(scaleIndex) => onChoose({ rootIndex, scaleIndex })} />
          ) : (
            <MatchList palette={palette} matches={found.matches} choice={choice} onChoose={chooseMatch} />
          )}
        </Section>
        {choice === undefined ? null : <ChosenScale palette={palette} choice={choice} song={song} trackIndex={trackIndex} />}
      </ScrollView>
    </View>
  );
}

/** The chosen scale: its title and notes, then its boxes on the shown track's neck. */
function ChosenScale({ palette, choice, song, trackIndex }: { readonly palette: Palette; readonly choice: ScaleChoice; readonly song: Song; readonly trackIndex: number }) {
  const track = song.tracks[trackIndex];
  return (
    <Section palette={palette} label={scaleTitle(choice)}>
      <Text style={[styles.notes, { color: palette.chromeText }]}>{scaleNoteNames(choice).join(' ')}</Text>
      {hasScaleNeck(track) ? (
        <ScaleBoxes key={`${choice.rootIndex}:${choice.scaleIndex}:${trackIndex}`} palette={palette} track={track} choice={choice} width={DIAGRAM_WIDTH} />
      ) : (
        <Text style={[styles.note, { color: palette.chromeMuted }]}>Boxes need a pitched track of 3 to 10 strings.</Text>
      )}
    </Section>
  );
}

const styles = StyleSheet.create({
  panel: { width: SCALES_PANEL_WIDTH, borderLeftWidth: 1 },
  header: { flexDirection: 'row', alignItems: 'center', height: 32, paddingLeft: BODY_PADDING, paddingRight: 6 },
  title: { flex: 1, fontSize: 13, fontWeight: '800' },
  body: { padding: BODY_PADDING, rowGap: 10 },
  section: { rowGap: 4 },
  label: { fontSize: 10, fontWeight: '800', letterSpacing: 0.6 },
  wrap: { flexDirection: 'row', flexWrap: 'wrap', rowGap: 2 },
  note: { fontSize: 11 },
  notes: { fontSize: 14, fontWeight: '700', letterSpacing: 1 },
});
