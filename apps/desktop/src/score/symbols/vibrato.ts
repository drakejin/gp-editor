import type { Beat, NoteEffect } from '@gp-editor/core';
import { type MusicGlyph, TECHNIQUE_GLYPHS } from './smufl';

/**
 * Vibrato marks shared by tab and notation: slight vibrato is a wave of SMuFL's guitarVibratoStroke, wide vibrato
 * one of guitarWideVibratoStroke (twice as high). Both widths share the tab's vibrato lane and the line over the staff.
 */

/** guitarWideVibratoStroke, with Bravura's metrics (see TECHNIQUE_GLYPHS). */
export const WIDE_VIBRATO_GLYPH: MusicGlyph = {
  text: String.fromCodePoint(0xeab3),
  advance: 0.82,
  top: 0.896,
  bottom: 0,
};

export function hasVibrato(effect: NoteEffect): boolean {
  return effect.vibrato || effect.wideVibrato;
}

/** Whether any note of the beat has wide vibrato: its wave is then the wide one. */
export function hasWideVibrato(beat: Beat | undefined): boolean {
  return (
    beat?.voices.some(voice =>
      voice.notes.some(note => note.effect.wideVibrato),
    ) ?? false
  );
}

export function vibratoGlyph(isWide: boolean): MusicGlyph {
  return isWide ? WIDE_VIBRATO_GLYPH : TECHNIQUE_GLYPHS.guitarVibratoStroke;
}

/** Consecutive items with vibrato, in pieces of one width. */
export function splitByVibratoWidth<T>(
  items: readonly T[],
  isWide: (item: T) => boolean,
): { readonly isWide: boolean; readonly items: readonly T[] }[] {
  return items.reduce<{ isWide: boolean; items: readonly T[] }[]>(
    (pieces, item) => {
      const wide = isWide(item);
      const last = pieces[pieces.length - 1];
      return last !== undefined && last.isWide === wide
        ? [
            ...pieces.slice(0, -1),
            { isWide: wide, items: [...last.items, item] },
          ]
        : [...pieces, { isWide: wide, items: [item] }];
    },
    [],
  );
}

/** A run of beats (positions first … last) and whether it goes on from the previous measure or into the next. */
interface VibratoRun {
  readonly first: number;
  readonly last: number;
  readonly isContinued: boolean;
  readonly goesOn: boolean;
}

/** A run split where the width changes: only the first piece goes on from before, only the last one into after. */
export function splitVibratoRun<T extends VibratoRun>(
  run: T,
  isWideAt: (position: number) => boolean,
): (T & { readonly isWide: boolean })[] {
  const positions = Array.from(
    { length: run.last - run.first + 1 },
    (_, i) => run.first + i,
  );
  const pieces = splitByVibratoWidth(positions, isWideAt);
  return pieces.map((piece, index) => ({
    ...run,
    first: piece.items[0] ?? run.first,
    last: piece.items[piece.items.length - 1] ?? run.last,
    isContinued: run.isContinued && index === 0,
    goesOn: run.goesOn && index === pieces.length - 1,
    isWide: piece.isWide,
  }));
}
