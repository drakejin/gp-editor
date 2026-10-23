// Port of TuxGuitar app.tuxguitar.io.ascii.ASCIIOutputStream#drawNote (LGPL-2.1), with TGEffectBend's movements.
import type { BendPoint, Note } from '../../model/song';

/**
 * TGEffectBend.updateMovements: the moves of a bend, in quarter tones — +n bends up to n, -n releases from n.
 * Empty when the bend holds one value (a held pre-bend) or has fewer than two points.
 */
export function bendMovements(points: readonly BendPoint[]): readonly number[] {
  const [first, second, ...rest] = points;
  if (first === undefined || second === undefined) {
    return [];
  }
  const movements: number[] = [];
  let start = first.value;
  let current = second.value;
  for (const { value: next } of rest) {
    if ((next - current) * (current - start) < 0) {
      movements.push(current - start > 0 ? current : -start);
      start = current;
    }
    current = next;
  }
  if (current !== start) {
    movements.push(current - start > 0 ? current : -start);
  }
  return movements;
}

/** TuxGuitar has one slide to the next note; slides into or out of a note have no ASCII mark. */
function slidesToNext(note: Note): boolean {
  return note.effect.slides.some((slide) => slide === 'shift' || slide === 'legato');
}

/** The note's fret ("X" for a dead note, "H" for a held bend), then its bend: "5b7" (bent up a tone), "7r5" (released). */
function fretWithBend(note: Note, marks: string): string {
  const { bend, deadNote } = note.effect;
  const movements = bend === undefined ? [] : bendMovements(bend.points);
  const isBend = bend !== undefined && bend.points.length > 0;
  const fret = deadNote ? 'X' : isBend && movements.length === 0 ? 'H' : String(note.fret);
  const [movement] = movements;
  if (movement === undefined) {
    return `${fret}${marks}`;
  }
  // TuxGuitar rounds half steps down, so a quarter-tone bend never writes a fractional fret.
  const bentFret = note.fret + Math.floor(Math.abs(movement) / 2);
  return movement < 0 ? `${bentFret}r${fret}${marks}` : `${fret}${marks}b${bentFret}`;
}

/**
 * ASCIIOutputStream.drawNote: the text of a note — its fret, then "h" / "p" for a hammer-on or pull-off and "/" or "\"
 * for a slide toward the note on the same string in the next beat, then its bend. Empty when there is no note.
 */
export function noteText(note: Note | undefined, next: Note | undefined): string {
  if (note === undefined) {
    return '';
  }
  const isUp = next !== undefined && next.fret > note.fret;
  const hammer = note.effect.hammer && next !== undefined ? (isUp ? 'h' : 'p') : '';
  const slide = slidesToNext(note) && next !== undefined ? (isUp ? '/' : '\\') : '';
  return fretWithBend(note, `${hammer}${slide}`);
}
