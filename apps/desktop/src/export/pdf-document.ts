import { type PageSetup, type Song, millimetresToPoints, pageSize, stylesheetOf } from '@gp-editor/core';
import { withoutExtension } from '../lib/file-name';
import { t } from '../lib/i18n/i18n';
import { squeezeRow } from '../lib/layout';
import { type ChordDisplay, DEFAULT_CHORD_DISPLAY } from '../score/chords';
import { type DrawCommand, scaleCommands, translateCommands } from '../score/draw';
import { SCORE_MODE_LABELS, type ScoreMode } from '../score/geometry';
import { type RowContext, engraveRow } from '../score/row';
import { type ScoreLayout, type StaffSpec, layoutScore } from '../score/score-layout';
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
  /** Height of a printed system; every system has the same. */
  readonly rowHeight: number;
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

/**
 * Rows per page, top to bottom; a row is never split. The first page's rows start at `firstTop` (under the title
 * block), the others' at `top`; rows end above `bottom`. A row taller than a page gets a page of its own. Always one page at least.
 */
export function packRows<T>(rows: readonly T[], rowHeight: number, firstTop: number, top: number, bottom: number): T[][] {
  const fitsAPage = rowHeight <= bottom - top;
  const firstCapacity = fitsAPage ? Math.max(0, Math.floor((bottom - firstTop) / rowHeight)) : 1;
  const capacity = fitsAPage ? Math.floor((bottom - top) / rowHeight) : 1;
  const rest = rows.slice(firstCapacity);
  const following = Array.from({ length: Math.ceil(rest.length / capacity) }, (_, i) => rest.slice(i * capacity, (i + 1) * capacity));
  return [rows.slice(0, firstCapacity), ...following];
}

/** The staves printed: the multitrack view's when it shows several, else the track in `mode`. */
function printedStaves(trackIndex: number, mode: ScoreMode, options: PdfOptions): readonly StaffSpec[] {
  return options.staves !== undefined && options.staves.length > 1 ? options.staves : [{ trackIndex, mode }];
}

/**
 * The score as the screen lays it out, at screen size across the printable width, to print at PRINT_SCALE; a single
 * track's measure too wide for a line is squeezed instead of running off the page.
 */
function printedLayout(song: Song, staves: readonly StaffSpec[], chordDisplay: ChordDisplay, rowWidth: number): ScoreLayout {
  const layout = layoutScore(song, staves, chordDisplay, rowWidth);
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
export function pageMargins(page: PageSetup): PageMarginPoints {
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
  // A system taller than the room under the title block (many tracks) is printed smaller, and laid out across a wider
  // row so that it still fills the printable width.
  const natural = printedLayout(song, staves, chordDisplay, printWidth / printScale);
  const fit = natural.systemHeight > 0 ? Math.min(1, (bottom - firstTop) / (natural.systemHeight * printScale)) : 1;
  const scale = printScale * fit;
  const rowWidth = printWidth / scale;
  const layout = fit === 1 ? natural : printedLayout(song, staves, chordDisplay, rowWidth);
  const rowHeight = layout.systemHeight * scale;
  const pages = packRows(layout.systems.map((_, systemIndex) => systemIndex), rowHeight, firstTop, margins.top, bottom);
  return { song, title, paper, margins, hasFooter, titleBlock, layout, rowWidth, scale, rowHeight, bottom, pages };
}

/** One staff of a system as the screen engraves it (no cursor, nothing playing), in print colours, from the system's top. */
function engraveSystemPart(plan: PdfPlan, systemIndex: number, staffIndex: number): DrawCommand[] {
  const { song, layout } = plan;
  const staff = layout.staves[staffIndex];
  const row = layout.systems[systemIndex]?.rows[staffIndex];
  if (staff === undefined || row === undefined) {
    return [];
  }
  const context: RowContext = {
    song, trackIndex: staff.trackIndex, row, headerWidth: layout.clefWidth, mode: staff.mode, geometry: staff.geometry, palette: PRINT_PALETTE,
    markLanes: staff.markLanes, hasHeading: staff.hasHeading,
  };
  const decor = staffDecor(song, layout, systemIndex, staffIndex);
  return translateCommands(decor === undefined ? engraveRow(context) : engraveSystemStaff(context, decor), 0, staff.top);
}

/**
 * One system scaled and placed with its top at `y`. A system still too wide once squeezed (a bar denser than
 * squeezeRow can fit), or taller than the room under `y`, is printed smaller to stay on the page.
 */
function engravePrintedSystem(plan: PdfPlan, systemIndex: number, y: number): DrawCommand[] {
  const { layout } = plan;
  const system = layout.systems[systemIndex];
  const commands = layout.staves.flatMap((_, staffIndex) => engraveSystemPart(plan, systemIndex, staffIndex));
  const width = (system?.rows[0]?.measures ?? []).reduce((sum, measure) => sum + measure.width, system?.headerWidth ?? 0);
  const fit = Math.min(1, plan.rowWidth / width, (plan.bottom - y) / plan.rowHeight);
  return translateCommands(scaleCommands(commands, plan.scale * fit), plan.margins.left, y);
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
  const { paper, titleBlock, rowHeight, margins } = plan;
  const isFirst = pageIndex === 0;
  const top = isFirst ? margins.top + titleBlock.height : margins.top;
  const background: DrawCommand = { kind: 'rect', x: 0, y: 0, width: paper.width, height: paper.height, color: PRINT_PALETTE.paper };
  return {
    width: paper.width,
    height: paper.height,
    commands: [
      background,
      ...(isFirst ? translateCommands(titleBlock.commands, margins.left, margins.top) : []),
      ...systems.flatMap((systemIndex, i) => engravePrintedSystem(plan, systemIndex, top + i * rowHeight)),
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
