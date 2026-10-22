import { QUARTER, type Song } from '@gp-editor/core';
import { PAGE, PAPER_SIZES } from '../src/export/paper';
import { buildPdfDocument, packRows, pdfFileName, pdfPageCount, pdfTitle } from '../src/export/pdf-document';
import { type DrawCommand, SMUFL } from '../src/score/draw';
import type { ScoreMode } from '../src/score/geometry';
import { textValues } from '../test-support/score-helpers';
import { beat, header, makeSong, note } from '../test-support/songs';

const BEATS_PER_BAR = 4;
const QUARTER_TICKS = 960;

/** `count` bars of four quarter notes walking over the strings. */
function songOfBars(count: number): Song {
  const bars = Array.from({ length: count }, (_, i) =>
    Array.from({ length: BEATS_PER_BAR }, (__, b) => beat(header(i + 1).start + b * QUARTER_TICKS, [note((b % 6) + 1, (i + b) % 5)])),
  );
  return makeSong(bars);
}

function withInfo(song: Song, info: Partial<Song['info']>): Song {
  return { ...song, info: { ...song.info, ...info } };
}

interface Bounds {
  readonly minX: number;
  readonly maxX: number;
  readonly minY: number;
  readonly maxY: number;
}

function bounds(command: DrawCommand): Bounds {
  switch (command.kind) {
    case 'line':
      return { minX: Math.min(command.x1, command.x2), maxX: Math.max(command.x1, command.x2), minY: Math.min(command.y1, command.y2), maxY: Math.max(command.y1, command.y2) };
    case 'rect':
      return { minX: command.x, maxX: command.x + command.width, minY: command.y, maxY: command.y + command.height };
    case 'circle':
      return { minX: command.x - command.radius, maxX: command.x + command.radius, minY: command.y - command.radius, maxY: command.y + command.radius };
    case 'text':
      return { minX: command.x, maxX: command.x, minY: command.y, maxY: command.y };
    case 'curve': {
      const xs = [command.x1, command.cx, command.x2];
      const ys = [command.y1, command.cy, command.y2];
      return { minX: Math.min(...xs), maxX: Math.max(...xs), minY: Math.min(...ys), maxY: Math.max(...ys) };
    }
    case 'polygon': {
      const xs = command.points.filter((_, i) => i % 2 === 0);
      const ys = command.points.filter((_, i) => i % 2 === 1);
      return { minX: Math.min(...xs), maxX: Math.max(...xs), minY: Math.min(...ys), maxY: Math.max(...ys) };
    }
  }
}

function colorOf(command: DrawCommand): string {
  return command.color;
}

/** #RRGGBB or #RRGGBBAA with equal red, green and blue: black, a grey or white. */
function isGrey(color: string): boolean {
  return /^#([0-9A-F]{2})\1\1([0-9A-F]{2})?$/i.test(color);
}

describe('packRows', () => {
  it('fills each page top to bottom and moves a row that does not fit whole to the next page', () => {
    // Arrange: 10 rows of 100 pt; the first page has 450 pt under its title, the others 750 pt.
    const rows = Array.from({ length: 10 }, (_, i) => i);

    // Act
    const pages = packRows(rows, 100, 300, 0, 750);

    // Assert
    expect(pages).toEqual([
      [0, 1, 2, 3],
      [4, 5, 6, 7, 8, 9],
    ]);
  });

  it('starts a new page after every seven rows on the following pages', () => {
    const pages = packRows(Array.from({ length: 20 }, (_, i) => i), 100, 0, 0, 750);
    expect(pages.map((page) => page.length)).toEqual([7, 7, 6]);
  });

  it('returns one empty page when there are no rows', () => {
    expect(packRows([], 100, 300, 0, 750)).toEqual([[]]);
  });

  it('gives a row taller than the page a page of its own', () => {
    expect(packRows(['a', 'b'], 900, 0, 0, 750)).toEqual([['a'], ['b']]);
  });
});

describe('buildPdfDocument', () => {
  const song = withInfo(songOfBars(48), { title: 'Etude', subtitle: 'In A minor', artist: 'Carulli' });

  it('spreads a long song over several pages and counts them like pdfPageCount', () => {
    // Act
    const pdf = buildPdfDocument(song, 0, 'notationAndTab', { paper: 'a4' });

    // Assert
    expect(pdf.title).toBe('Etude');
    expect(pdf.pages.length).toBeGreaterThan(2);
    expect(pdfPageCount(song, 0, 'notationAndTab', { paper: 'a4' })).toBe(pdf.pages.length);
  });

  it('draws the title block on the first page only', () => {
    const pdf = buildPdfDocument(song, 0, 'notationAndTab', { paper: 'a4' });
    const [first, ...others] = pdf.pages.map((page) => textValues(page.commands));
    expect(first).toEqual(expect.arrayContaining(['Etude', 'In A minor', 'Carulli']));
    others.forEach((texts) => {
      expect(texts).not.toContain('Etude');
      expect(texts).not.toContain('In A minor');
    });
  });

  it('numbers every page in its footer: "<title> — <page> / <pages>"', () => {
    const pdf = buildPdfDocument(song, 0, 'tab', { paper: 'a4' });
    const count = pdf.pages.length;
    pdf.pages.forEach((page, i) => {
      expect(textValues(page.commands)).toContain(`Etude — ${i + 1} / ${count}`);
    });
  });

  it('keeps every command inside its page', () => {
    const modes: readonly ScoreMode[] = ['notationAndTab', 'notation', 'tab'];
    modes.forEach((mode) => {
      buildPdfDocument(song, 0, mode, { paper: 'letter' }).pages.forEach((page) => {
        page.commands.forEach((command) => {
          const box = bounds(command);
          expect(box.minX).toBeGreaterThanOrEqual(0);
          expect(box.minY).toBeGreaterThanOrEqual(0);
          expect(box.maxX).toBeLessThanOrEqual(page.width);
          expect(box.maxY).toBeLessThanOrEqual(page.height);
        });
      });
    });
  });

  it('squeezes a bar too wide for a line instead of letting it run off the page', () => {
    // Arrange: one bar of 64 sixteenth notes, far wider than a line.
    const sixteenth = { ...QUARTER, value: 16 as const };
    const crowded = makeSong([Array.from({ length: 64 }, (_, i) => beat(960 + i * 240, [note(1, i % 12)], sixteenth))]);

    // Act
    const [page] = buildPdfDocument(crowded, 0, 'notationAndTab', { paper: 'a4' }).pages;

    // Assert: everything but the white background stays within the right margin.
    const [, ...drawn] = page?.commands ?? [];
    const right = Math.max(...drawn.map((command) => bounds(command).maxX));
    expect(right).toBeLessThanOrEqual(PAPER_SIZES.a4.width - PAGE.margin + 1);
  });

  it('prints a bar too dense to squeeze smaller, still inside the margins', () => {
    // Arrange: one bar of 400 thirty-second notes, more than four lines' worth even at the tightest spacing.
    const thirtySecond = { ...QUARTER, value: 32 as const };
    const dense = makeSong([Array.from({ length: 400 }, (_, i) => beat(960 + i * 120, [note(1, i % 12)], thirtySecond))]);

    // Act
    const pages = buildPdfDocument(dense, 0, 'tab', { paper: 'a4' }).pages;

    // Assert
    const drawn = pages.flatMap((page) => page.commands.slice(1));
    expect(Math.max(...drawn.map((command) => bounds(command).maxX))).toBeLessThanOrEqual(PAPER_SIZES.a4.width - PAGE.margin + 1);
    expect(Math.min(...drawn.map((command) => bounds(command).minX))).toBeGreaterThanOrEqual(PAGE.margin - 1);
  });

  it('keeps the score between the side margins and stretches full rows to the printable width', () => {
    // Act
    const page = buildPdfDocument(song, 0, 'tab', { paper: 'a4' }).pages[1];

    // Assert: staff lines run from the left margin to the right one.
    const lines = (page?.commands ?? []).filter((command) => command.kind === 'line');
    const right = Math.max(...lines.map((line) => bounds(line).maxX));
    const left = Math.min(...lines.map((line) => bounds(line).minX));
    expect(left).toBeCloseTo(PAGE.margin, 0);
    expect(right).toBeCloseTo(PAPER_SIZES.a4.width - PAGE.margin, 0);
  });

  it('shows notation and tab in Score + Tab, notation only in Score and tab only in Tab', () => {
    const glyphs = (mode: ScoreMode) => buildPdfDocument(song, 0, mode, { paper: 'a4' }).pages.flatMap((page) => textValues(page.commands));
    const both = glyphs('notationAndTab');
    const score = glyphs('notation');
    const tab = glyphs('tab');
    expect(both).toEqual(expect.arrayContaining([SMUFL.gClef8vb, SMUFL.sixStringTabClef]));
    expect(score).toContain(SMUFL.gClef8vb);
    expect(score).not.toContain(SMUFL.sixStringTabClef);
    expect(tab).toContain(SMUFL.sixStringTabClef);
    expect(tab).not.toContain(SMUFL.gClef8vb);
  });

  it('prints in black and grey on white, whatever the app looks like', () => {
    // Arrange: a second voice is drawn in the accent colour on screen.
    const twoVoices: Song = {
      ...song,
      tracks: song.tracks.map((track) => ({
        ...track,
        measures: track.measures.map((measure) => ({
          ...measure,
          beats: measure.beats.map((b) => ({ ...b, voices: [...b.voices, { ...b.voices[0]!, notes: [note(6, 0)] }] })),
        })),
      })),
    };

    // Act
    const pages = buildPdfDocument(twoVoices, 0, 'notationAndTab', { paper: 'a4' }).pages;

    // Assert
    pages.forEach((page) => {
      expect(page.commands[0]).toEqual({ kind: 'rect', x: 0, y: 0, width: page.width, height: page.height, color: '#FFFFFF' });
      expect(page.commands.map(colorOf).filter((color) => !isGrey(color))).toEqual([]);
    });
  });

  it('makes A4 and US Letter pages', () => {
    const a4 = buildPdfDocument(song, 0, 'tab', { paper: 'a4' }).pages;
    const letter = buildPdfDocument(song, 0, 'tab', { paper: 'letter' }).pages;
    expect(a4.every((page) => page.width === 595 && page.height === 842)).toBe(true);
    expect(letter.every((page) => page.width === 612 && page.height === 792)).toBe(true);
  });

  it('makes one page with the title block for an empty song', () => {
    // Arrange
    const empty = withInfo(makeSong([]), { title: 'Sketch' });

    // Act
    const pdf = buildPdfDocument(empty, 0, 'notationAndTab', { paper: 'a4' });

    // Assert
    expect(pdf.pages).toHaveLength(1);
    expect(textValues(pdf.pages[0]?.commands ?? [])).toEqual(expect.arrayContaining(['Sketch', 'Sketch — 1 / 1']));
  });

  it('makes one page with the title block when the track does not exist', () => {
    const pdf = buildPdfDocument(song, 5, 'tab', { paper: 'a4' });
    expect(pdf.pages).toHaveLength(1);
    expect(textValues(pdf.pages[0]?.commands ?? [])).toContain('Etude');
  });
});

describe('pdfTitle', () => {
  it("uses the song's title, else the file name without its extension", () => {
    expect(pdfTitle(withInfo(makeSong([]), { title: 'Etude' }), 'a.gp5')).toBe('Etude');
    expect(pdfTitle(withInfo(makeSong([]), { title: '' }), 'My Song.gpx')).toBe('My Song');
    expect(pdfTitle(withInfo(makeSong([]), { title: '' }))).toBe('Untitled');
  });
});

describe('pdfFileName', () => {
  it('names the PDF after the file and the mode', () => {
    expect(pdfFileName(makeSong([]), 0, 'tab', 'Song.gpx')).toBe('Song (Tab).pdf');
    expect(pdfFileName(makeSong([]), 0, 'notationAndTab', 'Song.gp5')).toBe('Song (Score + Tab).pdf');
  });

  it('adds the track name when the song has several tracks, without path separators', () => {
    // Arrange
    const song = makeSong([]);
    const [guitar] = song.tracks;
    const twoTracks: Song = { ...song, tracks: [guitar!, { ...guitar!, number: 2, name: 'Bass 1/2: low' }] };

    // Act
    const name = pdfFileName(twoTracks, 1, 'notation', 'Song.gp5');

    // Assert
    expect(name).toBe('Song - Bass 1-2- low (Score).pdf');
  });
});
