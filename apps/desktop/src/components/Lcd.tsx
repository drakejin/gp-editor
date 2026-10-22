import { StyleSheet, Text, View } from 'react-native';
import type { LcdInfo } from '../lib/lcd';
import { MONO_FONT, type Palette } from '../theme';

interface LcdProps {
  readonly palette: Palette;
  readonly info?: LcdInfo;
  /** The shown track's colour. */
  readonly trackColor?: string;
}

const LCD_BACKGROUND = '#121417';
const LCD_DIGITS = '#D7E3F4';

/** Guitar Pro's LCD in the middle of the top bar: the track, then bar, time signature, time and tempo. */
export function Lcd({ palette, info, trackColor }: LcdProps) {
  return (
    <View style={[styles.lcd, { borderColor: palette.chromeBorder }]} accessibilityLabel="Position">
      {info === undefined ? (
        <Text style={[styles.idle, { color: palette.chromeMuted }]}>GP Editor</Text>
      ) : (
        <>
          <View style={styles.row}>
            <View style={[styles.swatch, { backgroundColor: trackColor ?? palette.chromeMuted }]} />
            <Text numberOfLines={1} style={[styles.track, { color: palette.chromeText }]}>
              {info.track}
            </Text>
            <Text numberOfLines={1} style={[styles.position, { color: palette.chromeMuted }]}>
              {info.position}
            </Text>
          </View>
          <View style={styles.row}>
            <Text style={styles.digits}>{info.bar}</Text>
            <Text style={styles.digits}>{info.timeSignature}</Text>
            <Text style={styles.digits}>{info.clock}</Text>
            <Text style={styles.digits}>{info.tempo}</Text>
          </View>
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  lcd: {
    width: 360,
    height: 36,
    borderRadius: 5,
    borderWidth: 1,
    backgroundColor: LCD_BACKGROUND,
    paddingHorizontal: 9,
    justifyContent: 'center',
    marginHorizontal: 8,
  },
  row: { flexDirection: 'row', alignItems: 'center' },
  swatch: { width: 8, height: 8, borderRadius: 2, marginRight: 6 },
  track: { fontSize: 12, fontWeight: '700', flexShrink: 1 },
  position: { fontSize: 11, marginLeft: 'auto', paddingLeft: 8 },
  digits: { fontFamily: MONO_FONT, fontSize: 11, color: LCD_DIGITS, marginRight: 14 },
  idle: { fontSize: 12, fontWeight: '600', textAlign: 'center' },
});
