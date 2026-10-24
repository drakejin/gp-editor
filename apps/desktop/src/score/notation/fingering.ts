import type { Finger, Hand } from '@gp-editor/core';
import { fingeringLabel } from '../../lib/fingering';
import type { TextCommand } from '../draw';
import { FINGERING_GLYPHS } from '../symbols/smufl';
import { articulationHeight, articulationSide } from './articulations';
import { type Chord, type NoteHead, chordInkLeft } from './chords';
import { musicGlyph } from './glyphs';
import { ARTICULATION, NOTATION } from './metrics';
import { type VoiceLayout, chordBottom, chordTop } from './voice-layout';

/**
 * Fingering, as Guitar Pro writes it: the fretting hand's finger (T 1 2 3 4) left of its notehead, the picking hand's
 * (p i m a c) stacked away from the stem past the articulations, and on a keyboard track every finger (1–5) there.
 */

/** Between a left-hand finger and the accidentals or notehead it stands left of. */
const SIDE_GAP = 0.3 * NOTATION.space;

interface StackedFinger {
  readonly head: NoteHead;
  readonly finger: Finger;
  readonly hand: Hand;
}

/** Left-hand fingers beside their noteheads, vertically centred on them. */
function besideHeads(chord: Chord, color: string): TextCommand[] {
  const right = chordInkLeft(chord) - SIDE_GAP;
  return chord.heads.flatMap(head => {
    const finger = head.note.leftFinger;
    if (finger === undefined) {
      return [];
    }
    const glyph = FINGERING_GLYPHS[fingeringLabel(finger, 'left', false)];
    const baseline = head.y + (glyph.top * NOTATION.space) / 2;
    return [
      musicGlyph(
        right - glyph.advance * NOTATION.space,
        baseline,
        glyph.text,
        color,
      ),
    ];
  });
}

/** The fingers stacked away from the stem, nearest the chord first: its bottom note's going up, its top note's going down. */
function stackedFingers(
  chord: Chord,
  isKeyboard: boolean,
  isAbove: boolean,
): StackedFinger[] {
  const heads = isAbove ? chord.heads : [...chord.heads].reverse();
  return heads.flatMap(head => {
    const left: StackedFinger[] =
      isKeyboard && head.note.leftFinger !== undefined
        ? [{ head, finger: head.note.leftFinger, hand: 'left' }]
        : [];
    const right: StackedFinger[] =
      head.note.rightFinger === undefined
        ? []
        : [{ head, finger: head.note.rightFinger, hand: 'right' }];
    return [...left, ...right];
  });
}

/** The stack of one chord, from its edge (past the articulations) outwards. */
function stack(
  chord: Chord,
  index: number,
  layout: VoiceLayout,
  isKeyboard: boolean,
): TextCommand[] {
  const isAbove = articulationSide(chord, layout.isMultiVoice) === 'above';
  const fingers = stackedFingers(chord, isKeyboard, isAbove);
  if (fingers.length === 0) {
    return [];
  }
  const tip = layout.isMultiVoice ? layout.tips[index] : undefined;
  const articulations = articulationHeight(chord, layout.isMultiVoice);
  const start = isAbove
    ? chordTop(chord, tip) - articulations
    : chordBottom(chord, tip) + articulations;
  const placed = fingers.reduce<{
    readonly edge: number;
    readonly glyphs: readonly TextCommand[];
  }>(
    ({ edge, glyphs }, { finger, hand }) => {
      const glyph = FINGERING_GLYPHS[fingeringLabel(finger, hand, isKeyboard)];
      // Above, a finger stands on its baseline; below, it hangs from its top.
      const baseline = isAbove
        ? edge - ARTICULATION.gap
        : edge + ARTICULATION.gap + glyph.top * NOTATION.space;
      const next = isAbove
        ? baseline - glyph.top * NOTATION.space
        : baseline - glyph.bottom * NOTATION.space;
      return {
        edge: next,
        glyphs: [
          ...glyphs,
          musicGlyph(
            chord.event.x,
            baseline,
            glyph.text,
            layout.color,
            'center',
          ),
        ],
      };
    },
    { edge: start, glyphs: [] },
  );
  return [...placed.glyphs];
}

/** Every chord's fingering. */
export function fingerings(
  layout: VoiceLayout,
  isKeyboard: boolean,
): TextCommand[] {
  return layout.chords.flatMap((chord, index) =>
    chord === undefined
      ? []
      : [
          ...(isKeyboard ? [] : besideHeads(chord, layout.color)),
          ...stack(chord, index, layout, isKeyboard),
        ],
  );
}
