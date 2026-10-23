import { useCallback, useMemo, useState } from 'react';
import { type LayoutChangeEvent, StyleSheet, View } from 'react-native';
import { ScoreCanvas } from '../native/score-canvas';
import { engraveKeyboard, keyboardHeight, keyboardHoverRegions } from '../score/keyboard';
import type { ScaleHighlight } from '../score/scale-marks';
import type { Palette } from '../theme';
import { PitchHoverAreas } from './PitchHoverAreas';

interface KeyboardProps {
  /** Pitches to light (MIDI): the playing beat while playing, else the cursor's beat. */
  readonly pitches: readonly number[];
  readonly palette: Palette;
  /** The Scales panel's scale, dotted on its keys. */
  readonly scale?: ScaleHighlight;
  /** With "Preview on hover" on: a key the mouse enters (its pitch). */
  readonly onHoverPitch?: (pitch: number) => void;
}

const SIDE_PADDING = 24;

/** An 88-key piano keyboard with the sounding notes lit, above the fretboard. */
export function Keyboard({ pitches, palette, scale, onHoverPitch }: KeyboardProps) {
  const [width, setWidth] = useState(0);
  const onLayout = useCallback((event: LayoutChangeEvent) => setWidth(event.nativeEvent.layout.width - SIDE_PADDING * 2), []);
  const commands = useMemo(() => (width > 0 ? engraveKeyboard({ width, pitches, palette, scale }) : []), [width, pitches, palette, scale]);
  const regions = useMemo(() => (width > 0 && onHoverPitch !== undefined ? keyboardHoverRegions(width) : []), [width, onHoverPitch]);
  const size = { width: Math.max(0, width), height: keyboardHeight() };
  return (
    <View style={[styles.container, { backgroundColor: palette.sidebar, borderColor: palette.border }]} onLayout={onLayout}>
      <View style={size}>
        <ScoreCanvas commands={commands} style={size} />
        {onHoverPitch === undefined ? null : <PitchHoverAreas regions={regions} kind="key" onHoverPitch={onHoverPitch} />}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { paddingHorizontal: SIDE_PADDING, borderBottomWidth: StyleSheet.hairlineWidth },
});
