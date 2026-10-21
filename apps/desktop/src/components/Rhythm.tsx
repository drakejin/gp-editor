import { StyleSheet, Text, View } from 'react-native';
import type { Voice } from '@gp-editor/core';
import { type Beam, flagCount } from '../lib/beams';
import type { Palette } from '../theme';

/** Stems hang this far below the bottom string. */
export const STEM_GAP = 8;
const STEM_HEIGHT = 15;
const HALF_STEM_HEIGHT = 9;
/** Vertical distance between stacked flags or beams. */
const BEAM_SPACING = 3;

/**
 * Rest symbols drawn with views: system fonts have no glyphs for the Unicode musical rests.
 * Whole and half rests are blocks under / on the middle line; shorter rests a slanted stem with one dot per flag.
 */
export function RestMark({ value, x, middle, color }: { value: number; x: number; middle: number; color: string }) {
  if (value <= 2) {
    return <View style={[styles.restBlock, { left: x - 5, top: value === 1 ? middle : middle - 5, backgroundColor: color }]} />;
  }
  if (value === 4) {
    return (
      <>
        {[-7, -2, 3].map((offset, i) => (
          <View
            key={offset}
            style={[styles.restZig, { left: x - 2, top: middle + offset, backgroundColor: color, transform: [{ rotate: i % 2 === 0 ? '40deg' : '-40deg' }] }]}
          />
        ))}
      </>
    );
  }
  return (
    <>
      <View style={[styles.restStem, { left: x, top: middle - 8, backgroundColor: color }]} />
      {Array.from({ length: Math.max(1, flagCount(value)) }, (_, i) => (
        <View key={i} style={[styles.restDot, { left: x - 5 + i, top: middle - 8 + i * 4, backgroundColor: color }]} />
      ))}
    </>
  );
}

interface RhythmStemProps {
  readonly voice: Voice;
  readonly x: number;
  readonly top: number;
  /** Part of a beam group: the beam replaces the flags. */
  readonly isBeamed: boolean;
  readonly palette: Palette;
}

export function RhythmStem({ voice, x, top, isBeamed, palette }: RhythmStemProps) {
  const value = voice.duration.value;
  if (value === 1) {
    return null;
  }
  const height = value === 2 ? HALF_STEM_HEIGHT : STEM_HEIGHT;
  const flags = isBeamed ? 0 : flagCount(value);
  const tuplet = voice.duration.tuplet.enters !== voice.duration.tuplet.times ? voice.duration.tuplet.enters : undefined;
  return (
    <>
      <View style={[styles.stem, { left: x, top, height, backgroundColor: palette.text }]} />
      {Array.from({ length: flags }, (_, i) => (
        <View key={i} style={[styles.flag, { left: x, top: top + height - 1 - i * BEAM_SPACING, backgroundColor: palette.text }]} />
      ))}
      {voice.duration.dotted || voice.duration.doubleDotted ? (
        <View style={[styles.dot, { left: x + 4, top: top + height - 4, backgroundColor: palette.text }]} />
      ) : null}
      {tuplet !== undefined ? <Text style={[styles.tuplet, { left: x - 6, top: top + height + 1, color: palette.muted }]}>{tuplet}</Text> : null}
    </>
  );
}

/** Beams at the foot of the stems; level 1 lowest. */
export function BeamLines({ beams, top, palette }: { beams: readonly Beam[]; top: number; palette: Palette }) {
  return (
    <>
      {beams.map((beam) => (
        <View
          key={`${beam.level}-${beam.fromX}`}
          style={[
            styles.beam,
            {
              left: beam.fromX,
              width: Math.max(1, beam.toX - beam.fromX + 1),
              top: top + STEM_HEIGHT - 2 - (beam.level - 1) * BEAM_SPACING,
              backgroundColor: palette.text,
            },
          ]}
        />
      ))}
    </>
  );
}

const styles = StyleSheet.create({
  restBlock: { position: 'absolute', width: 10, height: 5 },
  restZig: { position: 'absolute', width: 2, height: 7, borderRadius: 1 },
  restStem: { position: 'absolute', width: 1.5, height: 16, transform: [{ rotate: '20deg' }] },
  restDot: { position: 'absolute', width: 4, height: 4, borderRadius: 2 },
  stem: { position: 'absolute', width: 1 },
  flag: { position: 'absolute', width: 6, height: 1.5 },
  beam: { position: 'absolute', height: 2 },
  dot: { position: 'absolute', width: 3, height: 3, borderRadius: 1.5 },
  tuplet: { position: 'absolute', width: 12, textAlign: 'center', fontSize: 8 },
});
