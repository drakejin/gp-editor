import { useMemo, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { type ScaleChoice, type Track, scaleBoxes, scaleNoteNames, scalePitchClasses } from '@gp-editor/core';
import { ScoreCanvas } from '../../native/score-canvas';
import { engraveScaleDiagram, scaleDiagramHeight } from '../../score/scale-diagram';
import type { Palette } from '../../theme';
import { ChromeButton } from '../chrome/ChromeButton';

interface ScaleBoxesProps {
  readonly palette: Palette;
  /** The shown track: its tuning and strings (3–10). */
  readonly track: Track;
  readonly choice: ScaleChoice;
  readonly width: number;
}

/** The note names spelled for the scale, by pitch class. */
function spelledNames(choice: ScaleChoice): ReadonlyMap<number, string> {
  const names = scaleNoteNames(choice);
  return new Map(scalePitchClasses(choice).map((pitchClass, i) => [pitchClass, names[i] ?? '']));
}

/** The scale's five-fret boxes on the track's neck, one at a time, drawn as a printed diagram; ◀ ▶ step through them. */
export function ScaleBoxes({ palette, track, choice, width }: ScaleBoxesProps) {
  const boxes = useMemo(() => scaleBoxes(choice, track.strings), [choice, track.strings]);
  const names = useMemo(() => spelledNames(choice), [choice]);
  const [boxIndex, setBoxIndex] = useState(0);
  const shown = Math.min(boxIndex, Math.max(0, boxes.length - 1));
  const box = boxes[shown];
  const commands = useMemo(() => (box === undefined ? [] : engraveScaleDiagram({ box, strings: track.strings, width, names })), [box, track.strings, width, names]);
  if (box === undefined) {
    return null;
  }
  return (
    <View>
      <View style={styles.stepper}>
        <ChromeButton palette={palette} label="◀" tooltip="Previous position" isEnabled={shown > 0} onPress={() => setBoxIndex(shown - 1)} />
        <Text style={[styles.position, { color: palette.chromeText }]}>{`Position ${shown + 1} of ${boxes.length} · frets ${box.firstFret}–${box.lastFret}`}</Text>
        <ChromeButton palette={palette} label="▶" tooltip="Next position" isEnabled={shown < boxes.length - 1} onPress={() => setBoxIndex(shown + 1)} />
      </View>
      <ScoreCanvas commands={commands} style={{ width, height: scaleDiagramHeight(track.strings.length) }} />
    </View>
  );
}

const styles = StyleSheet.create({
  stepper: { flexDirection: 'row', alignItems: 'center', marginBottom: 6 },
  position: { flex: 1, textAlign: 'center', fontSize: 12, fontWeight: '600' },
});
