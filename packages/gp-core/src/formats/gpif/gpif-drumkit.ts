// Port of TuxGuitar app.tuxguitar.io.gpx.score.GPXDrumkit (LGPL-2.1).

interface DrumkitEntry {
  readonly midi: number;
  readonly element: number;
  readonly variation: number;
}

/** Guitar Pro 6 drum notes are (element, variation) pairs; this table gives their MIDI percussion pitch. */
const DRUMKITS: readonly DrumkitEntry[] = [
  { midi: 36, element: 0, variation: 0 },
  { midi: 36, element: 0, variation: 0 },
  { midi: 37, element: 1, variation: 2 },
  { midi: 38, element: 1, variation: 0 },
  { midi: 41, element: 5, variation: 0 },
  { midi: 42, element: 10, variation: 0 },
  { midi: 43, element: 6, variation: 0 },
  { midi: 44, element: 11, variation: 0 },
  { midi: 45, element: 7, variation: 0 },
  { midi: 46, element: 10, variation: 2 },
  { midi: 47, element: 8, variation: 0 },
  { midi: 48, element: 9, variation: 0 },
  { midi: 49, element: 12, variation: 0 },
  { midi: 50, element: 9, variation: 0 },
  { midi: 51, element: 15, variation: 0 },
  { midi: 52, element: 16, variation: 0 },
  { midi: 53, element: 15, variation: 2 },
  { midi: 55, element: 14, variation: 0 },
  { midi: 56, element: 3, variation: 0 },
  { midi: 57, element: 13, variation: 0 },
  { midi: 59, element: 15, variation: 1 },
];

/** MIDI pitch of a GP6 drum element/variation; the last matching entry wins, as in TuxGuitar. -1 if unknown. */
export function drumkitMidi(element: number, variation: number): number {
  let midi = -1;
  for (const entry of DRUMKITS) {
    if (entry.element === element && entry.variation === variation) {
      midi = entry.midi;
    }
  }
  return midi;
}
