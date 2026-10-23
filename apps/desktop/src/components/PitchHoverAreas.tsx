import { memo } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import type { PitchRegion } from '../score/fretboard';

interface PitchHoverAreasProps {
  /** Areas in the canvas's points, in drawing order (later ones lie on top). */
  readonly regions: readonly PitchRegion[];
  /** Names each area's test id: "hover-key-60", "hover-fret-64". */
  readonly kind: 'key' | 'fret';
  readonly onHoverPitch: (pitch: number) => void;
}

/**
 * Invisible areas over an instrument view's canvas, one per key or fret: the mouse entering one plays its pitch (the
 * "Preview on hover" setting). On react-native-macos only a Pressable reports the mouse coming in (onHoverIn), and
 * a view has no mouse-move events, so each pitch gets one.
 */
function PitchHoverAreasView({ regions, kind, onHoverPitch }: PitchHoverAreasProps) {
  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="box-none">
      {regions.map((region, index) => (
        <Pressable
          // A pitch can sit on several strings: the index keeps the keys apart.
          key={`${region.pitch}-${index}`}
          testID={`hover-${kind}-${region.pitch}`}
          onHoverIn={() => onHoverPitch(region.pitch)}
          style={[styles.area, { left: region.x, top: region.y, width: region.width, height: region.height }]}
        />
      ))}
    </View>
  );
}

export const PitchHoverAreas = memo(PitchHoverAreasView);

const styles = StyleSheet.create({
  area: { position: 'absolute' },
});
