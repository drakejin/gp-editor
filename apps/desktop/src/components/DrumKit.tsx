import { useCallback, useMemo, useState } from 'react';
import { type GestureResponderEvent, type LayoutChangeEvent, Pressable, StyleSheet, View } from 'react-native';
import { ScoreCanvas } from '../native/score-canvas';
import { drumKitHeight, engraveDrumKit, hitTestDrumKit } from '../score/drum-kit';
import type { Palette } from '../theme';

interface DrumKitProps {
  /** General MIDI keys to light: the playing beat's drums while playing, else the cursor's beat's. */
  readonly keys: readonly number[];
  readonly palette: Palette;
  /** A piece was clicked: the drum it enters. */
  readonly onHit: (key: number) => void;
}

const SIDE_PADDING = 24;

/** A drum kit seen from above, in the instrument view of a drum track: the sounding drums lit, a click enters one. */
export function DrumKit({ keys, palette, onHit }: DrumKitProps) {
  const [width, setWidth] = useState(0);
  const onLayout = useCallback((event: LayoutChangeEvent) => setWidth(event.nativeEvent.layout.width - SIDE_PADDING * 2), []);
  const commands = useMemo(() => (width > 0 ? engraveDrumKit({ width, keys, palette }) : []), [width, keys, palette]);
  const height = drumKitHeight(Math.max(0, width));
  const handlePress = useCallback(
    (event: GestureResponderEvent) => {
      const hit = hitTestDrumKit(width, event.nativeEvent.locationX, event.nativeEvent.locationY);
      if (hit !== undefined) {
        onHit(hit.key);
      }
    },
    [width, onHit],
  );
  return (
    <View style={[styles.container, { backgroundColor: palette.sidebar, borderColor: palette.border }]} onLayout={onLayout}>
      <Pressable onPressIn={handlePress} tooltip="Click a drum to enter it at the cursor" accessibilityLabel="Drum kit" style={{ width: Math.max(0, width), height }}>
        <ScoreCanvas commands={commands} style={{ width: Math.max(0, width), height }} />
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { paddingHorizontal: SIDE_PADDING, paddingVertical: 8, borderBottomWidth: StyleSheet.hairlineWidth },
});
