import { type Clef, OTTAVAS, type Ottava } from '@gp-editor/core';
import type { PaletteContext, PaletteOption, PaletteTool } from './palette-tools';

/** Guitar Pro 8's Expression Text (beside the beat's text) and the notation staff's octave signs and clefs. */

/** Tools ▸ Expression Text…: the menu item's key, shown in the button's tooltip. */
export const EXPRESSION_TEXT_SHORTCUT = '⌥⌘E';
/** Narrower than the palette's other tools, so it ends the Beat group's second row, under Text, without a new row. */
const EXPRESSION_TEXT_TOOL_WIDTH = 24;

/** The command palette's Expression Text: type a chord, a dynamic, a key, an octave sign, a clef or a direction. */
export function expressionTextTool(): PaletteTool {
  return {
    id: 'expressionText',
    face: '>',
    tooltip: `Expression Text (${EXPRESSION_TEXT_SHORTCUT}): type a chord (G maj), a dynamic (ff), a key (E minor), an octave sign (8va), a clef or a direction (D.S. al Coda)`,
    scope: 'beat',
    run: { kind: 'expressionText' },
    width: EXPRESSION_TEXT_TOOL_WIDTH,
  };
}

const OTTAVA_TOOLTIPS: Readonly<Record<Ottava, string>> = {
  '8va': '8va: written an octave lower than it sounds',
  '8vb': '8vb: written an octave higher than it sounds',
  '15ma': '15ma: written two octaves lower than it sounds',
  '15mb': '15mb: written two octaves higher than it sounds',
};

/** The octave sign over the selected beats (or the beat): none, 8va, 8vb, 15ma, 15mb (the Beat group). */
export function ottavaTool(): PaletteTool {
  const none: PaletteOption = { label: 'None', tooltip: 'No octave sign (loco)', edit: { type: 'setOttava', ottava: 'none' }, isActive: (c) => c.beat !== undefined && c.beat.ottava === undefined };
  const signs = OTTAVAS.map((ottava): PaletteOption => ({ label: ottava, tooltip: OTTAVA_TOOLTIPS[ottava], edit: { type: 'setOttava', ottava }, isActive: (c) => c.beat?.ottava === ottava }));
  return {
    id: 'ottava',
    face: '8va',
    tooltip: 'Octave sign over the selected beats (or the beat): 8va, 8vb, 15ma, 15mb — the notation only, the frets stay',
    scope: 'beat',
    run: { kind: 'options', options: [none, ...signs] },
    isActive: (c) => c.beat?.ottava !== undefined,
  };
}

const CLEFS: readonly (readonly [Clef, string, string])[] = [
  ['treble', 'Treble', 'Treble clef (G)'],
  ['bass', 'Bass', 'Bass clef (F)'],
  ['alto', 'Alto', 'Alto clef (C on the middle line)'],
  ['tenor', 'Tenor', 'Tenor clef (C on the fourth line)'],
];

/** Where the clef changes: the bar's clef differs from the bar before. */
function isClefChange(c: PaletteContext): boolean {
  return c.measure !== undefined && c.previousMeasure !== undefined && c.measure.clef !== c.previousMeasure.clef;
}

/** The clef from this bar to the next clef change (the Bar group); lit where the clef changes. */
export function clefTool(): PaletteTool {
  return {
    id: 'clef',
    face: 'Clef',
    tooltip: 'Clef from this bar on: treble, bass, alto or tenor — the notation only, the frets stay',
    scope: 'bar',
    run: { kind: 'options', options: CLEFS.map(([clef, label, tooltip]) => ({ label, tooltip, edit: { type: 'setClef', clef }, isActive: (c: PaletteContext) => c.measure?.clef === clef })) },
    isActive: isClefChange,
  };
}
