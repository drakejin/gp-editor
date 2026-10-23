import type { Song } from '@gp-editor/core';
import { PAPER_SIZES, PRINT_PALETTE } from '../src/export/paper';
import { exportBaseName } from '../src/export/pdf-document';
import {
  DEFAULT_PNG_OPTIONS,
  PNG_RESOLUTIONS,
  pngFileNames,
  pngFilesText,
  pngPixelSize,
  pngRender,
  pngSavedHint,
} from '../src/export/png-export';
import { makeSong } from '../test-support/songs';

describe('pngFileNames', () => {
  it('names a one-page export after the score, without a page number', () => {
    expect(pngFileNames('Song (Tab)', 1)).toEqual(['Song (Tab).png']);
  });

  it('numbers the pages of a longer export from 1', () => {
    expect(pngFileNames('Song (Tab)', 3)).toEqual(['Song (Tab)-1.png', 'Song (Tab)-2.png', 'Song (Tab)-3.png']);
  });

  it('pads the page numbers so the files sort in page order', () => {
    // Act
    const names = pngFileNames('Etude', 12);

    // Assert
    expect(names[0]).toBe('Etude-01.png');
    expect(names[11]).toBe('Etude-12.png');
    expect([...names].sort()).toEqual(names);
  });
});

describe('exportBaseName', () => {
  it('is the PDF’s name without its extension, so both exports name the score alike', () => {
    const song: Song = makeSong([]);
    expect(exportBaseName(song, 0, 'tab', 'Song.gpx')).toBe('Song (Tab)');
    expect(exportBaseName(song, 0, 'notationAndTab', '')).toBe('Test (Score + Tab)');
  });

  it('drops leading dots, so an export of a hidden file is not hidden itself', () => {
    expect(exportBaseName(makeSong([]), 0, 'tab', '.draft.gp5')).toBe('draft (Tab)');
  });
});

describe('pngPixelSize', () => {
  it('turns a page in points into pixels at the resolution (72 dpi = one pixel per point)', () => {
    const a4 = PAPER_SIZES.a4;
    expect(pngPixelSize(a4, 72)).toEqual({ width: 595, height: 842 });
    expect(pngPixelSize(a4, 150)).toEqual({ width: 1240, height: 1754 });
    expect(pngPixelSize(a4, 300)).toEqual({ width: 2479, height: 3508 });
    expect(pngPixelSize(PAPER_SIZES.letter, 300)).toEqual({ width: 2550, height: 3300 });
  });
});

describe('pngRender', () => {
  it('scales points to pixels and paints the paper white when the background is not transparent', () => {
    expect(pngRender({ dpi: 300, isTransparent: false })).toEqual({ scale: 300 / 72, eraseColor: '' });
  });

  it('erases with the paper colour when the background is transparent, so no paper is left behind fret numbers', () => {
    expect(pngRender({ dpi: 72, isTransparent: true })).toEqual({ scale: 1, eraseColor: PRINT_PALETTE.paper });
  });
});

describe('options', () => {
  it('offers screen, medium and print resolutions, with a white page at 150 dpi first', () => {
    expect(PNG_RESOLUTIONS).toEqual([72, 150, 300]);
    expect(DEFAULT_PNG_OPTIONS).toEqual({ dpi: 150, isTransparent: false });
  });
});

describe('pngFilesText and pngSavedHint', () => {
  it('names one file, or the first and last of several', () => {
    expect(pngFilesText(['Song.png'])).toBe('Song.png');
    expect(pngFilesText(['Song-1.png', 'Song-2.png'])).toBe('Song-1.png, Song-2.png');
    expect(pngFilesText(['Song-1.png', 'Song-2.png', 'Song-3.png'])).toBe('Song-1.png … Song-3.png');
  });

  it('says what was saved where', () => {
    expect(pngSavedHint(['Song.png'], 'Exports')).toBe('Saved Song.png in “Exports”.');
    expect(pngSavedHint(['Song-1.png', 'Song-2.png', 'Song-3.png'], 'Exports')).toBe('Saved 3 PNG images in “Exports”: Song-1.png … Song-3.png.');
  });
});
