import { type PageSetup, type Song, millimetresToPoints, pageSize, stylesheetOf } from '@gp-editor/core';
import { withoutExtension } from '../lib/file-name';
import { t } from '../lib/i18n/i18n';
import { squeezeRow } from '../lib/layout';
import { type ChordDisplay, DEFAULT_CHORD_DISPLAY } from '../score/chords';
import { type DrawCommand, placeCommands, translateCommands } from '../score/draw';
import { SCORE_MODE_LABELS, type ScoreMode } from '../score/geometry';
import { type RowContext, engraveRow } from '../score/row';
import { type ScoreLayout, type ScoreStaff, type StaffSpec, layoutStaves, scoreStaves } from '../score/score-layout';
import { engraveSystemStaff, staffDecor } from '../score/system-staff';
import { PAGE, PAPER_SIZES, PRINT_PALETTE, PRINT_SCALE, type PaperId, type PaperSize } from './paper';
import { type TitleBlock, engraveTitleBlock, fitFontSize } from './title-block';

/**
 * A PDF as the native side draws it (`GPPdfExport.savePdf`, macos/GPEditor-macOS/GPPdfExport.m): pages in points,
 * origin top-left, y down, drawn like the score canvas.
 */
export interface PdfDocument {
  /** The PDF's title (its metadata) and the title in every page's footer. */
  readonly title: string;
  readonly pages: readonly PdfPage[];
}

export interface PdfPage {
  readonly width: number;
  readonly height: number;
  readonly commands: readonly DrawCommand[];
}

export interface PdfOptions {
  /** A paper size in place of the stylesheet's page format (its orientation and margins still apply). */
  readonly paper?: PaperId;
  /** The open file's name, the title of a song without one. */
  readonly fileName?: string;
  /** What the score shows of its chords, as on screen; names and diagrams by default. */
  readonly chordDisplay?: ChordDisplay;
  /** The multitrack view's staves: with several, each system prints them all (the track and mode arguments are not used). */
  readonly staves?: readonly StaffSpec[];
}

/** The page's margins in points. */
export interface PageMarginPoints {
  readonly top: number;
  readonly right: number;
  readonly bottom: number;
  readonly left: number;
}

/** Everything the pages are made from, before engraving the systems. */
interface PdfPlan {
  readonly song: Song;
  readonly title: string;
  readonly paper: PaperSize;
  readonly margins: PageMarginPoints;
  /** The footer ("<title> — <page> / <pages>") is printed: the stylesheet's page numbers. */
  readonly hasFooter: boolean;
  readonly titleBlock: TitleBlock;
  readonly layout: ScoreLayout;
  /** Width of a row at screen size: the printable width divided by `scale`. */
  readonly rowWidth: number;
  /** Print size per screen point: PRINT_SCALE, smaller for a system taller than the room under the title block. */
  readonly scale: number;
  /** Where the systems end on a page. */
  readonly bottom: number;
  /** The systems of each page (their indexes), top to bottom. */
  readonly pages: readonly (readonly number[])[];
}

/** The export panel's Show choice: a score mode, or (in the multitrack view) every track in its own staves. */
export type ExportMode = ScoreMode | 'asShown';

/** The staves an export prints for the multitrack view's `staves`: as shown, or all in one mode; undefined for one track. */
export function exportStaves(staves: readonly StaffSpec[], mode: ExportMode): readonly StaffSpec[] | undefined {
  if (staves.length < 2) {
    return undefined;
  }
  return mode === 'asShown' ? staves : staves.map((staff) => ({ ...staff, mode }));
}

/** Characters a file name cannot hold on macOS (the save panel would take "/" for a folder). */
const FILE_NAME_SEPARATORS = /[/:]/g;
/** Leading dots, which would hide the exported file. */
const HIDDEN_PREFIX = /^\.+/;

/** The song's title, else the file name without its extension, else "Untitled". */
export function pdfTitle(song: Song, fileName = ''): string {
  return song.info.title || withoutExtension(fileName) || t('common.untitled');
}

/**
 * An export's name without extension: "Song (Tab)", with the track for a song of several tracks ("Song - Bass (Tab)"),
 * "Song (Multitrack)" for several shown tracks (`staves`).
 */
export function exportBaseName(song: Song, trackIndex: number, mode: ScoreMode, fileName: string, staves: readonly StaffSpec[] = []): string {
  const base = withoutExtension(fileName) || pdfTitle(song);
  const isMultitrack = staves.length > 1;
  const trackName = song.tracks.length > 1 && !isMultitrack ? song.tracks[trackIndex]?.name ?? '' : '';
  const name = trackName === '' ? base : `${base} - ${trackName}`;
  return `${name.replace(FILE_NAME_SEPARATORS, '-').replace(HIDDEN_PREFIX, '')} (${isMultitrack ? t('window.export.multitrack') : SCORE_MODE_LABELS[mode]})`;
}

/** Name the save panel suggests: "Song (Tab).pdf", with the track for a song of several tracks ("Song - Bass (Tab).pdf"). */
export function pdfFileName(song: Song, trackIndex: number, mode: ScoreMode, fileName: string, staves?: readonly StaffSpec[]): string {
  return `${exportBaseName(song, trackIndex, mode, fileName, staves)}.pdf`;
}

/** Rounding left over by scaling and adding heights up (a system scaled to fill the room under the title block): a row that fits to this much still fits. */
const FIT_TOLERANCE = 1e-6;

/**
 * Rows per page, top to bottom, each `heightOf` tall; a row is never split. The first page's rows start at `firstTop`
 * (under the title block), the others' at `top`; rows end above `bottom`. A row taller than a page gets a page of its
 * own (the first page's, when it would be alone there). Always one page at least.
 */
export function packRows<T>(rows: readonly T[], heightOf: (row: T) => number, firstTop: number, top: number, bottom: number): T[][] {
  const pages: T[][] = [[]];
  let y = firstTop;
  for (const row of rows) {
    const height = heightOf(row);
    const page = pages[pages.length - 1] ?? [];
    const isTallerThanPage = height > bottom - top;
    const isFull = page.length === 0 ? !isTallerThanPage && y + height > bottom + FIT_TOLERANCE : isTallerThanPage || y + height > bottom + FIT_TOLERANCE;
    if (isFull) {
      pages.push([row]);
      y = top + height;
    } else {
      page.push(row);
      y += height;
    }
  }
  return pages;
}

/** The staves printed: the multitrack view's when it shows several, else the track in `mode`. */
function printedStaves(trackIndex: number, mode: ScoreMode, options: PdfOptions): readonly StaffSpec[] {
  return options.staves !== undefined && options.staves.length > 1 ? options.staves : [{ trackIndex, mode }];
}

/**
 * The score as the screen lays it out, at screen size across the printable width, to print at PRINT_SCALE; a single
 * track's measure too wide for a line is squeezed instead of running off the page.
 */
function printedLayout(song: Song, staves: readonly ScoreStaff[], chordDisplay: ChordDisplay, rowWidth: number): ScoreLayout {
  const layout = layoutStaves(song, staves, chordDisplay, rowWidth);
  if (layout.staves.length !== 1) {
    return layout;
  }
  return { ...layout, systems: layout.systems.map((system) => ({ ...system, rows: system.rows.map((row) => squeezeRow(row, rowWidth - system.headerWidth)) })) };
}

/** The page the PDF is printed on: the stylesheet's format and orientation (or `paper`'s size in its orientation). */
export function printedPage(page: PageSetup, paper?: PaperId): PaperSize {
  const size = paper === undefined ? pageSize(page) : PAPER_SIZES[paper];
  const isTurned = paper !== undefined && page.orientation === 'landscape';
  return { name: paper === undefined ? '' : PAPER_SIZES[paper].name, width: isTurned ? size.height : size.width, height: isTurned ? size.width : size.height };
}

/** The stylesheet's margins (millimetres) in points. */
function pageMargins(page: PageSetup): PageMarginPoints {
  const { top, right, bottom, left } = page.margins;
  return { top: millimetresToPoints(top), right: millimetresToPoints(right), bottom: millimetresToPoints(bottom), left: millimetresToPoints(left) };
}

function planPdf(song: Song, trackIndex: number, mode: ScoreMode, options: PdfOptions): PdfPlan {
  const sheet = stylesheetOf(song);
  const paper = printedPage(sheet.page, options.paper);
  const margins = pageMargins(sheet.page);
  const hasFooter = sheet.header.showsPageNumbers;
  const title = pdfTitle(song, options.fileName);
  const printWidth = paper.width - margins.left - margins.right;
  const staves = printedStaves(trackIndex, mode, options);
  // Several tracks are named on their staves, not under the title.
  const titleBlock = engraveTitleBlock(song, staves.length > 1 ? -1 : trackIndex, title, printWidth, PRINT_PALETTE);
  const chordDisplay = options.chordDisplay ?? DEFAULT_CHORD_DISPLAY;
  const bottom = paper.height - margins.bottom - (hasFooter ? PAGE.footerHeight : 0);
  const firstTop = margins.top + titleBlock.height;
  // The stylesheet's overall proportions scale the printed staves as they scale the screen's.
  const printScale = PRINT_SCALE * sheet.scale;
  const stacked = scoreStaves(song, staves, chordDisplay);
  const { layout, scale } = fittedLayout(song, stacked, chordDisplay, { printWidth, printScale, room: bottom - firstTop });
  const rowWidth = printWidth / scale;
  const pages = packRows(layout.systems.map((_, systemIndex) => systemIndex), (systemIndex) => (layout.systems[systemIndex]?.height ?? 0) * scale, firstTop, margins.top, bottom);
  return { song, title, paper, margins, hasFooter, titleBlock, layout, rowWidth, scale, bottom, pages };
}

/**
 * The printed layout at `printScale`; when its tallest system is taller than the `room` under the title block (many
 * tracks), the scale that fits it, laid out again across the wider row so that it still fills the printable width.
 */
function fittedLayout(song: Song, stacked: readonly ScoreStaff[], chordDisplay: ChordDisplay, page: { readonly printWidth: number; readonly printScale: number; readonly room: number }): { readonly layout: ScoreLayout; readonly scale: number } {
  const { printWidth, printScale, room } = page;
  const layout = printedLayout(song, stacked, chordDisplay, printWidth / printScale);
  const tallest = Math.max(0, ...layout.systems.map((system) => system.height));
  const fit = tallest > 0 ? Math.min(1, room / (tallest * printScale)) : 1;
  if (fit >= 1) {
    return { layout, scale: printScale };
  }
  const scale = printScale * fit;
  return { layout: printedLayout(song, stacked, chordDisplay, printWidth / scale), scale };
}

/** One staff of a system as the screen engraves it (no cursor, nothing playing), in print colours, from the staff's top. */
function engraveSystemPart(plan: PdfPlan, systemIndex: number, staffIndex: number): DrawCommand[] {
  const { song, layout } = plan;
  const system = layout.systems[systemIndex];
  const staff = system?.staves[staffIndex];
  const row = system?.rows[staffIndex];
  if (staff === undefined || row === undefined) {
    return [];
  }
  const context: RowContext = {
    song, trackIndex: staff.trackIndex, row, headerWidth: layout.clefWidth, mode: staff.mode, geometry: staff.geometry, palette: PRINT_PALETTE,
    markLanes: staff.markLanes, hasHeading: staff.hasHeading,
  };
  const decor = staffDecor(song, layout, systemIndex, staffIndex);
  return decor === undefined ? engraveRow(context) : engraveSystemStaff(context, decor);
}

/**
 * One system scaled and placed with its top at `y`, each staff moved to its place in the system, scaled and put on the
 * page in one pass. A system still too wide once squeezed (a bar denser than squeezeRow can fit), or taller than the
 * room under `y`, is printed smaller to stay on the page.
 */
function engravePrintedSystem(plan: PdfPlan, systemIndex: number, y: number): DrawCommand[] {
  const { layout, margins } = plan;
  const system = layout.systems[systemIndex];
  const width = (system?.rows[0]?.measures ?? []).reduce((sum, measure) => sum + measure.width, system?.headerWidth ?? 0);
  const fit = Math.min(1, plan.rowWidth / width, (plan.bottom - y) / ((system?.height ?? 0) * plan.scale));
  const scale = plan.scale * fit;
  return (system?.staves ?? []).flatMap((staff, staffIndex) =>
    placeCommands(engraveSystemPart(plan, systemIndex, staffIndex), { dx: 0, dy: staff.top, scale, x: margins.left, y }),
  );
}

/** "<title> — <page> / <pages>", centred in the footer band. */
function engraveFooter(plan: PdfPlan, pageNumber: number): DrawCommand[] {
  const { paper, title, pages, margins } = plan;
  if (!plan.hasFooter) {
    return [];
  }
  const text = `${title} — ${pageNumber} / ${pages.length}`;
  const width = paper.width - margins.left - margins.right;
  return [{
    kind: 'text', x: margins.left + width / 2, y: paper.height - margins.bottom - PAGE.footerFontSize / 2, text,
    size: fitFontSize(text, PAGE.footerFontSize, width), color: PRINT_PALETTE.muted, font: 'ui', align: 'center',
  }];
}

function buildPage(plan: PdfPlan, systems: readonly number[], pageIndex: number): PdfPage {
  const { paper, titleBlock, margins, layout, scale } = plan;
  const isFirst = pageIndex === 0;
  const top = isFirst ? margins.top + titleBlock.height : margins.top;
  const background: DrawCommand = { kind: 'rect', x: 0, y: 0, width: paper.width, height: paper.height, color: PRINT_PALETTE.paper };
  // Each system under the one before it, as tall as its own staves.
  const firstTop = layout.systems[systems[0] ?? 0]?.top ?? 0;
  return {
    width: paper.width,
    height: paper.height,
    commands: [
      background,
      ...(isFirst ? translateCommands(titleBlock.commands, margins.left, margins.top) : []),
      ...systems.flatMap((systemIndex) => engravePrintedSystem(plan, systemIndex, top + ((layout.systems[systemIndex]?.top ?? 0) - firstTop) * scale)),
      ...engraveFooter(plan, pageIndex + 1),
    ],
  };
}

/**
 * The PDF of one track in a score mode (or of the multitrack view's tracks, `options.staves`): a title block on the
 * first page, then every row or system of the score engraved as on screen, packed onto pages top to bottom, with a
 * numbered footer on each page. An empty song is one page.
 */
export function buildPdfDocument(song: Song, trackIndex: number, mode: ScoreMode, options: PdfOptions): PdfDocument {
  const plan = planPdf(song, trackIndex, mode, options);
  return { title: plan.title, pages: plan.pages.map((systems, pageIndex) => buildPage(plan, systems, pageIndex)) };
}

/** How many pages buildPdfDocument makes, without engraving them. */
export function pdfPageCount(song: Song, trackIndex: number, mode: ScoreMode, options: PdfOptions): number {
  return planPdf(song, trackIndex, mode, options).pages.length;
}
