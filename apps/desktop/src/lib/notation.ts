import type { Note } from '@gp-editor/core';

/** Fret label as Guitar Pro shows it: x for dead notes, (n) for ghost/tied, <n> for natural harmonics. */
export function fretLabel(note: Note): string {
  if (note.effect.deadNote) {
    return 'x';
  }
  const fret = String(note.fret);
  if (note.effect.harmonic?.type === 'natural') {
    return `<${fret}>`;
  }
  if (note.isTied || note.effect.ghostNote) {
    return `(${fret})`;
  }
  return fret;
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
