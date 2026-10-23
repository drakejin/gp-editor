const NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'] as const;

/** Pitch class with sharps: "C", "C#" … "B". */
export function pitchClassName(midi: number): string {
  return NAMES[((midi % 12) + 12) % 12] ?? '?';
}

/** Octave in scientific pitch notation: 4 for MIDI 60 (C4) to 71 (B4). */
export function pitchOctave(midi: number): number {
  return Math.floor(midi / 12) - 1;
}

/** "E4" for MIDI 64. */
export function pitchName(midi: number): string {
  return `${pitchClassName(midi)}${pitchOctave(midi)}`;
}

/** Tuning from the lowest string up, e.g. "E A D G B E". */
export function tuningLabel(tunings: readonly number[]): string {
  return [...tunings]
    .reverse()
    .map((midi) => NAMES[((midi % 12) + 12) % 12] ?? '?')
    .join(' ');
}
