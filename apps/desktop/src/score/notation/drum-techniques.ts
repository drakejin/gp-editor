import type { DrumTechniqueSymbol } from '@gp-editor/core';
import { SMUFL, type TextCommand } from '../draw';
import { type MusicGlyph, PICK_STROKE_GLYPHS, TECHNIQUE_GLYPHS } from '../symbols/smufl';
import { type ArticulationSide, articulationHeight, articulationSide } from './articulations';
import type { Chord } from './chords';
import { musicGlyph } from './glyphs';
import { ARTICULATION, GRACE, MUSIC_FONT_SIZE, NOTATION, STAFF, positionY } from './metrics';
import { type VoiceLayout, chordBottom, chordTop } from './voice-layout';

/** What the drum technique marks are placed against: the voices' chords and stem ends. */
export type DrumMarkLayout = Pick<VoiceLayout, 'chords' | 'tips' | 'isMultiVoice' | 'top' | 'color'>;

/** A symbol beside the notes: its glyph above and below the notes, at a share of the music font size. */
interface MarkGlyphs {
  readonly above: MusicGlyph;
  readonly below: MusicGlyph;
  readonly scale: number;
}

function glyph(codePoint: string, top: number): MusicGlyph {
  return { text: codePoint, advance: 0, top, bottom: 0 };
}

/** Drawn at half size, as alphaTab draws it: the full pictogram is wider than a beat. */
const EDGE_OF_CYMBAL = glyph(SMUFL.pictEdgeOfCymbal, 2.14);
const GOLPE = glyph(SMUFL.guitarGolpe, 1.128);

/** The symbols drawn beside the notes; a mute's parentheses go around its notehead instead. */
const MARKS: Readonly<Partial<Record<DrumTechniqueSymbol, MarkGlyphs>>> = {
  pictEdgeOfCymbal: { above: EDGE_OF_CYMBAL, below: EDGE_OF_CYMBAL, scale: 0.5 },
  articStaccatoAbove: { above: TECHNIQUE_GLYPHS.articStaccatoAbove, below: TECHNIQUE_GLYPHS.articStaccatoBelow, scale: 1 },
  stringsUpBow: { above: PICK_STROKE_GLYPHS.up, below: PICK_STROKE_GLYPHS.up, scale: 1 },
  stringsDownBow: { above: PICK_STROKE_GLYPHS.down, below: PICK_STROKE_GLYPHS.down, scale: 1 },
  guitarGolpe: { above: GOLPE, below: GOLPE, scale: GRACE.scale },
};

interface Mark {
  readonly glyphs: MarkGlyphs;
  readonly side: ArticulationSide;
  /** Above or below the staff (Guitar Pro's above / below), not just beyond the notes (outside). */
  readonly isBeyondStaff: boolean;
}

/** The marks of a chord's drums placed beside it, each symbol once, in note order. */
function chordMarks(chord: Chord, isMultiVoice: boolean): readonly Mark[] {
  const techniques = chord.heads.flatMap(({ note }) => (note.drumTechnique === undefined ? [] : [note.drumTechnique]));
  return techniques.flatMap((technique, index) => {
    const glyphs = MARKS[technique.symbol];
    const isFirst = techniques.findIndex((other) => other.symbol === technique.symbol) === index;
    if (glyphs === undefined || !isFirst || technique.placement === 'inside') {
      return [];
    }
    const isOutside = technique.placement === 'outside';
    return [{ glyphs, side: isOutside ? articulationSide(chord, isMultiVoice) : technique.placement, isBeyondStaff: !isOutside }];
  });
}

/**
 * The edge a mark starts from: the notes (the stem's end too with two voices, as articulations) and the articulations
 * on its side; a mark above or below the staff, the staff and the stem too.
 */
function startEdge(chord: Chord, tip: number | undefined, layout: DrumMarkLayout, mark: Mark): number {
  const { isMultiVoice, top } = layout;
  const articulations = articulationSide(chord, isMultiVoice) === mark.side ? articulationHeight(chord, isMultiVoice) : 0;
  const reach = mark.isBeyondStaff || isMultiVoice ? tip : undefined;
  if (mark.side === 'above') {
    const notes = chordTop(chord, reach) - articulations;
    return mark.isBeyondStaff ? Math.min(positionY(top, STAFF.topLine), notes) : notes;
  }
  const notes = chordBottom(chord, reach) + articulations;
  return mark.isBeyondStaff ? Math.max(positionY(top, STAFF.bottomLine), notes) : notes;
}

/** A mark's glyph beyond `edge`, and the edge past it. */
function placeMark(mark: Mark, edge: number, x: number, color: string): { readonly edge: number; readonly command: TextCommand } {
  const { scale } = mark.glyphs;
  const shown = mark.side === 'above' ? mark.glyphs.above : mark.glyphs.below;
  const unit = NOTATION.space * scale;
  // Ink spans `bottom` … `top` around the baseline (y grows downwards).
  const baseline = mark.side === 'above' ? edge - ARTICULATION.gap + shown.bottom * unit : edge + ARTICULATION.gap + shown.top * unit;
  const next = mark.side === 'above' ? baseline - shown.top * unit : baseline - shown.bottom * unit;
  const command = { ...musicGlyph(x, baseline, shown.text, color, 'center'), size: MUSIC_FONT_SIZE * scale };
  return { edge: next, command };
}

function markCommands(chord: Chord, tip: number | undefined, layout: DrumMarkLayout): TextCommand[] {
  const marks = chordMarks(chord, layout.isMultiVoice);
  const sides: readonly ArticulationSide[] = ['above', 'below'];
  return sides.flatMap((side) => {
    // Nearest the notes first; each mark beyond the last one and its own start.
    const onSide = marks.filter((mark) => mark.side === side);
    const ordered = [...onSide.filter((mark) => !mark.isBeyondStaff), ...onSide.filter((mark) => mark.isBeyondStaff)];
    const beyond = side === 'above' ? Math.min : Math.max;
    const placed = ordered.reduce<{ readonly edge?: number; readonly commands: readonly TextCommand[] }>(
      ({ edge, commands }, mark) => {
        const start = startEdge(chord, tip, layout, mark);
        const next = placeMark(mark, edge === undefined ? start : beyond(edge, start), chord.event.x, layout.color);
        return { edge: next.edge, commands: [...commands, next.command] };
      },
      { commands: [] },
    );
    return [...placed.commands];
  });
}

/** Parentheses around the noteheads of muted drums (Guitar Pro's "inside" symbol). */
function parenthesisCommands(chord: Chord, color: string): TextCommand[] {
  return chord.heads.flatMap((head) =>
    head.note.drumTechnique?.symbol === 'noteheadParenthesis' ? [musicGlyph(head.x, head.y, SMUFL.noteheadParenthesis, color)] : [],
  );
}

/**
 * The technique symbols of Guitar Pro's drum kit: the edge of a cymbal, tambourine strokes and golpes above or below
 * the staff, a choke's dot or a return's bow on the side away from the stem (beyond the articulations), a mute's
 * parentheses around its notehead.
 */
export function drumTechniques(layout: DrumMarkLayout): TextCommand[] {
  return layout.chords.flatMap((chord, index) =>
    chord === undefined ? [] : [...parenthesisCommands(chord, layout.color), ...markCommands(chord, layout.tips[index], layout)],
  );
}
