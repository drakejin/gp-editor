/**
 * SMuFL glyphs for playing techniques (Bravura), beyond the base table in draw.ts.
 * Metrics are Bravura's (bravura_metadata.json), in staff spaces at the full music size (one em = four staff spaces);
 * `top` / `bottom` are the glyph's extent above (+) and below (−) its baseline.
 */
export interface MusicGlyph {
  readonly text: string;
  readonly advance: number;
  readonly top: number;
  readonly bottom: number;
}

function glyph(
  codePoint: number,
  advance: number,
  top: number,
  bottom: number,
): MusicGlyph {
  return { text: String.fromCodePoint(codePoint), advance, top, bottom };
}

export const TECHNIQUE_GLYPHS = {
  noteheadDiamondWhole: glyph(0xe0d8, 1.664, 0.564, -0.564),
  noteheadDiamondHalf: glyph(0xe0d9, 0.98, 0.564, -0.564),
  noteheadDiamondBlack: glyph(0xe0db, 0.98, 0.564, -0.564),
  /** Ink spans 0 … 0.436 right of the origin. */
  noteheadParenthesisLeft: glyph(0xe0f5, 0.436, 0.724, -0.724),
  /** Ink spans −0.144 … 0.292 around the origin. */
  noteheadParenthesisRight: glyph(0xe0f6, 0.292, 0.724, -0.724),
  /** Small notehead (0.78 wide) on the baseline, stem up with flag and slash. */
  graceNoteAcciaccaturaStemUp: glyph(0xe560, 1.428, 2.096, -0.332),
  graceNoteAppoggiaturaStemUp: glyph(0xe562, 1.292, 2.104, -0.324),
  ornamentTrill: glyph(0xe566, 2.084, 1.56, -0.04),
  articAccentAbove: glyph(0xe4a0, 1.356, 0.98, 0),
  articAccentBelow: glyph(0xe4a1, 1.356, 0, -0.976),
  articStaccatoAbove: glyph(0xe4a2, 0.336, 0.336, 0),
  articStaccatoBelow: glyph(0xe4a3, 0.336, 0, -0.336),
  articMarcatoAbove: glyph(0xe4ac, 0.944, 1.012, 0),
  articMarcatoBelow: glyph(0xe4ad, 0.944, 0, -1.016),
  wiggleTrill: glyph(0xeaa4, 0.948, 0.836, 0.392),
  guitarVibratoStroke: glyph(0xeab2, 0.608, 0.476, 0),
} as const;

/** Tremolo strokes 1 … 4 (tremolo1 … tremolo4); their ink is centred on the origin both ways. */
export const TREMOLO_GLYPHS: readonly MusicGlyph[] = [
  glyph(0xe220, 0.6, 0.376, -0.372),
  glyph(0xe221, 0.596, 0.748, -0.748),
  glyph(0xe222, 0.6, 1.112, -1.12),
  glyph(0xe223, 0.596, 1.496, -1.48),
];

/** Width of the small notehead in the grace-note glyphs. */
export const GRACE_NOTEHEAD_WIDTH = 0.78;

/** Points per staff space for music drawn at `size` (one em = four staff spaces). */
export function staffSpace(size: number): number {
  return size / 4;
}
