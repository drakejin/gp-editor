/** Open-string pitches, string 1 (highest) first, as `Track.strings` holds them. */
export const STANDARD = [64, 59, 55, 50, 45, 40] as const;
export const DROP_D = [64, 59, 55, 50, 45, 38] as const;
export const SEVEN_STRING = [64, 59, 55, 50, 45, 40, 35] as const;
export const EIGHT_STRING = [64, 59, 55, 50, 45, 40, 35, 30] as const;
export const BASS = [43, 38, 33, 28] as const;
/** Ukulele, re-entrant (A4 E4 C4 G4). */
export const UKULELE = [69, 64, 60, 67] as const;

/**
 * Frets from a chord shape written the usual way, lowest string first ("x32010" is C on a guitar): string 1 first,
 * -1 for a muted string. One character per string, so frets 0–9 only.
 */
export function shape(written: string): readonly number[] {
  return [...written].reverse().map((char) => (char === 'x' ? -1 : Number(char)));
}

/** The usual written form of frets (string 1 first), lowest string first. */
export function written(frets: readonly number[]): string {
  return [...frets]
    .reverse()
    .map((fret) => (fret < 0 ? 'x' : fret < 10 ? String(fret) : `(${fret})`))
    .join('');
}

/** Pitch classes the frets play on the tuning. */
export function playedPitchClasses(frets: readonly number[], tuning: readonly number[]): ReadonlySet<number> {
  return new Set(frets.flatMap((fret, i) => (fret < 0 ? [] : [((tuning[i] ?? 0) + fret) % 12])));
}

/** Pitch class of the lowest played string. */
export function bassPitchClass(frets: readonly number[], tuning: readonly number[]): number | undefined {
  for (let i = frets.length - 1; i >= 0; i--) {
    const fret = frets[i] ?? -1;
    if (fret >= 0) {
      return ((tuning[i] ?? 0) + fret) % 12;
    }
  }
  return undefined;
}
