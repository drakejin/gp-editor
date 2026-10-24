import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import type { LcdInfo } from '../lib/lcd';
import type { MetronomeBeat } from '../lib/metronome-beat';
import { parseTempoText } from '../lib/practice-tempo';
import { MONO_FONT, type Palette } from '../theme';
import { TextField } from './TextField';

export interface LcdProps {
  readonly palette: Palette;
  readonly info?: LcdInfo;
  /** The shown track's colour. */
  readonly trackColor?: string;
  /** While playing: the metronome's beat (the count-in's too), shown as dots. */
  readonly beat?: MetronomeBeat;
  /** A tempo typed over the LCD's tempo; without it the tempo is not editable. */
  readonly onSetTempo?: (tempo: number) => void;
}

const LCD_BACKGROUND = '#121417';
const LCD_DIGITS = '#D7E3F4';
/** The visual metronome: the beat being played, the accented first beat, the count-in. */
const BEAT_COLORS = { lit: '#7FD4FF', accent: '#4A6378', idle: '#2B3540', countIn: '#FFB454' } as const;
/** Longer bars show "beat/count" instead of a row of dots. */
const MAX_BEAT_DOTS = 12;

/** Guitar Pro's LCD in the middle of the top bar: the track, then bar, time signature, time, tempo and beat. */
export function Lcd({ palette, info, trackColor, beat, onSetTempo }: LcdProps) {
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
            <LcdTempo info={info} palette={palette} onSetTempo={onSetTempo} />
            {beat === undefined ? null : <BeatDots beat={beat} />}
          </View>
        </>
      )}
    </View>
  );
}

/** The tempo; a click opens a field to type one (decimals allowed), Return sets it. */
function LcdTempo({ info, palette, onSetTempo }: { readonly info: LcdInfo; readonly palette: Palette; readonly onSetTempo?: (tempo: number) => void }) {
  const [draft, setDraft] = useState<string | undefined>(undefined);
  if (onSetTempo === undefined) {
    return <Text numberOfLines={1} style={[styles.digits, styles.tempo]}>{info.tempo}</Text>;
  }
  if (draft === undefined) {
    return (
      <Pressable testID="lcd-tempo" tooltip="Click to type the tempo (decimals allowed, e.g. 92.5)" onPress={() => setDraft(String(info.tempoBpm))} style={styles.tempo}>
        <Text numberOfLines={1} style={styles.digits}>{info.tempo}</Text>
      </Pressable>
    );
  }
  const commit = () => {
    const tempo = parseTempoText(draft);
    setDraft(undefined);
    if (tempo !== undefined) {
      onSetTempo(tempo);
    }
  };
  return (
    <TextField
      value={draft}
      onChangeText={setDraft}
      onSubmitEditing={commit}
      onBlur={() => setDraft(undefined)}
      autoFocus
      accessibilityLabel="Tempo"
      style={[styles.tempoField, { color: LCD_DIGITS, borderColor: palette.chromeBorder }]}
    />
  );
}

/** One dot per beat of the bar (Guitar Pro's visual metronome): the current beat lit, the first one marked. */
function BeatDots({ beat }: { readonly beat: MetronomeBeat }) {
  const lit = beat.isCountIn ? BEAT_COLORS.countIn : BEAT_COLORS.lit;
  return (
    <View style={styles.beats} accessibilityLabel={`Beat ${beat.index + 1} of ${beat.count}`}>
      {beat.isCountIn ? <Text style={[styles.countIn, { color: BEAT_COLORS.countIn }]}>Count-in</Text> : null}
      {beat.count > MAX_BEAT_DOTS ? (
        <Text style={[styles.digits, { color: lit }]}>{`${beat.index + 1}/${beat.count}`}</Text>
      ) : (
        Array.from({ length: beat.count }, (_, index) => {
          const isLit = index === beat.index;
          const isAccent = index === 0;
          const testID = `beat-dot-${index}${isLit ? '-lit' : isAccent ? '-accent' : ''}`;
          const color = isLit ? lit : isAccent ? BEAT_COLORS.accent : BEAT_COLORS.idle;
          return <View key={index} testID={testID} style={[styles.dot, isAccent ? styles.accentDot : null, { backgroundColor: color }]} />;
        })
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  lcd: {
    width: 380,
    // A narrow window takes the room from the LCD first.
    flexShrink: 1,
    minWidth: 250,
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
  digits: { fontFamily: MONO_FONT, fontSize: 11, color: LCD_DIGITS, marginRight: 11 },
  tempoField: { fontFamily: MONO_FONT, fontSize: 11, width: 64, height: 16, paddingHorizontal: 3, paddingVertical: 0, borderWidth: 1, borderRadius: 3, marginRight: 14 },
  idle: { fontSize: 12, fontWeight: '600', textAlign: 'center' },
  beats: { flexDirection: 'row', alignItems: 'center', marginLeft: 'auto', paddingLeft: 4, flexShrink: 0 },
  tempo: { flexShrink: 1 },
  countIn: { fontSize: 10, fontWeight: '700', marginRight: 6 },
  dot: { width: 7, height: 7, borderRadius: 3.5, marginLeft: 3 },
  accentDot: { width: 9, height: 9, borderRadius: 4.5 },
});
