import { type BarNumbers, DEFAULT_STYLESHEET, type MeasureHeader, type Rgb, type TextStyle } from '@gp-editor/core';
import type { MeasureLayout } from '../lib/layout';
import type { Palette } from '../theme';
import type { DrawCommand, TextCommand } from './draw';
import { ROW } from './geometry';
import { textWidth } from './symbols/shapes';
import { styleText } from './text-styles';
import { engraveTripletFeel } from './triplet-feel';

const HEADING_LEFT = 2;
/** The tempo line, and the triplet feel on it after the tempo. */
const TEMPO_Y = 21;
const TEMPO_SIZE = 10;
/** After the tempo's estimated width (generous for "♩ = 120"). */
const TRIPLET_FEEL_GAP = 2;
const MARKER_LEFT = 18;
/** Rough width of one marker character at 11 pt, to cut long markers at the measure's edge. */
const MARKER_CHAR_WIDTH = 6.5;
const ENDING_WIDTH = 80;

export function rgbHex(color: Rgb): string {
  return `#${[color.r, color.g, color.b].map((v) => Math.max(0, Math.min(255, v)).toString(16).padStart(2, '0')).join('')}`;
}

/** What the stylesheet says of the heading: where bar numbers go, the fonts of the numbers and the tempo, its decimals. */
export interface HeadingStyle {
  readonly barNumbers: BarNumbers;
  /** The bar starts its system (bar numbers on the first bar of each system only). */
  readonly isRowStart: boolean;
  readonly barNumber: TextStyle;
  readonly tempo: TextStyle;
  readonly showsTempoDecimals: boolean;
}

const DEFAULT_HEADING: HeadingStyle = {
  barNumbers: DEFAULT_STYLESHEET.barNumbers,
  isRowStart: false,
  barNumber: DEFAULT_STYLESHEET.texts.barNumber,
  tempo: DEFAULT_STYLESHEET.texts.tempo,
  showsTempoDecimals: DEFAULT_STYLESHEET.notation.showsTempoDecimals,
};

/** The bar's number, unless the stylesheet hides it here; an over-full bar's is always shown. */
function barNumber(header: MeasureHeader, palette: Palette, isOverfull: boolean, style: HeadingStyle): DrawCommand[] {
  const isShown = isOverfull || style.barNumbers === 'all' || (style.barNumbers === 'systemStart' && style.isRowStart);
  if (!isShown) {
    return [];
  }
  const command: TextCommand = {
    kind: 'text', x: HEADING_LEFT, y: 8, text: String(header.number), size: 9,
    color: isOverfull ? palette.danger : palette.muted, font: 'ui', align: 'left', bold: isOverfull,
  };
  return [styleText(command, style.barNumber, DEFAULT_STYLESHEET.texts.barNumber)];
}

/**
 * Measure number, marker, tempo, triplet feel, alternate endings and repeat count above the staves (measure-local,
 * y 0…ROW.heading). The number of an over-full measure is drawn bold in the danger colour.
 */
export function engraveHeading(header: MeasureHeader, layout: MeasureLayout, palette: Palette, isOverfull = false, style: HeadingStyle = DEFAULT_HEADING): DrawCommand[] {
  const commands: DrawCommand[] = barNumber(header, palette, isOverfull, style);
  if (header.marker !== undefined) {
    const maxChars = Math.max(1, Math.floor((layout.width - MARKER_LEFT - 4) / MARKER_CHAR_WIDTH));
    const title = header.marker.title.length > maxChars ? `${header.marker.title.slice(0, maxChars - 1)}…` : header.marker.title;
    commands.push({ kind: 'text', x: MARKER_LEFT, y: 8, text: title, size: 11, color: rgbHex(header.marker.color), font: 'ui', align: 'left', bold: true });
  }
  const tempo = `♩ = ${style.showsTempoDecimals ? header.tempo : Math.round(header.tempo)}`;
  if (layout.showTempo) {
    const command: TextCommand = { kind: 'text', x: HEADING_LEFT, y: TEMPO_Y, text: tempo, size: TEMPO_SIZE, color: palette.text, font: 'ui', align: 'left', bold: true };
    commands.push(styleText(command, style.tempo, DEFAULT_STYLESHEET.texts.tempo));
  }
  if (layout.showTripletFeel) {
    const tempoSize = (TEMPO_SIZE * style.tempo.size) / DEFAULT_STYLESHEET.texts.tempo.size;
    const x = layout.showTempo ? HEADING_LEFT + textWidth(tempo, tempoSize) + TRIPLET_FEEL_GAP : HEADING_LEFT;
    commands.push(...engraveTripletFeel(header.tripletFeel, x, TEMPO_Y, palette.text));
  }
  commands.push(...endings(header.repeatAlternative, layout.width, palette));
  if (header.repeatClose > 0) {
    commands.push({ kind: 'text', x: layout.width - 2, y: ROW.heading - 10, text: `x${header.repeatClose}`, size: 10, color: palette.text, font: 'ui', align: 'right', bold: true });
  }
  return commands;
}

function endings(mask: number, width: number, palette: Palette): DrawCommand[] {
  // eslint-disable-next-line no-bitwise -- the repeat endings of a bar are a bit mask (bit 0 = ending 1)
  const numbers = Array.from({ length: 8 }, (_, bit) => bit).filter((bit) => (mask & (1 << bit)) !== 0).map((bit) => bit + 1);
  if (numbers.length === 0) {
    return [];
  }
  const y = ROW.heading - 4;
  const right = Math.min(width - 4, ENDING_WIDTH);
  return [
    { kind: 'line', x1: 0, y1: y, x2: right, y2: y, width: 1, color: palette.text },
    { kind: 'line', x1: 0, y1: y, x2: 0, y2: y + 8, width: 1, color: palette.text },
    { kind: 'text', x: 4, y: y - 7, text: `${numbers.join(', ')}.`, size: 10, color: palette.text, font: 'ui', align: 'left' },
  ];
}
