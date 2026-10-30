const NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'] as const;
// i18n-exempt: note names, written as notation writes them
const FLAT_NAMES = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'Gb', 'G', 'Ab', 'A', 'Bb', 'B'] as const;

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

/** "Bb3" in a key with flats (`keySignature` < 0), else "A#3": pitch names as text, sharps or flats as the key has them. */
export function pitchNameInKey(midi: number, keySignature: number): string {
  const names = keySignature < 0 ? FLAT_NAMES : NAMES;
  return `${names[((midi % 12) + 12) % 12] ?? '?'}${pitchOctave(midi)}`;
}

/** Tuning from the lowest string up, e.g. "E A D G B E". */
export function tuningLabel(tunings: readonly number[]): string {
  return [...tunings]
    .reverse()
    .map((midi) => NAMES[((midi % 12) + 12) % 12] ?? '?')
    .join(' ');
}
