import type { Beat, Note, NoteEffect } from '@gp-editor/core';

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

/** Effects that last over several beats: labelled once where the run starts, like Guitar Pro's "let ring ---". */
const SUSTAINED_MARKS: ReadonlyArray<readonly [keyof NoteEffect, string]> = [
  ['palmMute', 'P.M.'],
  ['letRing', 'let ring'],
];

const NOTE_MARKS: ReadonlyArray<readonly [keyof NoteEffect, string]> = [
  ['vibrato', '~'],
  ['tapping', 'T'],
  ['slapping', 'S'],
  ['popping', 'P'],
  ['fadeIn', '<'],
  ['staccato', '·'],
  ['accentuatedNote', '>'],
  ['heavyAccentuatedNote', '^'],
  ['hammer', 'H'],
];

function beatNotes(beat: Beat | undefined): readonly Note[] {
  return beat?.voices.flatMap((voice) => voice.notes) ?? [];
}

function hasEffect(notes: readonly Note[], key: keyof NoteEffect): boolean {
  return notes.some((note) => note.effect[key] === true);
}

function noteMarks(note: Note): string[] {
  const marks = NOTE_MARKS.filter(([key]) => note.effect[key] === true).map(([, mark]) => mark);
  if (note.effect.slides.length > 0) {
    marks.push('sl.');
  }
  if (note.effect.harmonic !== undefined && note.effect.harmonic.type !== 'natural') {
    marks.push(`${note.effect.harmonic.type.slice(0, 1).toUpperCase()}.H.`);
  }
  const peak = Math.max(0, ...(note.effect.bend?.points.map((p) => p.value) ?? []));
  if (peak > 0) {
    marks.push(`↑${bendLabel(peak)}`);
  }
  if (note.effect.tremoloBar !== undefined) {
    marks.push('w/bar');
  }
  if (note.effect.trill !== undefined) {
    marks.push('tr');
  }
  if (note.effect.tremoloPicking !== undefined) {
    marks.push('≡');
  }
  return marks;
}

/**
 * Effect marks shown above a beat, de-duplicated across its notes. Sustained effects (P.M., let ring) appear only
 * when `previous` — the beat before it on the same track — does not have them.
 */
export function beatMarks(beat: Beat, previous?: Beat): string[] {
  const notes = beatNotes(beat);
  const previousNotes = beatNotes(previous);
  const marks = new Set<string>();
  for (const [key, mark] of SUSTAINED_MARKS) {
    if (hasEffect(notes, key) && !hasEffect(previousNotes, key)) {
      marks.add(mark);
    }
  }
  notes.flatMap(noteMarks).forEach((mark) => marks.add(mark));
  if (beat.stroke.direction !== 'none') {
    marks.add(beat.stroke.direction === 'up' ? '↑' : '↓');
  }
  return [...marks];
}
