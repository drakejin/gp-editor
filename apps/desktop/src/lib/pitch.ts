const NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'] as const;

/** "E4" for MIDI 64. */
export function pitchName(midi: number): string {
  const name = NAMES[((midi % 12) + 12) % 12] ?? '?';
  return `${name}${Math.floor(midi / 12) - 1}`;
}

/** Tuning from the lowest string up, e.g. "E A D G B E". */
export function tuningLabel(tunings: readonly number[]): string {
  return [...tunings]
    .reverse()
    .map((midi) => NAMES[((midi % 12) + 12) % 12] ?? '?')
    .join(' ');
}
