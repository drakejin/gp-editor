import { StyleSheet, View } from 'react-native';

/** Which side of the window a panel toggle shows or hides. */
export type PanelSide = 'left' | 'right' | 'bottom' | 'neck';

interface PanelIconProps {
  readonly side: PanelSide;
  readonly color: string;
}

/** A window outline with the panel's side filled in (Guitar Pro's panel toggles); the neck shows frets and strings. */
export function PanelIcon({ side, color }: PanelIconProps) {
  if (side === 'neck') {
    return (
      <View style={[styles.frame, { borderColor: color }]}>
        {[0, 1, 2].map((string) => (
          <View key={`s${string}`} style={[styles.string, { top: 2 + string * 3, backgroundColor: color }]} />
        ))}
        {[0, 1, 2].map((fret) => (
          <View key={`f${fret}`} style={[styles.fret, { left: 4 + fret * 4, backgroundColor: color }]} />
        ))}
      </View>
    );
  }
  return (
    <View style={[styles.frame, { borderColor: color }]}>
      <View style={[styles.fill, FILLS[side], { backgroundColor: color }]} />
    </View>
  );
}

const FILLS = StyleSheet.create({
  left: { left: 0, top: 0, bottom: 0, width: 5 },
  right: { right: 0, top: 0, bottom: 0, width: 5 },
  bottom: { left: 0, right: 0, bottom: 0, height: 4 },
});

const styles = StyleSheet.create({
  frame: { width: 18, height: 13, borderWidth: 1.5, borderRadius: 2.5, overflow: 'hidden' },
  fill: { position: 'absolute' },
  string: { position: 'absolute', left: 0, right: 0, height: 1 },
  fret: { position: 'absolute', top: 0, bottom: 0, width: 1 },
});
