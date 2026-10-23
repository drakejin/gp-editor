import { useCallback, useMemo, useState } from 'react';
import { type LayoutChangeEvent, StyleSheet, View } from 'react-native';
import { ScoreCanvas } from '../native/score-canvas';
import { engraveKeyboard, keyboardHeight } from '../score/keyboard';
import type { ScaleHighlight } from '../score/scale-marks';
import type { Palette } from '../theme';

interface KeyboardProps {
  /** Pitches to light (MIDI): the playing beat while playing, else the cursor's beat. */
  readonly pitches: readonly number[];
  readonly palette: Palette;
  /** The Scales panel's scale, dotted on its keys. */
  readonly scale?: ScaleHighlight;
}

const SIDE_PADDING = 24;

/** An 88-key piano keyboard with the sounding notes lit, above the fretboard. */
export function Keyboard({ pitches, palette, scale }: KeyboardProps) {
  const [width, setWidth] = useState(0);
  const onLayout = useCallback((event: LayoutChangeEvent) => setWidth(event.nativeEvent.layout.width - SIDE_PADDING * 2), []);
  const commands = useMemo(() => (width > 0 ? engraveKeyboard({ width, pitches, palette, scale }) : []), [width, pitches, palette, scale]);
  return (
    <View style={[styles.container, { backgroundColor: palette.sidebar, borderColor: palette.border }]} onLayout={onLayout}>
      <ScoreCanvas commands={commands} style={{ width: Math.max(0, width), height: keyboardHeight() }} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { paddingHorizontal: SIDE_PADDING, borderBottomWidth: StyleSheet.hairlineWidth },
});
