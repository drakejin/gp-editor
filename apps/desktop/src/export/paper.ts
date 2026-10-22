import { CHROME, type Palette } from '../theme';

/** Paper sizes the PDF export offers. */
export type PaperId = 'a4' | 'letter';

/** A page size in points (1/72 inch). */
export interface PaperSize {
  /** Name on the export panel's button. */
  readonly name: string;
  readonly width: number;
  readonly height: number;
}

export const PAPER_SIZES: Readonly<Record<PaperId, PaperSize>> = {
  a4: { name: 'A4', width: 595, height: 842 },
  letter: { name: 'US Letter', width: 612, height: 792 },
};

/** Paper sizes in the order the export panel shows them. */
export const PAPER_IDS: readonly PaperId[] = ['a4', 'letter'];

export const DEFAULT_PAPER: PaperId = 'a4';

/** Page layout, in points. */
export const PAGE = {
  /** On all four sides. */
  margin: 36,
  /** Band above the bottom margin that holds the footer ("<title> — <page> / <pages>"). */
  footerHeight: 18,
  footerFontSize: 9,
  /** Between the title block and the first row of the score. */
  titleGap: 14,
} as const;

/**
 * Rows are engraved at screen size and printed this much smaller: the notation staff (four 8 pt spaces) becomes
 * 20.8 pt ≈ 7.3 mm, the usual size of printed music, and tab fret numbers 7 pt.
 */
export const PRINT_SCALE = 0.65;

/**
 * Ink on white paper, whatever the app's appearance: notes and text in black, staff lines and secondary text in greys,
 * a second voice in dark grey (the accent colour on screen). The cursor and playing colours are never drawn in print.
 */
export const PRINT_PALETTE: Palette = {
  background: '#FFFFFF',
  sidebar: '#FFFFFF',
  paper: '#FFFFFF',
  text: '#000000',
  muted: '#555555',
  line: '#333333',
  accent: '#555555',
  accentText: '#FFFFFF',
  selection: '#DDDDDD',
  danger: '#000000',
  border: '#BBBBBB',
  desk: '#FFFFFF',
  ...CHROME,
};
