import { useMemo } from 'react';
import { type GestureResponderEvent, Pressable, StyleSheet, Text } from 'react-native';
import { type Chord, chordLabel } from '@gp-editor/core';
import type { ChordDraft } from '../../lib/chord-grid';
import { ScoreCanvas } from '../../native/score-canvas';
import { type DiagramHit, diagramHeight, diagramWidth, engraveChordDiagram, hitTestDiagram } from '../../score/chord-diagram';
import { scaleCommands } from '../../score/draw';
import type { Palette } from '../../theme';

/** Room around a diagram, in diagram points: the first-fret number on the left, as much on the right. */
const SIDE = 12;
const TOP = 2;
/** The editor's grid, and the library's diagrams. */
export const GRID_SCALE = 3.6;
const THUMB_SCALE = 1.7;

function canvasSize(stringCount: number) {
  return { width: diagramWidth(stringCount) + 2 * SIDE, height: diagramHeight() + 2 * TOP };
}

interface ChordGridProps {
  readonly palette: Palette;
  readonly draft: ChordDraft;
  /** A click on a fret, or on the open-string row above the nut. */
  readonly onToggle: (string: number, fret: DiagramHit['fret']) => void;
}

/** The chord panel's grid (TuxGuitar's chord editor): a click puts a finger on a fret or takes it off; above the nut, open or not played. */
export function ChordGrid({ palette, draft, onToggle }: ChordGridProps) {
  const stringCount = draft.frets.length;
  const size = canvasSize(stringCount);
  const commands = useMemo(
    () => scaleCommands(engraveChordDiagram({ name: draft.name, firstFret: draft.firstFret, frets: draft.frets }, size.width / 2, TOP, palette.chromeText, draft.firstFret), GRID_SCALE),
    [draft, size.width, palette.chromeText],
  );
  const press = (event: GestureResponderEvent) => {
    const { locationX, locationY } = event.nativeEvent;
    const hit = hitTestDiagram(stringCount, draft.firstFret, size.width / 2, TOP, locationX / GRID_SCALE, locationY / GRID_SCALE);
    if (hit !== undefined) {
      onToggle(hit.string, hit.fret);
    }
  };
  const style = { width: size.width * GRID_SCALE, height: size.height * GRID_SCALE };
  return (
    <Pressable testID="chord-grid" accessibilityLabel="Chord grid" onPressIn={press} style={style}>
      <ScoreCanvas commands={commands} style={style} />
    </Pressable>
  );
}

interface ChordThumbProps {
  readonly palette: Palette;
  readonly chord: Chord;
  readonly onPress: () => void;
  readonly testID?: string;
}

/** A small diagram with its name under it, to load into the grid. */
export function ChordThumb({ palette, chord, onPress, testID }: ChordThumbProps) {
  const size = canvasSize(chord.frets.length);
  const commands = useMemo(() => scaleCommands(engraveChordDiagram(chord, size.width / 2, TOP, palette.chromeText), THUMB_SCALE), [chord, size.width, palette.chromeText]);
  const label = chordLabel(chord);
  const style = { width: size.width * THUMB_SCALE, height: size.height * THUMB_SCALE };
  return (
    <Pressable testID={testID} onPress={onPress} tooltip={`Load ${label === '' ? 'this chord' : label} into the grid`} style={[styles.thumb, { backgroundColor: palette.chromeDeep }]}>
      <ScoreCanvas commands={commands} style={style} />
      <Text numberOfLines={1} style={[styles.thumbName, { color: palette.chromeText, width: style.width }]}>
        {label === '' ? '—' : label}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  thumb: { alignItems: 'center', borderRadius: 6, paddingVertical: 4, paddingHorizontal: 2, margin: 3 },
  thumbName: { fontSize: 11, fontWeight: '700', textAlign: 'center', marginTop: 1 },
});
