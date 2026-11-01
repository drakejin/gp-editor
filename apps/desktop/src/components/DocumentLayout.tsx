import type { ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';

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
 * Guitar Pro 8's window under the tab strip: the edition palette down the whole left side, and beside it the hint, the
 * panels and the banners, score | inspector, and the instrument and tracks panels below them — so nothing but the
 * window's height shortens the palette (every tool shows at the default window: __tests__/palette-fit*.test.ts*).
 */
export function DocumentLayout({ top, left, center, right, bottom }: DocumentLayoutProps) {
  return (
    <View style={styles.window}>
      {left}
      <View style={styles.main}>
        {top}
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
  middle: { flex: 1, flexDirection: 'row' },
  center: { flex: 1 },
});
