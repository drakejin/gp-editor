import {
  DEFAULT_STYLESHEET,
  type Song,
  type Stylesheet,
  readSong,
  setBarWidthScale,
  setBeatOffset,
  setStylesheet,
  setSystemBars,
} from '@gp-editor/core';
import { buildPdfDocument, pdfPageCount } from '../src/export/pdf-document';
import { engraveTitleBlock } from '../src/export/title-block';
import { layoutMeasure } from '../src/lib/layout';
import { DEFAULT_CHORD_DISPLAY } from '../src/score/chords';
import { engraveRow } from '../src/score/row';
import { SYSTEM, layoutScore, namesColumnWidth } from '../src/score/score-layout';
import { engraveSystemStaff, staffDecor } from '../src/score/system-staff';
import { readFixture } from '../test-support/fixtures';
import { PALETTE } from '../test-support/score-helpers';
import { beat, header, makeSong, note, toTux, withTrack } from '../test-support/songs';

const WIDTH = 1000;
const QUARTER_TICKS = 960;

/** `count` bars of four quarter notes. */
function songOfBars(count: number): Song {
  const bars = Array.from({ length: count }, (_, i) =>
    Array.from({ length: 4 }, (__, b) => beat(toTux(header(i + 1).start) + b * QUARTER_TICKS, [note((b % 6) + 1, (i + b) % 5)])),
  );
  return makeSong(bars);
}

function styled(song: Song, change: (sheet: Stylesheet) => Stylesheet): Song {
  return setStylesheet(song, change(DEFAULT_STYLESHEET));
}

const systems = (sheet: Partial<Stylesheet['systems']>) => (base: Stylesheet): Stylesheet => ({ ...base, systems: { ...base.systems, ...sheet } });

/** Every system's rows, engraved as the screen does. */
function engraveAll(song: Song, trackIndexes: readonly number[]): string {
  const layout = layoutScore(song, trackIndexes.map((trackIndex) => ({ trackIndex, mode: 'notationAndTab' as const })), DEFAULT_CHORD_DISPLAY, WIDTH);
  return JSON.stringify(layout.systems.flatMap((system, systemIndex) => layout.staves.map((staff, staffIndex) => {
    const context = { song, trackIndex: staff.trackIndex, row: system.rows[staffIndex]!, headerWidth: layout.clefWidth, mode: staff.mode, geometry: staff.geometry, palette: PALETTE, markLanes: staff.markLanes, hasHeading: staff.hasHeading };
    const decor = staffDecor(song, layout, systemIndex, staffIndex);
    return decor === undefined ? engraveRow(context) : engraveSystemStaff(context, decor);
  })));
}

describe('a song with the default stylesheet', () => {
  it.each([['guitarpro5', 'canon.gp5'], ['guitarpro5', 'nightwish.gp5']])('engraves %s/%s exactly as a song without one', (folder, name) => {
    // Arrange: the default stylesheet as a copy, as a file would bring it
    const song = readSong(readFixture(folder, name));
    const copy: Song = { ...song, stylesheet: JSON.parse(JSON.stringify(DEFAULT_STYLESHEET)) as Stylesheet };
    const tracks = song.tracks.slice(0, 3).map((_, index) => index);

    // Act / Assert
    expect(engraveAll(copy, [0])).toBe(engraveAll(song, [0]));
    expect(engraveAll(copy, tracks)).toBe(engraveAll(song, tracks));
    expect(JSON.stringify(buildPdfDocument(copy, 0, 'notationAndTab', { fileName: name }))).toBe(JSON.stringify(buildPdfDocument(song, 0, 'notationAndTab', { fileName: name })));
    expect(engraveTitleBlock(copy, 0, name, 500, PALETTE)).toEqual(engraveTitleBlock(song, 0, name, 500, PALETTE));
  });
});

describe('Page & Score: note spacing', () => {
  it('spreads the beats of a bar wider', () => {
    // Arrange
    const song = songOfBars(1);

    // Act
    const plain = layoutMeasure(song, 0, 0);
    const wide = layoutMeasure(styled(song, (sheet) => ({ ...sheet, noteSpacing: 2 })), 0, 0);

    // Assert
    const gap = (beats: typeof plain.beats) => (beats[1]?.x ?? 0) - (beats[0]?.x ?? 0);
    expect(gap(wide.beats)).toBeCloseTo(gap(plain.beats) * 2);
    expect(wide.width).toBeGreaterThan(plain.width);
  });
});

describe('Systems & Staves', () => {
  const two = withTrack(songOfBars(8), []);

  it('adds the space between systems under the last staff', () => {
    // Act
    const single = layoutScore(styled(songOfBars(4), systems({ systemSpacing: 20 })), [{ trackIndex: 0, mode: 'tab' }], DEFAULT_CHORD_DISPLAY, WIDTH);
    const plain = layoutScore(songOfBars(4), [{ trackIndex: 0, mode: 'tab' }], DEFAULT_CHORD_DISPLAY, WIDTH);
    const specs = [{ trackIndex: 0, mode: 'tab' as const }, { trackIndex: 1, mode: 'tab' as const }];
    const multi = layoutScore(styled(two, systems({ systemSpacing: 20 })), specs, DEFAULT_CHORD_DISPLAY, WIDTH);

    // Assert
    expect(single.systems[0]?.height).toBe((plain.systems[0]?.height ?? 0) + 20);
    expect(multi.staves[1]?.height).toBe((multi.staves[1]?.geometry.height ?? 0) + SYSTEM.gap + 20);
    expect(multi.staves[0]?.height).toBe(multi.staves[0]?.geometry.height);
  });

  it('adds the space between tracks over the lower staves and between notation and tab', () => {
    // Arrange
    const specs = [{ trackIndex: 0, mode: 'notationAndTab' as const }, { trackIndex: 1, mode: 'notationAndTab' as const }];
    const plain = layoutScore(two, specs, DEFAULT_CHORD_DISPLAY, WIDTH);

    // Act
    const spaced = layoutScore(styled(two, systems({ trackSpacing: 15, staffSpacing: 12 })), specs, DEFAULT_CHORD_DISPLAY, WIDTH);

    // Assert
    const lower = (layout: typeof plain) => layout.staves[1]!.geometry;
    expect(lower(spaced).notationTop).toBe((lower(plain).notationTop ?? 0) + 15);
    expect((lower(spaced).tabTop ?? 0) - (lower(spaced).notationTop ?? 0)).toBe((lower(plain).tabTop ?? 0) - (lower(plain).notationTop ?? 0) + 12);
  });

  it('puts at most the bars per system in a system', () => {
    const layout = layoutScore(styled(songOfBars(7), systems({ barsPerSystem: 3 })), [{ trackIndex: 0, mode: 'tab' }], DEFAULT_CHORD_DISPLAY, 4000);
    expect(layout.systems.map((system) => system.rows[0]?.measures.length)).toEqual([3, 3, 1]);
  });

  it('labels the systems with the track names the stylesheet asks for, or none', () => {
    // Arrange
    const named = withTrack(songOfBars(2), [], { name: 'Distortion Guitar' });
    const hidden = styled(named, systems({ firstSystemNames: 'short', otherSystemNames: 'hidden' }));

    // Act
    const layout = layoutScore(hidden, [{ trackIndex: 0, mode: 'tab' }, { trackIndex: 1, mode: 'tab' }], DEFAULT_CHORD_DISPLAY, 300);

    // Assert
    expect(staffDecor(hidden, layout, 0, 1)?.label).toBe('Dist. Guit.');
    expect(staffDecor(hidden, layout, 1, 1)?.label).toBe('');
    expect(namesColumnWidth(hidden, layout.staves, false)).toBe(SYSTEM.margin + SYSTEM.nameGap + SYSTEM.bracketGap);
  });

  it('keeps each track’s bar lines to its own staves when they do not run across the system', () => {
    // Arrange
    const specs = [{ trackIndex: 0, mode: 'tab' as const }, { trackIndex: 1, mode: 'tab' as const }];
    const lines = (song: Song) => {
      const layout = layoutScore(song, specs, DEFAULT_CHORD_DISPLAY, WIDTH);
      const context = { song, trackIndex: 0, row: layout.systems[0]!.rows[0]!, headerWidth: layout.clefWidth, mode: 'tab' as const, geometry: layout.staves[0]!.geometry, palette: PALETTE };
      return engraveSystemStaff(context, staffDecor(song, layout, 0, 0)!).filter((command) => command.kind === 'line').length;
    };

    // Act / Assert
    expect(lines(styled(two, systems({ showsBarlinesAcrossSystem: false })))).toBeLessThan(lines(two));
  });
});

describe('the printed page follows how dense the stylesheet makes the score', () => {
  const canon = readSong(readFixture('guitarpro5', 'canon.gp5'));
  const pages = (song: Song) => pdfPageCount(song, 0, 'notationAndTab', { paper: 'a4' });

  it('prints fewer pages at a smaller scale', () => {
    expect(pages(styled(canon, (sheet) => ({ ...sheet, scale: 0.7 })))).toBeLessThan(pages(canon));
  });

  it('brings the systems closer with less room between them than the app’s own, on the screen and the page', () => {
    // Arrange
    const closer = styled(canon, systems({ systemSpacing: -12 }));

    // Act
    const [before, after] = [canon, closer].map((song) => layoutScore(song, [{ trackIndex: 0, mode: 'notationAndTab' }], DEFAULT_CHORD_DISPLAY, WIDTH));

    // Assert
    after?.systems.forEach((system, i) => expect(system.height).toBe((before?.systems[i]?.height ?? 0) - 12));
    expect(pages(closer)).toBeLessThan(pages(canon));
  });
});

describe('Texts & Styles: lyrics and dynamics bands', () => {
  const sung: Song = { ...songOfBars(2), tracks: songOfBars(2).tracks.map((track) => ({ ...track, lyrics: { from: 1, text: 'la la la la' } })) };

  it('puts the lyrics above the staves, or leaves them out', () => {
    // Act
    const above = layoutScore(styled(sung, (sheet) => ({ ...sheet, lyrics: 'above' })), [{ trackIndex: 0, mode: 'notationAndTab' }], DEFAULT_CHORD_DISPLAY, WIDTH).staves[0]!.geometry;
    const hidden = layoutScore(styled(sung, (sheet) => ({ ...sheet, lyrics: 'hidden' })), [{ trackIndex: 0, mode: 'notationAndTab' }], DEFAULT_CHORD_DISPLAY, WIDTH).staves[0]!.geometry;

    // Assert
    expect(above.lyricsY).toBeLessThan(above.notationTop ?? 0);
    expect(hidden.lyricsY).toBeUndefined();
  });
});

describe('Design Mode in the layout', () => {
  const tab = [{ trackIndex: 0, mode: 'tab' as const }];

  it('starts a system where a bar starts one, holding the bars it was given even when they do not fit', () => {
    // Arrange
    const song = setSystemBars(setSystemBars(songOfBars(9), 2, 6), 8, 0);

    // Act
    const layout = layoutScore(song, tab, DEFAULT_CHORD_DISPLAY, 500);

    // Assert
    const firsts = layout.systems.map((system) => system.rows[0]?.measures[0]?.measureIndex);
    const sixBars = layout.systems.find((system) => system.rows[0]?.measures[0]?.measureIndex === 2)?.rows[0]?.measures ?? [];
    expect(firsts).toContain(2);
    expect(firsts).toContain(8);
    expect(sixBars.map((measure) => measure.measureIndex)).toEqual([2, 3, 4, 5, 6, 7]);
    expect(sixBars.reduce((sum, measure) => sum + measure.width, 0)).toBeLessThanOrEqual(500);
  });

  it('gives a wider bar its share of a full system', () => {
    // Arrange: the first of two systems is stretched to the width
    const song = songOfBars(12);

    // Act
    const plain = layoutScore(song, tab, DEFAULT_CHORD_DISPLAY, WIDTH).systems[0]!.rows[0]!.measures;
    const wider = layoutScore(setBarWidthScale(song, 1, 2), tab, DEFAULT_CHORD_DISPLAY, WIDTH).systems[0]!.rows[0]!.measures;

    // Assert
    expect(wider[1]!.width / wider[0]!.width).toBeCloseTo((plain[1]!.width / plain[0]!.width) * 2);
    expect(wider.reduce((sum, measure) => sum + measure.width, 0)).toBeCloseTo(plain.reduce((sum, measure) => sum + measure.width, 0));
  });

  it('draws a wider bar wider in the last system too, where the bars are not stretched', () => {
    const song = songOfBars(2);
    const plain = layoutScore(song, tab, DEFAULT_CHORD_DISPLAY, WIDTH).systems[0]!.rows[0]!.measures;
    const wider = layoutScore(setBarWidthScale(song, 1, 1.5), tab, DEFAULT_CHORD_DISPLAY, WIDTH).systems[0]!.rows[0]!.measures;
    expect(wider[1]!.width).toBeCloseTo(plain[1]!.width * 1.5);
    expect(wider[0]!.width).toBe(plain[0]!.width);
  });

  it('moves the beats Design Mode moved, inside their bar', () => {
    // Arrange
    const song = songOfBars(2);
    const second = song.tracks[0]!.measures[0]!.beats[1]!;
    const at = second.start - song.measureHeaders[0]!.start;

    // Act
    const plain = layoutScore(song, tab, DEFAULT_CHORD_DISPLAY, WIDTH).systems[0]!.rows[0]!.measures[0]!;
    const moved = layoutScore(setBeatOffset(song, 0, at, 9), tab, DEFAULT_CHORD_DISPLAY, WIDTH).systems[0]!.rows[0]!.measures[0]!;
    const far = layoutScore(setBeatOffset(song, 0, at, 200), tab, DEFAULT_CHORD_DISPLAY, WIDTH).systems[0]!.rows[0]!.measures[0]!;

    // Assert
    expect(moved.beats[1]!.x).toBeCloseTo(plain.beats[1]!.x + 9);
    expect(moved.beats[0]!.x).toBe(plain.beats[0]!.x);
    expect(far.beats[1]!.x).toBeLessThanOrEqual(far.width);
  });
});
