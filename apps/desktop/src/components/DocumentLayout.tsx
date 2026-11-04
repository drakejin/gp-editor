import type { ReactNode } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';

interface DocumentLayoutProps {
  /** The hint, the panels and the banners under the tab strip: over the score, beside the palette. */
  readonly top?: ReactNode;
  /** Edition palette (left), when shown. */
  readonly left?: ReactNode;
  /** The score page. */
  readonly center: ReactNode;
  /** Song / Track inspector (right), when shown. */
  readonly right?: ReactNode;
  /** Fretboard, then the tracks panel, across the bottom beside the palette. */
  readonly bottom?: ReactNode;
}

/**
 * The score's least height under the panels over it, in points: a system's tab and part of its notation, room to click
 * another beat (the annotation panel's own instruction) with the lyrics and annotation panels open at 1280 × 800.
 */
export const MIN_SCORE_HEIGHT = 180;

/**
 * Guitar Pro 8's window under the tab strip: the edition palette down the whole left side, and beside it the hint, the
 * panels and the banners, score | inspector, and the instrument and tracks panels below them — so nothing but the
 * window's height shortens the palette (every tool shows at the default window: __tests__/palette-fit*.test.ts*). The top
 * takes the room it needs but leaves the score MIN_SCORE_HEIGHT, the tracks panel giving way with it (down to its
 * `TRACKS_PANEL.minHeight`): past that, its panels scroll.
 */
export function DocumentLayout({ top, left, center, right, bottom }: DocumentLayoutProps) {
  return (
    <View style={styles.window}>
      {left}
      <View style={styles.main}>
        <ScrollView style={styles.top}>{top}</ScrollView>
        <View style={styles.middle}>
          <View style={styles.center}>{center}</View>
          {right}
        </View>
        {bottom}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  window: { flex: 1, flexDirection: 'row' },
  main: { flex: 1 },
  top: { flexGrow: 0, flexShrink: 1 },
  middle: { flex: 1, flexDirection: 'row', minHeight: MIN_SCORE_HEIGHT },
  center: { flex: 1 },
});
