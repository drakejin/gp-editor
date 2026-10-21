// Port of TuxGuitar TGEffectHarmonic.NATURAL_FREQUENCIES (LGPL-2.1): harmonic offsets for the gtp and gpif readers.

/**
 * [harmonic fret, semitones above the fretted note]. TuxGuitar stores an index into this table as
 * harmonic data; the model stores the offset itself.
 */
const NATURAL_FREQUENCIES: readonly (readonly [number, number])[] = [
  [12, 12],
  [9, 28],
  [5, 24],
  [7, 19],
  [4, 28],
  [3, 31],
];

/** Semitone offset of the artificial harmonic TuxGuitar stores as data index `index`. */
export function artificialHarmonicOffset(index: number): number {
  return NATURAL_FREQUENCIES[index]?.[1] ?? 0;
}

/** Fret offset of the harmonic TuxGuitar stores as data index `index`. */
export function harmonicFretOffset(index: number): number {
  return NATURAL_FREQUENCIES[index]?.[0] ?? 0;
}

/** Semitone offset of the natural harmonic at `fret` (12 → 12, 7 → 19 …); 0 for a fret without one. */
export function artificialHarmonicOffsetAtFret(fret: number): number {
  return NATURAL_FREQUENCIES.find(([harmonicFret]) => harmonicFret === fret)?.[1] ?? 0;
}
