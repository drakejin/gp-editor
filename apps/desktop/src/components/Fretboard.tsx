import { useCallback, useMemo, useState } from 'react';
import { type LayoutChangeEvent, StyleSheet, View } from 'react-native';
import type { Note, Track } from '@gp-editor/core';
import { ScoreCanvas } from '../native/score-canvas';
import { type PitchRegion, engraveFretboard, fretboardHeight, fretboardHoverRegions } from '../score/fretboard';
import type { ScaleHighlight } from '../score/scale-marks';
import type { Palette } from '../theme';
import { PitchAreas } from './PitchAreas';

interface FretboardProps {
  readonly track: Track;
  /** Notes to light up: the playing beat while playing, else the cursor's beat. */
  readonly notes: readonly Note[];
  readonly cursorString?: number;
  readonly palette: Palette;
  /** The Scales panel's scale, coloured on the neck. */
  readonly scale?: ScaleHighlight;
  /** With "Preview on hover" on: a fret the mouse enters (the pitch it sounds). */
  readonly onHoverPitch?: (pitch: number) => void;
  /** A position clicked: its string and the fret a note there stores (Guitar Pro 8 enters it at the cursor). */
  readonly onPressFret?: (string: number, fret: number) => void;
}

const SIDE_PADDING = 24;

/** 24-fret neck of the track's tuning, above the score in tab mode. */
export function Fretboard({ track, notes, cursorString, palette, scale, onHoverPitch, onPressFret }: FretboardProps) {
  const [width, setWidth] = useState(0);
  const onLayout = useCallback((event: LayoutChangeEvent) => setWidth(event.nativeEvent.layout.width - SIDE_PADDING * 2), []);
  const height = fretboardHeight(track.strings.length);
  const commands = useMemo(
    () => (width > 0 ? engraveFretboard({ track, width, palette, notes, cursorString, scale }) : []),
    [track, width, palette, notes, cursorString, scale],
  );
  const { strings, offset } = track;
  const hasAreas = onHoverPitch !== undefined || onPressFret !== undefined;
  // The strings and the capo only, so a note edit (a new track object) keeps the areas.
  const regions = useMemo(() => (width > 0 && hasAreas ? fretboardHoverRegions({ strings, offset }, width) : []), [strings, offset, width, hasAreas]);
  const pressRegion = useCallback((region: PitchRegion) => (region.neckNote === undefined ? undefined : onPressFret?.(region.neckNote.string, region.neckNote.fret)), [onPressFret]);
  if (track.isPercussion || track.strings.length === 0) {
    return null;
  }
  const size = { width: Math.max(0, width), height };
  return (
    <View style={[styles.container, { backgroundColor: palette.sidebar, borderColor: palette.border }]} onLayout={onLayout}>
      <View style={size}>
        <ScoreCanvas commands={commands} style={size} />
        {hasAreas ? <PitchAreas regions={regions} kind="fret" onHoverPitch={onHoverPitch} onPressRegion={onPressFret === undefined ? undefined : pressRegion} /> : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { paddingHorizontal: SIDE_PADDING, paddingVertical: 8, borderBottomWidth: StyleSheet.hairlineWidth },
});
