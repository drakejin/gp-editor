import { NO_STROKE, QUARTER } from '@gp-editor/core';
import type { Beat, Measure, Song, Track } from '@gp-editor/core';
import type { DrawCommand, LineCommand, RectCommand } from '../src/score/draw';
import {
  BAR_MAP,
  barMapCellX,
  barMapHeight,
  barMapWidth,
  engraveBarMap,
  hitTestBarMap,
  measureHasNotes,
  scrollOffsetToShowBar,
  sectionLetter,
  visibleTrackColor,
} from '../src/score/bar-map';
import { rgbHex } from '../src/score/heading';
import { PALETTE, allFinite, texts, textValues } from '../test-support/score-helpers';
import { beat, header, makeSong, note, toTux } from '../test-support/songs';

const PITCH = BAR_MAP.cellWidth + BAR_MAP.gap;
const BLUE = { r: 0, g: 0, b: 255 };

/** A beat whose only voice is a rest. */
function rest(start: number): Beat {
  return { start, voices: [{ duration: QUARTER, notes: [], isEmpty: false, direction: 'none' }], stroke: NO_STROKE, pickStroke: 'none' };
}

/** A beat whose only voice holds nothing at all (not even a rest). */
function emptyVoice(start: number): Beat {
  return { start, voices: [{ duration: QUARTER, notes: [note(1, 3)], isEmpty: true, direction: 'none' }], stroke: NO_STROKE, pickStroke: 'none' };
}

/**
 * Two tracks, `barCount` bars (at least 4). Track 1 (red): notes in bars 1 and 3, a rest in bar 2, nothing after.
 * Track 2 (blue): notes in bar 2 only, rests elsewhere.
 */
function twoTrackSong(markers: Record<number, string> = {}, barCount = 4): Song {
  const headers = Array.from({ length: barCount }, (_, i) => {
    const title = markers[i + 1];
    return header(i + 1, title === undefined ? {} : { marker: { title, color: { r: 255, g: 0, b: 0 } } });
  });
  const start = (i: number) => headers[i]!.start;
  const firstBeats = headers.map((_, i): Beat[] => (i === 0 ? [beat(toTux(start(0)), [note(1, 3)])] : i === 1 ? [rest(start(1))] : i === 2 ? [beat(toTux(start(2)), [note(2, 5)])] : []));
  const song = makeSong(firstBeats, headers);
  const first = song.tracks[0]!;
  const second: Track = {
    ...first,
    number: 2,
    name: 'Bass',
    color: BLUE,
    measures: first.measures.map((measure, i): Measure => ({ ...measure, beats: i === 1 ? [beat(toTux(start(1)), [note(4, 2)])] : [rest(start(i))] })),
  };
  return { ...song, tracks: [first, second] };
}

function rects(commands: readonly DrawCommand[]): RectCommand[] {
  return commands.filter((command): command is RectCommand => command.kind === 'rect');
}

function lines(commands: readonly DrawCommand[]): LineCommand[] {
  return commands.filter((command): command is LineCommand => command.kind === 'line');
}

/** The cell rect of one track and bar. */
function cellAt(commands: readonly DrawCommand[], trackIndex: number, measureIndex: number): RectCommand | undefined {
  const top = BAR_MAP.headerHeight + trackIndex * BAR_MAP.rowHeight + (BAR_MAP.rowHeight - BAR_MAP.cellHeight) / 2;
  return rects(commands).find(
    (rect) => rect.x === barMapCellX(measureIndex) && rect.y === top && rect.width === BAR_MAP.cellWidth && rect.height === BAR_MAP.cellHeight,
  );
}

function engrave(song: Song, overrides: { selectedTrackIndex?: number; cursorMeasureIndex?: number; playingMeasureIndex?: number } = {}) {
  return engraveBarMap({ song, selectedTrackIndex: 0, palette: PALETTE, ...overrides });
}

describe('measureHasNotes', () => {
  it('is true when any voice of any beat holds a note', () => {
    expect(measureHasNotes(twoTrackSong().tracks[0]!.measures[0]!)).toBe(true);
  });

  it('is false for a bar of rests, a bar without beats and a voice marked empty', () => {
    // Arrange
    const song = twoTrackSong();
    const measure = song.tracks[0]!.measures[0]!;

    // Act / Assert
    expect(measureHasNotes(song.tracks[0]!.measures[1]!)).toBe(false);
    expect(measureHasNotes(song.tracks[0]!.measures[3]!)).toBe(false);
    expect(measureHasNotes({ ...measure, beats: [emptyVoice(0)] })).toBe(false);
  });

  it('finds a note in the second voice', () => {
    // Arrange
    const measure = twoTrackSong().tracks[0]!.measures[1]!;
    const [first] = measure.beats;
    const twoVoices: Beat = { ...first!, voices: [...first!.voices, { duration: QUARTER, notes: [note(3, 0)], isEmpty: false, direction: 'down' }] };

    // Act / Assert
    expect(measureHasNotes({ ...measure, beats: [twoVoices] })).toBe(true);
  });
});

describe('bar map size', () => {
  it('is one cell column per bar between the paddings, and one row per track between the header and the sections', () => {
    // Arrange
    const song = twoTrackSong();

    // Act / Assert
    expect(barMapWidth(song)).toBe(BAR_MAP.padLeft + 4 * PITCH - BAR_MAP.gap + BAR_MAP.padRight);
    expect(barMapHeight(song)).toBe(BAR_MAP.headerHeight + 2 * BAR_MAP.rowHeight + BAR_MAP.sectionsHeight);
  });

  it('keeps the paddings for a song without bars', () => {
    const song = { ...twoTrackSong(), measureHeaders: [] };
    expect(barMapWidth(song)).toBe(BAR_MAP.padLeft + BAR_MAP.padRight);
  });
});

describe('engraveBarMap cells', () => {
  it('fills a bar with notes in the track’s colour and a bar of rests in the raised chrome colour', () => {
    // Act
    const commands = engrave(twoTrackSong());

    // Assert
    expect(cellAt(commands, 0, 0)?.color).toBe(rgbHex({ r: 255, g: 0, b: 0 }));
    expect(cellAt(commands, 0, 1)?.color).toBe(PALETTE.chromeRaised);
    expect(cellAt(commands, 0, 2)?.color).toBe('#ff0000');
    expect(cellAt(commands, 0, 3)?.color).toBe(PALETTE.chromeRaised);
    expect(cellAt(commands, 1, 0)?.color).toBe(PALETTE.chromeRaised);
    expect(cellAt(commands, 1, 1)?.color).toBe('#0000ff');
    expect(allFinite(commands)).toBe(true);
  });

  it('brightens a very dark track colour, keeping its hue, so its bars stand apart from empty ones', () => {
    // Arrange: a dark maroon, and black
    const maroon = { r: 0x4a, g: 0x1a, b: 0x2a };

    // Act
    const lifted = visibleTrackColor(maroon);

    // Assert: scaled up to the minimum brightness, channels in the same proportions
    const [r, g, b] = [1, 3, 5].map((i) => parseInt(lifted.slice(i, i + 2), 16));
    expect(Math.max(r!, g!, b!) / 255).toBeCloseTo(BAR_MAP.minCellBrightness, 2);
    expect(r! / b!).toBeCloseTo(0x4a / 0x2a, 1);
    expect(visibleTrackColor({ r: 0, g: 0, b: 0 })).toBe(rgbHex({ r: 153, g: 153, b: 153 }));
    expect(visibleTrackColor({ r: 255, g: 0, b: 0 })).toBe('#ff0000');
  });

  it('fills a dark track’s bars with its brightened colour', () => {
    // Arrange
    const song = twoTrackSong();
    const dark = { ...song, tracks: [{ ...song.tracks[0]!, color: { r: 0x30, g: 0x10, b: 0x10 } }, song.tracks[1]!] };

    // Act / Assert
    expect(cellAt(engrave(dark), 0, 0)?.color).toBe(visibleTrackColor({ r: 0x30, g: 0x10, b: 0x10 }));
  });

  it('draws one cell per track and bar', () => {
    const commands = engrave(twoTrackSong());
    const cells = rects(commands).filter((rect) => rect.width === BAR_MAP.cellWidth && rect.height === BAR_MAP.cellHeight);
    expect(cells).toHaveLength(8);
  });

  it('tints the selected track’s row across the whole map', () => {
    // Act
    const commands = engrave(twoTrackSong(), { selectedTrackIndex: 1 });

    // Assert
    const top = BAR_MAP.headerHeight + BAR_MAP.rowHeight;
    const band = rects(commands).find((rect) => rect.y === top && rect.height === BAR_MAP.rowHeight);
    expect(band).toEqual(expect.objectContaining({ x: 0, width: barMapWidth(twoTrackSong()) }));
    expect(band?.color.startsWith(PALETTE.chromeAccent)).toBe(true);
  });
});

describe('engraveBarMap cursor', () => {
  it('marks the cursor’s bar with a dark square inside the selected track’s cell', () => {
    // Act
    const commands = engrave(twoTrackSong(), { selectedTrackIndex: 1, cursorMeasureIndex: 2 });

    // Assert
    const cell = cellAt(commands, 1, 2)!;
    const marker = rects(commands).filter((rect) => rect.color === PALETTE.chromeBorder && rect.width === BAR_MAP.cursorSize);
    expect(marker).toHaveLength(1);
    expect(marker[0]!.x).toBeGreaterThan(cell.x);
    expect(marker[0]!.x + marker[0]!.width).toBeLessThan(cell.x + cell.width);
    expect(marker[0]!.y).toBeGreaterThan(cell.y);
    expect(marker[0]!.y + marker[0]!.height).toBeLessThan(cell.y + cell.height);
    expect(commands.indexOf(marker[0]!)).toBeGreaterThan(commands.indexOf(cell));
  });

  it('draws no marker without a cursor or for a bar the song does not have', () => {
    const marker = (cursorMeasureIndex?: number) =>
      rects(engrave(twoTrackSong(), { cursorMeasureIndex })).filter((rect) => rect.width === BAR_MAP.cursorSize);
    expect(marker(undefined)).toEqual([]);
    expect(marker(9)).toEqual([]);
  });
});

describe('engraveBarMap header', () => {
  it('numbers bar 1 and every 4th bar', () => {
    // Arrange: 17 bars
    const song = makeSong(Array.from({ length: 17 }, () => []));

    // Act
    const numbers = textValues(engrave(song));

    // Assert
    expect(numbers).toEqual(['1', '4', '8', '12', '16']);
  });

  it('places each number over its bar’s column in the header', () => {
    // Act
    const four = texts(engrave(makeSong(Array.from({ length: 5 }, () => [])))).find((text) => text.text === '4');

    // Assert
    expect(four?.x).toBeGreaterThanOrEqual(barMapCellX(3));
    expect(four?.x).toBeLessThan(barMapCellX(4));
    expect(four?.y).toBeLessThan(BAR_MAP.headerHeight);
  });
});

describe('engraveBarMap playing bar', () => {
  it('highlights the playing bar’s column with the accent colour', () => {
    // Act
    const commands = engrave(twoTrackSong(), { playingMeasureIndex: 1 });

    // Assert
    const column = rects(commands).find((rect) => rect.color.startsWith(PALETTE.chromeAccent) && rect.x <= barMapCellX(1) && rect.width < 2 * PITCH);
    expect(column).toBeDefined();
    expect(column!.x + column!.width).toBeGreaterThanOrEqual(barMapCellX(1) + BAR_MAP.cellWidth);
    expect(column!.height).toBeGreaterThanOrEqual(2 * BAR_MAP.rowHeight);
    const edges = lines(commands).filter((line) => line.color === PALETTE.chromeAccent);
    expect(edges).toHaveLength(2);
  });

  it('draws no playing column when nothing plays', () => {
    const commands = engrave(twoTrackSong());
    expect(lines(commands).filter((line) => line.color === PALETTE.chromeAccent)).toEqual([]);
  });
});

describe('engraveBarMap sections', () => {
  it('letters each marker A, B, C … in a box at its first bar, with its title beside it', () => {
    // Act
    const commands = engrave(twoTrackSong({ 1: 'Intro', 6: 'Verse 1' }, 12));

    // Assert
    const sectionsTop = BAR_MAP.headerHeight + 2 * BAR_MAP.rowHeight;
    const sectionTexts = texts(commands).filter((text) => text.y > sectionsTop);
    expect(sectionTexts.map((text) => text.text)).toEqual(['A', 'Intro', 'B', 'Verse 1']);
    const box = rects(commands).find((rect) => rect.y > sectionsTop && rect.x === barMapCellX(5));
    expect(box).toBeDefined();
    const letterB = sectionTexts.find((text) => text.text === 'B');
    expect(letterB!.x).toBeGreaterThan(box!.x);
    expect(letterB!.x).toBeLessThan(box!.x + box!.width);
  });

  it('cuts a title that would run into the next section', () => {
    // Act: two sections three bars apart
    const commands = engrave(twoTrackSong({ 1: 'A very long introduction', 4: 'Verse' }));

    // Assert
    const title = texts(commands).find((text) => text.text.endsWith('…'));
    expect(title).toBeDefined();
    expect('A very long introduction'.startsWith(title!.text.slice(0, -1))).toBe(true);
    expect(title!.x + title!.text.length * BAR_MAP.titleCharWidth).toBeLessThanOrEqual(barMapCellX(3));
  });

  it('leaves the title out when the next section starts on the next bar', () => {
    const titles = textValues(engrave(twoTrackSong({ 1: 'Intro', 2: 'Verse' })));
    expect(titles).toEqual(['1', '4', 'A', 'B', 'Verse']);
  });

  it('keeps a short title whole when the next section is far away', () => {
    const titles = textValues(engrave(twoTrackSong({ 1: 'Intro' })));
    expect(titles).toContain('Intro');
  });

  it('goes on past Z with numbered letters', () => {
    expect([0, 1, 25, 26, 27].map(sectionLetter)).toEqual(['A', 'B', 'Z', 'A2', 'B2']);
  });
});

describe('hitTestBarMap', () => {
  const song = twoTrackSong({ 1: 'Intro', 3: 'Verse' });
  const cellCentre = (measureIndex: number) => barMapCellX(measureIndex) + BAR_MAP.cellWidth / 2;
  const rowCentre = (trackIndex: number) => BAR_MAP.headerHeight + (trackIndex + 0.5) * BAR_MAP.rowHeight;
  const sectionsY = BAR_MAP.headerHeight + 2 * BAR_MAP.rowHeight + BAR_MAP.sectionsHeight / 2;

  it('finds the track and bar of a cell', () => {
    expect(hitTestBarMap(song, cellCentre(2), rowCentre(1))).toEqual({ trackIndex: 1, measureIndex: 2 });
    expect(hitTestBarMap(song, cellCentre(0), rowCentre(0))).toEqual({ trackIndex: 0, measureIndex: 0 });
  });

  it('finds only the bar on the bar numbers', () => {
    expect(hitTestBarMap(song, cellCentre(3), BAR_MAP.headerHeight / 2)).toEqual({ measureIndex: 3 });
  });

  it('jumps to the first bar of the section clicked in the sections row', () => {
    expect(hitTestBarMap(song, cellCentre(1), sectionsY)).toEqual({ measureIndex: 0 });
    expect(hitTestBarMap(song, cellCentre(3), sectionsY)).toEqual({ measureIndex: 2 });
  });

  it('finds the bar itself in the sections row before the first section', () => {
    const later = twoTrackSong({ 3: 'Verse' });
    expect(hitTestBarMap(later, cellCentre(1), sectionsY)).toEqual({ measureIndex: 1 });
  });

  it('finds nothing left of the first bar, right of the last or below the sections', () => {
    expect(hitTestBarMap(song, BAR_MAP.padLeft - 1, rowCentre(0))).toBeUndefined();
    expect(hitTestBarMap(song, barMapCellX(4) + 1, rowCentre(0))).toBeUndefined();
    expect(hitTestBarMap(song, cellCentre(0), barMapHeight(song) + 1)).toBeUndefined();
    expect(hitTestBarMap(song, cellCentre(0), -1)).toBeUndefined();
  });
});

describe('scrollOffsetToShowBar', () => {
  const viewport = 10 * PITCH;

  it('leaves the scroll alone when the bar is in view', () => {
    expect(scrollOffsetToShowBar(5, 0, viewport)).toBeUndefined();
  });

  it('scrolls right to a bar past the right edge, keeping a margin after it', () => {
    // Act
    const offset = scrollOffsetToShowBar(30, 0, viewport);

    // Assert
    expect(offset).toBeDefined();
    expect(barMapCellX(30) + BAR_MAP.cellWidth).toBeLessThanOrEqual(offset! + viewport - BAR_MAP.scrollMargin + 0.001);
    expect(barMapCellX(30)).toBeGreaterThan(offset!);
  });

  it('scrolls left to a bar before the left edge, never past the start', () => {
    expect(scrollOffsetToShowBar(20, barMapCellX(25), viewport)).toBe(barMapCellX(20) - BAR_MAP.scrollMargin);
    expect(scrollOffsetToShowBar(0, barMapCellX(25), viewport)).toBe(0);
  });

  it('does nothing before the view has a width', () => {
    expect(scrollOffsetToShowBar(30, 0, 0)).toBeUndefined();
  });
});
