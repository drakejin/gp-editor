import { type Note, type Track, tabFret, trackTuning } from '@gp-editor/core';

/** Fret label as Guitar Pro shows it: x for dead notes, (n) for ghost/tied, <n> for natural harmonics; `shownFret` is tabFretOf's fret. */
export function fretLabel(note: Note, shownFret = note.fret): string {
  if (note.effect.deadNote) {
    return 'x';
  }
  const fret = String(shownFret);
  if (note.effect.harmonic?.type === 'natural') {
    return `<${fret}>`;
  }
  if (note.isTied || note.effect.ghostNote) {
    return `(${fret})`;
  }
  return fret;
}

/** The fret the tab shows for a note: a banjo's short 5th string is numbered from the main nut (stored 2 → 7). */
export function tabFretOf(track: Track, note: Note): number {
  return tabFret(trackTuning(track), note.string, note.fret);
}

/** Short bend amount: ½, full, 1½ … from quarter tones. */
export function bendLabel(quarterTones: number): string {
  const tones = quarterTones / 4;
  if (tones === 0.25) {
    return '¼';
  }
  if (tones === 0.5) {
    return '½';
  }
  if (tones === 1) {
    return 'full';
  }
  const whole = Math.floor(tones);
  const half = tones - whole >= 0.5 ? '½' : '';
  return `${whole > 0 ? whole : ''}${half}` || String(tones);
}
