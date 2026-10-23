import type { Song } from '@gp-editor/core';
import { withoutExtension } from '../lib/file-name';
import { type RowLayout, layoutMeasure, layoutRows, squeezeRow } from '../lib/layout';
import { type ChordDisplay, DEFAULT_CHORD_DISPLAY, chordBands, chordBeatWidth } from '../score/chords';
import { type DrawCommand, scaleCommands, translateCommands } from '../score/draw';
import { hasDynamicChanges } from '../score/dynamics';
import { type RowGeometry, SCORE_MODE_LABELS, type ScoreMode, rowGeometry } from '../score/geometry';
import { engraveRow, rowHeaderWidth } from '../score/row';
import { hasLyrics } from '../score/lyrics';
import { hasBends } from '../score/symbols/bends';
import { type TabMarkKind, tabMarkLanes } from '../score/tab';
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
  readonly paper: PaperId;
  /** The open file's name, the title of a song without one. */
  readonly fileName?: string;
  /** What the score shows of its chords, as on screen; names and diagrams by default. */
  readonly chordDisplay?: ChordDisplay;
}

/** Everything the pages are made from, before engraving the rows. */
interface PdfPlan {
  readonly song: Song;
  readonly trackIndex: number;
  readonly mode: ScoreMode;
  readonly title: string;
  readonly paper: PaperSize;
  readonly titleBlock: TitleBlock;
  readonly headerWidth: number;
  readonly geometry: RowGeometry;
  readonly markLanes: readonly TabMarkKind[];
  /** Width of a row at screen size: the printable width divided by PRINT_SCALE. */
  readonly rowWidth: number;
  /** Height of a printed row; every row of a track has the same. */
  readonly rowHeight: number;
  /** The rows of each page, top to bottom. */
  readonly pages: readonly (readonly RowLayout[])[];
}

const UNTITLED = 'Untitled';
/** Characters a file name cannot hold on macOS (the save panel would take "/" for a folder). */
const FILE_NAME_SEPARATORS = /[/:]/g;

/** The song's title, else the file name without its extension, else "Untitled". */
export function pdfTitle(song: Song, fileName = ''): string {
  return song.info.title || withoutExtension(fileName) || UNTITLED;
}

/** Name the save panel suggests: "Song (Tab).pdf", with the track for a song of several tracks ("Song - Bass (Tab).pdf"). */
export function pdfFileName(song: Song, trackIndex: number, mode: ScoreMode, fileName: string): string {
  const base = withoutExtension(fileName) || pdfTitle(song);
  const trackName = song.tracks.length > 1 ? song.tracks[trackIndex]?.name ?? '' : '';
  const name = trackName === '' ? base : `${base} - ${trackName}`;
  return `${name.replace(FILE_NAME_SEPARATORS, '-')} (${SCORE_MODE_LABELS[mode]}).pdf`;
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

function planPdf(song: Song, trackIndex: number, mode: ScoreMode, options: PdfOptions): PdfPlan {
  const paper = PAPER_SIZES[options.paper];
  const title = pdfTitle(song, options.fileName);
  const printWidth = paper.width - 2 * PAGE.margin;
  const titleBlock = engraveTitleBlock(song, trackIndex, title, printWidth, PRINT_PALETTE);
  const track = song.tracks[trackIndex];
  // Lanes and the dynamics, bend, lyrics and chord bands of the whole track, so every row has one height, as on screen.
  const trackMeasures = track?.measures ?? [];
  const markLanes = tabMarkLanes(trackMeasures);
  const chordDisplay = options.chordDisplay ?? DEFAULT_CHORD_DISPLAY;
  const geometry = rowGeometry(mode, track?.strings.length ?? 6, {
    markLaneCount: markLanes.length,
    hasDynamics: hasDynamicChanges(trackMeasures),
    hasBends: hasBends(trackMeasures),
    hasLyrics: hasLyrics(track),
    ...chordBands(trackMeasures, chordDisplay),
  });
  const headerWidth = track === undefined ? 0 : rowHeaderWidth(mode, track);
  // Rows are laid out at screen size across the printable width, then printed at PRINT_SCALE; a measure too wide for
  // a line is squeezed instead of running off the page.
  const measures = track === undefined ? [] : song.measureHeaders.map((_, i) => layoutMeasure(song, trackIndex, i, (beat) => chordBeatWidth(beat, chordDisplay)));
  const rowWidth = printWidth / PRINT_SCALE;
  const rows = layoutRows(measures, rowWidth - headerWidth).map((row) => squeezeRow(row, rowWidth - headerWidth));
  const rowHeight = geometry.height * PRINT_SCALE;
  const bottom = paper.height - PAGE.margin - PAGE.footerHeight;
  const pages = packRows(rows, rowHeight, PAGE.margin + titleBlock.height, PAGE.margin, bottom);
  return { song, trackIndex, mode, title, paper, titleBlock, headerWidth, geometry, markLanes, rowWidth, rowHeight, pages };
}

/**
 * One row as the screen engraves it (no cursor, nothing playing), in print colours, scaled and placed with its top at
 * `y`. A row still too wide once squeezed (a bar denser than squeezeRow can fit) is printed smaller to stay on the page.
 */
function engravePrintedRow(plan: PdfPlan, row: RowLayout, y: number): DrawCommand[] {
  const { song, trackIndex, headerWidth, mode, geometry, markLanes } = plan;
  const commands = engraveRow({ song, trackIndex, row, headerWidth, mode, geometry, palette: PRINT_PALETTE, markLanes });
  const width = row.measures.reduce((sum, measure) => sum + measure.width, headerWidth);
  const fit = Math.min(1, plan.rowWidth / width);
  return translateCommands(scaleCommands(commands, PRINT_SCALE * fit), PAGE.margin, y);
}

/** "<title> — <page> / <pages>", centred in the footer band. */
function engraveFooter(plan: PdfPlan, pageNumber: number): DrawCommand {
  const { paper, title, pages } = plan;
  const text = `${title} — ${pageNumber} / ${pages.length}`;
  return {
    kind: 'text', x: paper.width / 2, y: paper.height - PAGE.margin - PAGE.footerFontSize / 2, text,
    size: fitFontSize(text, PAGE.footerFontSize, paper.width - 2 * PAGE.margin), color: PRINT_PALETTE.muted, font: 'ui', align: 'center',
  };
}

function buildPage(plan: PdfPlan, rows: readonly RowLayout[], pageIndex: number): PdfPage {
  const { paper, titleBlock, rowHeight } = plan;
  const isFirst = pageIndex === 0;
  const top = isFirst ? PAGE.margin + titleBlock.height : PAGE.margin;
  const background: DrawCommand = { kind: 'rect', x: 0, y: 0, width: paper.width, height: paper.height, color: PRINT_PALETTE.paper };
  return {
    width: paper.width,
    height: paper.height,
    commands: [
      background,
      ...(isFirst ? translateCommands(titleBlock.commands, PAGE.margin, PAGE.margin) : []),
      ...rows.flatMap((row, i) => engravePrintedRow(plan, row, top + i * rowHeight)),
      engraveFooter(plan, pageIndex + 1),
    ],
  };
}

/**
 * The PDF of one track in a score mode: a title block on the first page, then every row of the score engraved as on
 * screen, packed onto pages top to bottom, with a numbered footer on each page. An empty song is one page.
 */
export function buildPdfDocument(song: Song, trackIndex: number, mode: ScoreMode, options: PdfOptions): PdfDocument {
  const plan = planPdf(song, trackIndex, mode, options);
  return { title: plan.title, pages: plan.pages.map((rows, pageIndex) => buildPage(plan, rows, pageIndex)) };
}

/** How many pages buildPdfDocument makes, without engraving them. */
export function pdfPageCount(song: Song, trackIndex: number, mode: ScoreMode, options: PdfOptions): number {
  return planPdf(song, trackIndex, mode, options).pages.length;
}
