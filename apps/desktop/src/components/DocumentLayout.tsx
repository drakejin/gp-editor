import type { ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';

interface DocumentLayoutProps {
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
 * Guitar Pro 8's window under the top bar: the edition palette down the whole left side (so the instrument and tracks
 * panels never shorten it), and beside it score | inspector with the instrument and tracks panels below them.
 */
export function DocumentLayout({ left, center, right, bottom }: DocumentLayoutProps) {
  return (
    <View style={styles.window}>
      {left}
      <View style={styles.main}>
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
