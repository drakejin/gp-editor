import { useCallback, useMemo, useState } from 'react';
import { type LayoutChangeEvent, StyleSheet, View } from 'react-native';
import type { Note, Track } from '@gp-editor/core';
import { ScoreCanvas } from '../native/score-canvas';
import { engraveFretboard, fretboardHeight } from '../score/fretboard';
import type { ScaleHighlight } from '../score/scale-marks';
import type { Palette } from '../theme';

interface FretboardProps {
  readonly track: Track;
  /** Notes to light up: the playing beat while playing, else the cursor's beat. */
  readonly notes: readonly Note[];
  readonly cursorString?: number;
  readonly palette: Palette;
  /** The Scales panel's scale, coloured on the neck. */
  readonly scale?: ScaleHighlight;
}

const SIDE_PADDING = 24;

/** 24-fret neck of the track's tuning, above the score in tab mode. */
export function Fretboard({ track, notes, cursorString, palette, scale }: FretboardProps) {
  const [width, setWidth] = useState(0);
  const onLayout = useCallback((event: LayoutChangeEvent) => setWidth(event.nativeEvent.layout.width - SIDE_PADDING * 2), []);
  const height = fretboardHeight(track.strings.length);
  const commands = useMemo(
    () => (width > 0 ? engraveFretboard({ track, width, palette, notes, cursorString, scale }) : []),
    [track, width, palette, notes, cursorString, scale],
  );
  if (track.isPercussion || track.strings.length === 0) {
    return null;
  }
  return (
    <View style={[styles.container, { backgroundColor: palette.sidebar, borderColor: palette.border }]} onLayout={onLayout}>
      <ScoreCanvas commands={commands} style={{ width: Math.max(0, width), height }} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { paddingHorizontal: SIDE_PADDING, paddingVertical: 8, borderBottomWidth: StyleSheet.hairlineWidth },
});
