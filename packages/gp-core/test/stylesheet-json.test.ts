import { describe, expect, it } from 'vitest';
import { setBarWidthScale, setBeatOffset, setSystemBars } from '../src/edit/bar-design';
import { setStylesheet } from '../src/edit/stylesheet';
import { readSong } from '../src/read-song';
import { DEFAULT_STYLESHEET, STYLESHEET_LIMITS, type Stylesheet } from '../src/model/stylesheet';
import type { Song } from '../src/model/song';
import { parseBarDesign, parseStylesheet } from '../src/stylesheet/stylesheet-json';
import {
  SONG_DESIGN_VERSION,
  SONG_STYLESHEET_VERSION,
  readSongDesign,
  readSongStylesheet,
  songDesignToJson,
  songStylesheetToJson,
} from '../src/stylesheet/song-stylesheet';
import { writeSong } from '../src/write';
import { buildSong, deepFreeze, n, play } from './helpers/edit-songs';

function twoBars(): Song {
  return deepFreeze(buildSong({ tracks: [[[[play(4, n(1, 5)), play(4, n(1, 7)), play(2, n(2, 0))]], [[play(1, n(2, 3))]]]] }));
}

const LARGER: Stylesheet = {
  ...DEFAULT_STYLESHEET,
  scale: 1.25,
  systems: { ...DEFAULT_STYLESHEET.systems, systemSpacing: 30, firstSystemNames: 'short' },
  texts: { ...DEFAULT_STYLESHEET.texts, lyrics: { family: 'Georgia', size: 14, isBold: false, isItalic: true } },
  notation: { ...DEFAULT_STYLESHEET.notation, labels: { ...DEFAULT_STYLESHEET.notation.labels, palmMute: 'PM' } },
};

describe('parseStylesheet', () => {
  it('reads a stylesheet as it was written', () => {
    expect(parseStylesheet(JSON.parse(JSON.stringify(LARGER)))).toEqual(LARGER);
  });

  it('reads anything that is not a stylesheet as the default one', () => {
    expect(parseStylesheet(undefined)).toEqual(DEFAULT_STYLESHEET);
    expect(parseStylesheet([1, 2])).toEqual(DEFAULT_STYLESHEET);
    expect(parseStylesheet('A4')).toEqual(DEFAULT_STYLESHEET);
  });

  it('clamps numbers into range and drops values of the wrong kind', () => {
    // Arrange
    const raw = {
      scale: 40,
      noteSpacing: 'wide',
      page: { format: 'a9', orientation: 'sideways', customWidth: 5, margins: { top: -4, left: 300 } },
      systems: { barsPerSystem: 7.6, trackSpacing: -10, firstSystemNames: 'tiny' },
      texts: { title: { size: 500, family: 7, isBold: 'yes' }, bogus: { size: 9 } },
      lyrics: 'sideways',
      barNumbers: 'systemStart',
    };

    // Act
    const sheet = parseStylesheet(raw);

    // Assert
    expect(sheet.scale).toBe(2);
    expect(sheet.noteSpacing).toBe(1);
    expect(sheet.page.format).toBe('a4');
    expect(sheet.page.orientation).toBe('portrait');
    expect(sheet.page.customWidth).toBe(50);
    expect(sheet.page.margins).toEqual({ top: 0, right: 12.7, bottom: 12.7, left: 60 });
    expect(sheet.systems.barsPerSystem).toBe(8);
    expect(sheet.systems.trackSpacing).toBe(0);
    expect(sheet.systems.firstSystemNames).toBe('full');
    expect(sheet.texts.title).toEqual({ ...DEFAULT_STYLESHEET.texts.title, size: 72 });
    expect(sheet.texts).not.toHaveProperty('bogus');
    expect(sheet.lyrics).toBe('below');
    expect(sheet.barNumbers).toBe('systemStart');
  });

  it('keeps a system spacing below none, systems closer than the app sets them, down to its least', () => {
    // Arrange
    const closer = { systems: { systemSpacing: -8 } };
    const tooClose = { systems: { systemSpacing: -50 } };

    // Act
    const [kept, clamped] = [parseStylesheet(closer), parseStylesheet(tooClose)];

    // Assert
    expect(kept.systems.systemSpacing).toBe(-8);
    expect(clamped.systems.systemSpacing).toBe(STYLESHEET_LIMITS.systemSpacing.min);
    expect(STYLESHEET_LIMITS.systemSpacing.min).toBe(-12);
  });

  it('cuts long font names and labels and strips control characters', () => {
    // Arrange
    const raw = { texts: { chordName: { family: `Ge\u0000or\ngia${'x'.repeat(100)}` } }, notation: { labels: { letRing: `l.r.\u0007${'-'.repeat(40)}` } } };

    // Act
    const sheet = parseStylesheet(raw);

    // Assert
    expect(sheet.texts.chordName.family).toBe(`Georgia${'x'.repeat(57)}`);
    expect(sheet.notation.labels.letRing).toBe(`l.r.${'-'.repeat(12)}`);
  });

  it('does not read values from an object prototype', () => {
    const raw = JSON.parse('{"__proto__":{"scale":1.5},"systems":{"__proto__":{"barsPerSystem":4}}}') as unknown;
    expect(parseStylesheet(raw)).toEqual(DEFAULT_STYLESHEET);
  });
});

describe('parseBarDesign', () => {
  it('keeps what is in range, in start order, one offset per start', () => {
    // Arrange
    const raw = { systemBars: 3, widthScale: 9, beatOffsets: [{ at: 20, offset: 4 }, { at: 10, offset: -500 }, { at: 20, offset: 1 }, { at: -1, offset: 2 }, 'x'] };

    // Act
    const design = parseBarDesign(raw);

    // Assert
    expect(design).toEqual({ systemBars: 3, widthScale: 4, beatOffsets: [{ at: 10, offset: -200 }, { at: 20, offset: 4 }] });
  });

  it('reads nothing usable as no design', () => {
    expect(parseBarDesign({ beatOffsets: [{ at: 5, offset: 0 }], widthScale: 1 })).toBeUndefined();
    expect(parseBarDesign(null)).toBeUndefined();
  });
});

describe('songStylesheetToJson / readSongStylesheet', () => {
  it('writes nothing for a song with the default stylesheet', () => {
    expect(songStylesheetToJson(twoBars())).toBeUndefined();
    expect(songStylesheetToJson(setStylesheet(twoBars(), DEFAULT_STYLESHEET))).toBeUndefined();
  });

  it('reads back the stylesheet it wrote', () => {
    // Arrange
    const song = setStylesheet(twoBars(), LARGER);

    // Act
    const read = readSongStylesheet(twoBars(), songStylesheetToJson(song) ?? '');

    // Assert
    expect(read.stylesheet).toEqual(LARGER);
  });

  it('leaves the song as it is for text that is not its JSON or of another version', () => {
    const song = twoBars();
    expect(readSongStylesheet(song, 'not json')).toBe(song);
    expect(readSongStylesheet(song, JSON.stringify({ version: SONG_STYLESHEET_VERSION + 1, stylesheet: LARGER }))).toBe(song);
    expect(readSongStylesheet(song, '[]')).toBe(song);
  });
});

describe('songDesignToJson / readSongDesign', () => {
  it('writes nothing for a song no bar of which was laid out by hand', () => {
    expect(songDesignToJson(twoBars())).toBeUndefined();
  });

  it('reads back every bar it wrote, on its bar', () => {
    // Arrange
    const song = setSystemBars(setBarWidthScale(setBeatOffset(twoBars(), 0, 960, 6.5), 1, 1.5), 1, 2);

    // Act
    const read = readSongDesign(twoBars(), songDesignToJson(song) ?? '');

    // Assert
    expect(read.measureHeaders[0]?.design).toEqual({ beatOffsets: [{ at: 960, offset: 6.5 }] });
    expect(read.measureHeaders[1]?.design).toEqual({ widthScale: 1.5, systemBars: 2 });
  });

  it('skips bars the song does not have and text of another version', () => {
    // Arrange
    const song = twoBars();
    const json = JSON.stringify({ version: SONG_DESIGN_VERSION, bars: [{ measureIndex: 9, widthScale: 2 }, { measureIndex: 'x' }, { measureIndex: 1, widthScale: 2 }] });

    // Act
    const read = readSongDesign(song, json);

    // Assert
    expect(read.measureHeaders[1]?.design).toEqual({ widthScale: 2 });
    expect(read.measureHeaders).toHaveLength(2);
    expect(readSongDesign(song, JSON.stringify({ version: 99, bars: [] }))).toBe(song);
  });
});

describe('the stylesheet and Design Mode layout in files', () => {
  const designed = (): Song => setBeatOffset(setSystemBars(setStylesheet(twoBars(), LARGER), 1, 1), 0, 0, -3);

  it('a .gp file keeps them', () => {
    // Act
    const read = readSong(writeSong(designed(), 'gp'));

    // Assert
    expect(read.stylesheet).toEqual(LARGER);
    expect(read.measureHeaders[0]?.design).toEqual({ beatOffsets: [{ at: 0, offset: -3 }] });
    expect(read.measureHeaders[1]?.design).toEqual({ systemBars: 1 });
  });

  it('a .gp file of a song without them has neither', () => {
    const read = readSong(writeSong(twoBars(), 'gp'));
    expect(read.stylesheet).toBeUndefined();
    expect(read.measureHeaders.every((header) => header.design === undefined)).toBe(true);
  });

  it.each(['gp5', 'gp4', 'gp3'] as const)('a %s file has no place for them', (format) => {
    const read = readSong(writeSong(designed(), format));
    expect(read.stylesheet).toBeUndefined();
    expect(read.measureHeaders.every((header) => header.design === undefined)).toBe(true);
  });
});
