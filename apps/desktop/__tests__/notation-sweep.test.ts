import { type Song, readSong } from '@gp-editor/core';
import { layoutMeasure } from '../src/lib/layout';
import type { DrawCommand } from '../src/score/draw';
import {
  NOTATION,
  engraveNotationMeasure,
  engraveNotationRowHeader,
  notationBandHeight,
  notationRowHeaderWidth,
} from '../src/score/notation';
import type { Palette } from '../src/theme';
import { listFixtures, readFixture } from '../test-support/fixtures';

const FOLDERS = ['guitarpro3', 'guitarpro5', 'guitarpro7', 'guitarpro8'];
/** Ledger lines, ties and accidental columns may reach a little past the band. */
const MARGIN_X = 2 * NOTATION.space;
const MARGIN_Y = 2 * NOTATION.space;

const PALETTE: Palette = {
  background: '#ECEDEF',
  sidebar: '#F6F6F7',
  paper: '#FFFFFF',
  text: '#1D1D1F',
  muted: '#86868B',
  line: '#9A9AA0',
  accent: '#D4572A',
  accentText: '#FFFFFF',
  selection: '#FFD8C7',
  danger: '#C62828',
  border: '#D9D9DE',
};

interface Fixture {
  readonly name: string;
  readonly song: Song;
}

function readFixtures(): Fixture[] {
  return FOLDERS.flatMap(folder =>
    listFixtures(folder).map(file => ({
      name: `${folder}/${file}`,
      song: readSong(readFixture(folder, file)),
    })),
  );
}

/** Every coordinate of a command as [x, y] pairs. */
function points(command: DrawCommand): Array<[number, number]> {
  switch (command.kind) {
    case 'line':
      return [
        [command.x1, command.y1],
        [command.x2, command.y2],
      ];
    case 'curve':
      return [
        [command.x1, command.y1],
        [command.cx, command.cy],
        [command.x2, command.y2],
      ];
    case 'polygon':
      return command.points.flatMap((value, i, all) =>
        i % 2 === 0 ? [[value, all[i + 1] ?? NaN] as [number, number]] : [],
      );
    case 'rect':
      return [
        [command.x, command.y],
        [command.x + command.width, command.y + command.height],
      ];
    case 'circle':
    case 'text':
      return [[command.x, command.y]];
  }
}

function numbers(command: DrawCommand): number[] {
  return Object.values(command).flatMap(value =>
    typeof value === 'number'
      ? [value]
      : Array.isArray(value)
      ? (value as number[])
      : [],
  );
}

interface Problem {
  readonly where: string;
  readonly command: DrawCommand;
}

function problems(
  where: string,
  commands: readonly DrawCommand[],
  width: number,
): Problem[] {
  const bandTop = -NOTATION.above;
  const bandBottom = notationBandHeight() - NOTATION.above;
  return commands
    .filter(command => {
      const isFinite = numbers(command).every(Number.isFinite);
      const isInside = points(command).every(
        ([x, y]) =>
          x >= -MARGIN_X &&
          x <= width + MARGIN_X &&
          y >= bandTop - MARGIN_Y &&
          y <= bandBottom + MARGIN_Y,
      );
      return !isFinite || !isInside;
    })
    .map(command => ({ where, command }));
}

function engraveSong({ name, song }: Fixture): {
  problems: Problem[];
  count: number;
} {
  let count = 0;
  const found = song.tracks.flatMap((track, trackIndex) => {
    const first = track.measures[0];
    const header =
      first === undefined
        ? []
        : engraveNotationRowHeader(track, first, 0, PALETTE);
    const headerWidth = notationRowHeaderWidth(track, first?.keySignature ?? 0);
    return [
      ...problems(`${name} track ${trackIndex} header`, header, headerWidth),
      ...track.measures.flatMap((measure, measureIndex) => {
        const layout = layoutMeasure(song, trackIndex, measureIndex);
        const measureHeader = song.measureHeaders[measureIndex];
        if (measureHeader === undefined) {
          return [];
        }
        const previousMeasure = track.measures[measureIndex - 1];
        const nextMeasure = track.measures[measureIndex + 1];
        const commands = engraveNotationMeasure({
          track,
          header: measureHeader,
          measure,
          layout,
          previousMeasure,
          nextMeasure,
          top: 0,
          palette: PALETTE,
          highlight: { beatIndex: 0 },
        });
        count += commands.length;
        return problems(
          `${name} track ${trackIndex} measure ${measureIndex}`,
          commands,
          layout.width,
        );
      }),
    ];
  });
  return { problems: found, count };
}

describe('notation fixture sweep', () => {
  const fixtures = readFixtures();

  it('reads the fixtures', () => {
    expect(fixtures.length).toBeGreaterThan(100);
  });

  it('engraves every measure of every track with finite coordinates inside the band', () => {
    // Arrange
    const results = fixtures.map(engraveSong);

    // Act
    const found = results.flatMap(result => result.problems);
    const measures = fixtures.reduce(
      (sum, { song }) => sum + song.tracks.length * song.measureHeaders.length,
      0,
    );
    const commands = results.reduce((sum, result) => sum + result.count, 0);

    // Assert
    expect(found.slice(0, 5)).toEqual([]);
    expect(measures).toBeGreaterThan(5000);
    expect(commands / measures).toBeLessThan(60);
  });
});
