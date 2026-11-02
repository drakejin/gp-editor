import type { Beat, Grace, Note } from '@gp-editor/core';

// The tab's fret boxes and the small frets beside them (grace notes before a note, trill frets after it): their sizes
// and places, shared by the tab engraver (tab-notes.ts) and the layout, which gives a beat room for them (lib/layout.ts).

/** The paper box behind a fret number, hiding the string line. */
export const FRET_BOX = { width: 22, height: 14 } as const;

/** A grace note's or trill's small fret number, on a paper box of its own. */
export const SMALL_FRET = {
  size: 8,
  height: 10,
  padding: 1,
  gap: 3,
  charWidth: 0.6,
} as const;

/** A small fret's box: its digits in the mono font and their padding. */
export function smallFretWidth(text: string): number {
  return text.length * SMALL_FRET.size * SMALL_FRET.charWidth + 2 * SMALL_FRET.padding;
}

export const graceText = (grace: Grace): string => (grace.isDead ? 'x' : String(grace.fret));
export const trillText = (fret: number): string => `(${fret})`;

/** How far a grace fret's centre sits before its note's. */
export function graceOffset(text: string): number {
  return FRET_BOX.width / 2 + SMALL_FRET.gap + (text.length * SMALL_FRET.size * SMALL_FRET.charWidth) / 2;
}

/** How far a trill fret's centre sits after its note's: its box right after the fret's. */
export function trillOffset(text: string): number {
  return FRET_BOX.width / 2 + smallFretWidth(text) / 2;
}

/** How far a note's grace fret (before it) or trill fret (after it) reaches from the beat's centre; 0 without. */
function ornamentReach(note: Note): number {
  const { grace, trill } = note.effect;
  const graceReach = grace === undefined ? 0 : graceOffset(graceText(grace)) + smallFretWidth(graceText(grace)) / 2;
  const trillReach = trill === undefined ? 0 : trillOffset(trillText(trill.fret)) + smallFretWidth(trillText(trill.fret)) / 2;
  return Math.max(graceReach, trillReach);
}

/**
 * The room a beat needs for its notes' grace frets and trill frets, centred on it, so they stay in its own room and
 * clear of the beats beside it (a trill's "(8)" and the next note's grace); 0 without any.
 */
export function ornamentWidth(beat: Beat): number {
  const reach = Math.max(0, ...beat.voices.flatMap((voice) => (voice.isEmpty ? [] : voice.notes.map(ornamentReach))));
  return reach === 0 ? 0 : 2 * (reach + SMALL_FRET.padding);
}
