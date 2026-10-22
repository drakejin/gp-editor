import type { ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';

interface DocumentLayoutProps {
  /** Edition palette (left), when shown. */
  readonly left?: ReactNode;
  /** The score page. */
  readonly center: ReactNode;
  /** Song / Track inspector (right), when shown. */
  readonly right?: ReactNode;
  /** Fretboard, then the tracks panel, across the bottom. */
  readonly bottom?: ReactNode;
}

/** Guitar Pro 8's window under the top bar: palette | score | inspector, with the instrument and tracks panels below. */
export function DocumentLayout({ left, center, right, bottom }: DocumentLayoutProps) {
  return (
    <View style={styles.window}>
      <View style={styles.middle}>
        {left}
        <View style={styles.center}>{center}</View>
        {right}
      </View>
      {bottom}
    </View>
  );
}

const styles = StyleSheet.create({
  window: { flex: 1 },
  middle: { flex: 1, flexDirection: 'row' },
  center: { flex: 1 },
});
