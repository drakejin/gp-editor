import type { NoteEffect } from '@gp-editor/core';
import type { TextCommand } from '../draw';
import { type MusicGlyph, TECHNIQUE_GLYPHS } from '../symbols/smufl';
import type { Chord } from './chords';
import { musicGlyph } from './glyphs';
import { ARTICULATION, NOTATION } from './metrics';
import { type VoiceLayout, chordBottom, chordTop } from './voice-layout';

export type ArticulationSide = 'above' | 'below';

interface Articulation {
  readonly has: (effect: NoteEffect) => boolean;
  readonly above: MusicGlyph;
  readonly below: MusicGlyph;
}

/** Nearest the notehead first. */
const ARTICULATIONS: readonly Articulation[] = [
  {
    has: e => e.staccato,
    above: TECHNIQUE_GLYPHS.articStaccatoAbove,
    below: TECHNIQUE_GLYPHS.articStaccatoBelow,
  },
  {
    has: e => e.accentuatedNote,
    above: TECHNIQUE_GLYPHS.articAccentAbove,
    below: TECHNIQUE_GLYPHS.articAccentBelow,
  },
  {
    has: e => e.heavyAccentuatedNote,
    above: TECHNIQUE_GLYPHS.articMarcatoAbove,
    below: TECHNIQUE_GLYPHS.articMarcatoBelow,
  },
];

function chordArticulations(chord: Chord): Articulation[] {
  return ARTICULATIONS.filter(articulation =>
    chord.heads.some(head => articulation.has(head.note.effect)),
  );
}

/**
 * Articulations go opposite the stem, at the noteheads (over a stemless note); with two voices they go on the stem
 * side, beyond the stem, so they stay clear of the other voice.
 */
export function articulationSide(
  chord: Chord,
  isMultiVoice: boolean,
): ArticulationSide {
  if (isMultiVoice) {
    return chord.direction === 'up' ? 'above' : 'below';
  }
  return chord.hasStem && chord.direction === 'up' ? 'below' : 'above';
}

/** Height the chord's articulations take above it (0 when they are below or absent). */
export function articulationHeightAbove(
  chord: Chord,
  isMultiVoice: boolean,
): number {
  if (articulationSide(chord, isMultiVoice) === 'below') {
    return 0;
  }
  return chordArticulations(chord).reduce(
    (sum, articulation) =>
      sum + ARTICULATION.gap + articulation.above.top * NOTATION.space,
    0,
  );
}

/** Accents, heavy accents and staccato dots of every chord, stacked outwards from the notes. */
export function articulations(layout: VoiceLayout): TextCommand[] {
  return layout.chords.flatMap((chord, index) => {
    const marks = chord === undefined ? [] : chordArticulations(chord);
    if (chord === undefined || marks.length === 0) {
      return [];
    }
    const side = articulationSide(chord, layout.isMultiVoice);
    const tip = layout.isMultiVoice ? layout.tips[index] : undefined;
    const start =
      side === 'above' ? chordTop(chord, tip) : chordBottom(chord, tip);
    const x = chord.event.x;
    const placed = marks.reduce<{
      readonly edge: number;
      readonly glyphs: readonly TextCommand[];
    }>(
      ({ edge, glyphs }, articulation) => {
        const glyph =
          side === 'above' ? articulation.above : articulation.below;
        // Above-glyphs stand on their baseline, below-glyphs hang from it.
        const baseline =
          side === 'above' ? edge - ARTICULATION.gap : edge + ARTICULATION.gap;
        const next =
          side === 'above'
            ? baseline - glyph.top * NOTATION.space
            : baseline - glyph.bottom * NOTATION.space;
        return {
          edge: next,
          glyphs: [
            ...glyphs,
            musicGlyph(x, baseline, glyph.text, layout.color, 'center'),
          ],
        };
      },
      { edge: start, glyphs: [] },
    );
    return placed.glyphs;
  });
}
