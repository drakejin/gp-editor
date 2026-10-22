import { type Measure, QUARTER, type Song, readSong } from '@gp-editor/core';
import { layoutMeasure } from '../src/lib/layout';
import { type DrawCommand, SMUFL } from '../src/score/draw';
import { ROW } from '../src/score/geometry';
import { TAB_MARKS } from '../src/score/symbols/tab-geometry';
import { tabMarkLanes } from '../src/score/symbols/tab-marks';
import { engraveTabMeasure, engraveTabRowHeader, stringY } from '../src/score/tab';
import { listFixtures, readFixture } from '../test-support/fixtures';
import { beat, header, makeSong, note } from '../test-support/songs';
import { PALETTE, allFinite, texts, textValues } from '../test-support/score-helpers';

const EIGHTH = { ...QUARTER, value: 8 as const };

function context(overrides: Partial<Parameters<typeof engraveTabMeasure>[0]> = {}) {
  const song = makeSong(
    [[beat(960, [note(1, 3), note(6, 0, { deadNote: true, palmMute: true })], EIGHTH), beat(1440, [note(2, 5)], EIGHTH), beat(1920, [])]],
    [header(1, { repeatOpen: true, repeatClose: 2 })],
  );
  const track = song.tracks[0]!;
  return {
    track,
    header: song.measureHeaders[0]!,
    measure: track.measures[0]!,
    layout: layoutMeasure(song, 0, 0),
    top: 60,
    marksY: 44,
    showRhythm: true,
    palette: PALETTE,
    ...overrides,
  };
}

describe('engraveTabMeasure', () => {
  it('draws strings, frets, marks, time signature and repeat dots', () => {
    const commands = engraveTabMeasure(context());
    expect(commands.filter((c) => c.kind === 'line' && c.y1 === c.y2 && c.y1 >= 60)).toHaveLength(6);
    expect(textValues(commands)).toEqual(expect.arrayContaining(['3', 'x', '5', 'P.M.', '4']));
    expect(commands.filter((c) => c.kind === 'circle')).toHaveLength(4);
    expect(allFinite(commands)).toBe(true);
  });

  it('puts fret numbers on their string lines', () => {
    const five = texts(engraveTabMeasure(context())).find((t) => t.text === '5');
    expect(five?.y).toBe(stringY(60, 2));
  });

  it('draws a SMuFL rest, stems and a beam only when rhythm is shown', () => {
    const withRhythm = engraveTabMeasure(context());
    expect(textValues(withRhythm)).toContain(SMUFL.restQuarter);
    expect(withRhythm.some((c) => c.kind === 'rect' && c.height === 2)).toBe(true);
    const without = engraveTabMeasure(context({ showRhythm: false }));
    expect(textValues(without)).not.toContain(SMUFL.restQuarter);
  });

  it('draws the cursor box, also on an empty string, and the playing column', () => {
    const onEmpty = engraveTabMeasure(context({ cursor: { beatIndex: 1, string: 4 } }));
    const box = onEmpty.find((c) => c.kind === 'rect' && c.color === PALETTE.selection);
    expect(box).toBeDefined();
    const playing = engraveTabMeasure(context({ playingBeatIndex: 0 }));
    expect(playing[0]).toMatchObject({ kind: 'rect', color: `${PALETTE.accent}33` });
  });
});

describe('engraveTabRowHeader', () => {
  it('draws the six- or four-string TAB clef', () => {
    expect(textValues(engraveTabRowHeader(context().track, 60, PALETTE))).toEqual([SMUFL.sixStringTabClef]);
    const bass = { ...context().track, strings: context().track.strings.slice(0, 4) };
    expect(textValues(engraveTabRowHeader(bass, 60, PALETTE))).toEqual([SMUFL.fourStringTabClef]);
  });
});

describe('tab fixture sweep', () => {
  const FOLDERS = ['guitarpro3', 'guitarpro5', 'guitarpro7', 'guitarpro8'];
  /** Labels and arcs may reach a little past the measure and the marks row. */
  const MARGIN_X = 24;
  const MARGIN_Y = 16;
  const fixtures = FOLDERS.flatMap((folder) => listFixtures(folder).map((file) => ({ name: `${folder}/${file}`, song: readSong(readFixture(folder, file)) })));

  function bandProblems(name: string, song: Song, trackIndex: number): { problems: string[]; count: number } {
    const track = song.tracks[trackIndex]!;
    let count = 0;
    const problems = track.measures.flatMap((measure, measureIndex) => {
      const layout = layoutMeasure(song, trackIndex, measureIndex);
      const previousMeasure = track.measures[measureIndex - 1];
      const nextMeasure = track.measures[measureIndex + 1];
      const markLanes = tabMarkLanes([previousMeasure, measure, nextMeasure].filter((m): m is Measure => m !== undefined));
      const marksY = -ROW.marks / 2;
      const commands = engraveTabMeasure({
        track, header: song.measureHeaders[measureIndex]!, measure, layout, previousMeasure, nextMeasure, markLanes,
        top: 0, marksY, showRhythm: true, palette: PALETTE, playingBeatIndex: 0, cursor: { beatIndex: 0, string: 1 },
      });
      count += commands.length;
      const top = marksY - ROW.marks / 2 - Math.max(0, markLanes.length - 1) * TAB_MARKS.laneHeight - MARGIN_Y;
      const bottom = stringY(0, track.strings.length) + ROW.rhythm + MARGIN_Y;
      const outside = commands.filter((c) => !allFinite([c]) || pointsOf(c).some(([x, y]) => x < -MARGIN_X || x > layout.width + MARGIN_X || y < top || y > bottom));
      return outside.map((c) => `${name} track ${trackIndex} measure ${measureIndex}: ${JSON.stringify(c)}`);
    });
    return { problems, count };
  }

  it('engraves every measure of every track with finite coordinates inside the tab band and a modest command count', () => {
    // Arrange
    const results = fixtures.flatMap(({ name, song }) => song.tracks.map((_, trackIndex) => bandProblems(name, song, trackIndex)));

    // Act
    const problems = results.flatMap((result) => result.problems);
    const measures = fixtures.reduce((sum, { song }) => sum + song.tracks.length * song.measureHeaders.length, 0);
    const commands = results.reduce((sum, result) => sum + result.count, 0);

    // Assert
    expect(fixtures.length).toBeGreaterThan(100);
    expect(problems.slice(0, 5)).toEqual([]);
    expect(commands / measures).toBeLessThan(40);
  });
});

/** Every coordinate of a command as [x, y] pairs. */
function pointsOf(command: DrawCommand): Array<[number, number]> {
  switch (command.kind) {
    case 'line':
      return [[command.x1, command.y1], [command.x2, command.y2]];
    case 'curve':
      return [[command.x1, command.y1], [command.cx, command.cy], [command.x2, command.y2]];
    case 'polygon':
      return command.points.flatMap((value, i, all) => (i % 2 === 0 ? [[value, all[i + 1] ?? NaN] as [number, number]] : []));
    case 'rect':
      return [[command.x, command.y], [command.x + command.width, command.y + command.height]];
    case 'circle':
    case 'text':
      return [[command.x, command.y]];
  }
}
