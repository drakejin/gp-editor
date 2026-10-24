import { type Clef, OTTAVAS, type Ottava } from '@gp-editor/core';
import { type MessageKey, t } from '../../lib/i18n/i18n';
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
    tooltip: t('palette.tool.expressionText', { shortcut: EXPRESSION_TEXT_SHORTCUT }),
    scope: 'beat',
    run: { kind: 'expressionText' },
    width: EXPRESSION_TEXT_TOOL_WIDTH,
  };
}

const OTTAVA_TOOLTIPS: Readonly<Record<Ottava, MessageKey>> = {
  '8va': 'palette.option.ottava.8va',
  '8vb': 'palette.option.ottava.8vb',
  '15ma': 'palette.option.ottava.15ma',
  '15mb': 'palette.option.ottava.15mb',
};

/** The octave sign over the selected beats (or the beat): none, 8va, 8vb, 15ma, 15mb (the Beat group). */
export function ottavaTool(): PaletteTool {
  const none: PaletteOption = { label: t('common.none'), tooltip: t('palette.option.noOttava'), edit: { type: 'setOttava', ottava: 'none' }, isActive: (c) => c.beat !== undefined && c.beat.ottava === undefined };
  const signs = OTTAVAS.map((ottava): PaletteOption => ({ label: ottava, tooltip: t(OTTAVA_TOOLTIPS[ottava]), edit: { type: 'setOttava', ottava }, isActive: (c) => c.beat?.ottava === ottava }));
  return {
    id: 'ottava',
    face: '8va',
    tooltip: t('palette.tool.ottava'),
    scope: 'beat',
    run: { kind: 'options', options: [none, ...signs] },
    isActive: (c) => c.beat?.ottava !== undefined,
  };
}

const CLEFS: readonly Clef[] = ['treble', 'bass', 'alto', 'tenor'];

/** Where the clef changes: the bar's clef differs from the bar before. */
function isClefChange(c: PaletteContext): boolean {
  return c.measure !== undefined && c.previousMeasure !== undefined && c.measure.clef !== c.previousMeasure.clef;
}

/** The clef from this bar to the next clef change (the Bar group); lit where the clef changes. */
export function clefTool(): PaletteTool {
  return {
    id: 'clef',
    face: t('palette.face.clef'),
    tooltip: t('palette.tool.clef'),
    scope: 'bar',
    run: {
      kind: 'options',
      options: CLEFS.map((clef) => ({
        label: t(`palette.option.clef.${clef}` as MessageKey),
        tooltip: t(`palette.option.clef.${clef}.tooltip` as MessageKey),
        edit: { type: 'setClef', clef },
        isActive: (c: PaletteContext) => c.measure?.clef === clef,
      })),
    },
    isActive: isClefChange,
  };
}
