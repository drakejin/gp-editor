import { t } from '../lib/i18n/i18n';
import { CHROME, type Palette } from '../theme';

/** Paper sizes a PDF can be asked for in place of the stylesheet's page format (`PdfOptions.paper`). */
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
  letter: {
    get name() {
      return t('window.export.usLetter');
    },
    width: 612,
    height: 792,
  },
};

/** Page layout, in points. */
export const PAGE = {
  /** The default stylesheet's margin on all four sides (12.7 mm); the stylesheet sets each side's. */
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
 * a second voice in dark grey (the accent colour on screen), annotations in their box. The cursor and playing colours are
 * never drawn in print.
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
  voices: ['#555555', '#555555', '#555555', '#555555'],
  // Annotations print in their pale yellow box, so a page still tells the musician's notes from the music.
  annotationFill: '#FFF2BF',
  annotationInk: '#4A3800',
  ...CHROME,
};
