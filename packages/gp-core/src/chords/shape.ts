// Port of TuxGuitar app.tuxguitar.graphics.control.TGChordImpl#calculateFirstFret (LGPL-2.1), and small chord helpers.
import type { Chord } from '../model/song';

/** Frets a chord diagram shows (TGChordImpl.MAX_FRETS lines, one fewer spaces). */
export const DIAGRAM_FRETS = 5;

/**
 * The fret a diagram of these frets starts at: the nut (1) when every fretted note lies in the first DIAGRAM_FRETS
 * frets, as Guitar Pro draws Bm (x24432); else the lowest fretted note. TuxGuitar starts at the nut only when a string
 * is open.
 */
export function chordFirstFret(frets: readonly number[]): number {
  const fretted = frets.filter((fret) => Number.isFinite(fret) && fret > 0);
  if (fretted.length === 0 || Math.max(...fretted) <= DIAGRAM_FRETS) {
    return 1;
  }
  return Math.min(...fretted);
}

/** True when the chord plays a string, so it has a diagram to draw (GP3/GP4 chords may hold only a name). */
export function hasChordDiagram(chord: Chord): boolean {
  return chord.frets.some((fret) => fret >= 0);
}

/** The chord's name as shown: control characters a file left in it removed, trimmed. */
export function chordLabel(chord: Chord): string {
  return chord.name.replace(/[\u0000-\u001f\u007f]/g, '').trim();
}

/** Same name, first fret and frets. */
export function isSameChord(a: Chord, b: Chord | undefined): boolean {
  return (
    b !== undefined &&
    a.name === b.name &&
    a.firstFret === b.firstFret &&
    a.frets.length === b.frets.length &&
    a.frets.every((fret, i) => fret === b.frets[i])
  );
}
