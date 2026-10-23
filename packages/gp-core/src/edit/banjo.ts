// The 5-string banjo's short 5th string. Guitar Pro files store its frets from its own nut (0, 1, 2 …, so pitch = open
// string + fret on every string, the model's rule); banjo tab writes them from the main nut (0, 6, 7 …), as Guitar Pro
// shows them (MuseScore's Guitar Pro import makes the same adjustment).

/** The fret where the 5-string banjo's short 5th string starts: its tuning peg sits there. */
export const BANJO_DRONE_FRET = 5;

const BANJO_STRINGS = 5;

/** True for a 5-string banjo tuning: five strings, the 5th (the short drone) tuned above the 4th — not a 5-string bass. */
export function isFiveStringBanjo(tuning: readonly number[]): boolean {
  const fifth = tuning[BANJO_STRINGS - 1];
  const fourth = tuning[BANJO_STRINGS - 2];
  return tuning.length === BANJO_STRINGS && fifth !== undefined && fourth !== undefined && fifth > fourth;
}

/** The neck fret a string starts at: BANJO_DRONE_FRET for a banjo's 5th string, else 0 (the nut). */
export function stringStartFret(tuning: readonly number[], string: number): number {
  return string === BANJO_STRINGS && isFiveStringBanjo(tuning) ? BANJO_DRONE_FRET : 0;
}

/** The fret the tab shows for a stored fret: on the banjo drone, counted from the main nut (stored 1 → 6); 0 stays 0. */
export function tabFret(tuning: readonly number[], string: number, fret: number): number {
  return fret > 0 ? fret + stringStartFret(tuning, string) : fret;
}

/** The stored fret of a fret typed as the tab shows it; undefined for frets 1–5 of the banjo drone, which has none. */
export function fretFromTab(tuning: readonly number[], string: number, typed: number): number | undefined {
  const start = stringStartFret(tuning, string);
  if (start === 0 || typed === 0) {
    return typed;
  }
  return typed > start ? typed - start : undefined;
}
