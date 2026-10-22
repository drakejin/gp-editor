import { DYNAMICS, type Beat, type DynamicName, type Song, type StrokeDirection } from '@gp-editor/core';
import { layoutMeasure } from '../src/lib/layout';
import type { DrawCommand, TextCommand } from '../src/score/draw';
import { DYNAMIC_MUSIC_SIZE, hasDynamicChanges } from '../src/score/dynamics';
import { SCORE_MODES, type ScoreMode, rowGeometry } from '../src/score/geometry';
import { NOTATION } from '../src/score/notation';
import { engraveRow, placeRow, rowHeaderWidth } from '../src/score/row';
import { DYNAMIC_GLYPHS, PICK_STROKE_GLYPHS, TEXT_NOTE_GLYPHS, staffSpace } from '../src/score/symbols/smufl';
import { tabMarkLanes } from '../src/score/tab';
import { PALETTE, texts } from '../test-support/score-helpers';
import { beat, header, makeSong, note } from '../test-support/songs';

const QUARTER_TICKS = 960;

function velocityOf(dynamic: DynamicName): number {
  return DYNAMICS.find((entry) => entry.name === dynamic)?.velocity ?? 0;
}

/** A bar of four quarter notes at these dynamics, the first beat picked as given. */
function bar(number: number, dynamics: readonly DynamicName[], pickStroke: StrokeDirection = 'none'): Beat[] {
  return dynamics.map((dynamic, i) => ({
    ...beat(header(number).start + i * QUARTER_TICKS, [{ ...note(3, 2), velocity: velocityOf(dynamic) }]),
    pickStroke: i === 0 ? pickStroke : 'none',
  }));
}

/** Every bar of the song in one row, engraved as the score view does it (lanes and dynamics of the whole track). */
function engraveSong(song: Song, mode: ScoreMode): { commands: DrawCommand[]; geometry: ReturnType<typeof rowGeometry>; xOf: (m: number, b: number) => number } {
  const track = song.tracks[0]!;
  const markLanes = tabMarkLanes(track.measures);
  const geometry = rowGeometry(mode, track.strings.length, { markLaneCount: markLanes.length, hasDynamics: hasDynamicChanges(track.measures) });
  const headerWidth = rowHeaderWidth(mode, track);
  const row = { measures: song.measureHeaders.map((_, i) => layoutMeasure(song, 0, i)) };
  const placed = placeRow(row, headerWidth);
  const commands = engraveRow({ song, trackIndex: 0, row, headerWidth, mode, geometry, palette: PALETTE, markLanes });
  const xOf = (m: number, b: number) => placed[m]!.x + placed[m]!.layout.beats[b]!.x;
  return { commands, geometry, xOf };
}

const glyphsOf = (commands: readonly DrawCommand[], text: string): TextCommand[] => texts(commands).filter((c) => c.text === text);

describe('dynamics in a row', () => {
  it.each(SCORE_MODES)('draws the changed dynamic once, under its beat (%s)', (mode) => {
    // Arrange
    const song = makeSong([bar(1, ['f', 'f', 'f', 'f']), bar(2, ['f', 'p', 'p', 'p'])]);

    // Act
    const { commands, xOf } = engraveSong(song, mode);

    // Assert
    expect(glyphsOf(commands, DYNAMIC_GLYPHS.p.text)).toEqual([expect.objectContaining({ x: xOf(1, 1) })]);
    expect(texts(commands).filter((c) => Object.values(DYNAMIC_GLYPHS).some((g) => g.text === c.text))).toHaveLength(1);
  });

  it.each<ScoreMode>(['notationAndTab', 'notation'])('puts the marks under the notation staff, no lower than their band (%s)', (mode) => {
    // Arrange
    const song = makeSong([bar(1, ['mf', 'mf', 'mf', 'mf'])]);

    // Act
    const { commands, geometry } = engraveSong(song, mode);

    // Assert
    const [mark] = glyphsOf(commands, DYNAMIC_GLYPHS.mf.text);
    const bottomLine = geometry.notationTop! + 4 * NOTATION.space;
    expect(mark!.y - DYNAMIC_GLYPHS.mf.top * staffSpace(DYNAMIC_MUSIC_SIZE)).toBeGreaterThan(bottomLine);
    expect(mark!.y).toBeLessThanOrEqual(geometry.dynamicsY!);
    expect(geometry.tabTop ?? Infinity).toBeGreaterThan(geometry.dynamicsY!);
  });

  it('puts the marks on their band under the tab when notation is hidden', () => {
    // Arrange
    const song = makeSong([bar(1, ['mf', 'mf', 'mf', 'mf'])]);

    // Act
    const { commands, geometry } = engraveSong(song, 'tab');

    // Assert
    expect(glyphsOf(commands, DYNAMIC_GLYPHS.mf.text)[0]!.y).toBe(geometry.dynamicsY);
    expect(geometry.dynamicsY!).toBeGreaterThan(geometry.tabTop!);
  });

  it('keeps a mark clear of a low note above it', () => {
    // Arrange: the open low E sits three ledger lines under the staff.
    const lowE = { ...beat(header(1).start, [{ ...note(6, 0), velocity: velocityOf('p') }]), pickStroke: 'none' as const };
    const song = makeSong([[lowE]]);

    // Act
    const { commands, geometry } = engraveSong(song, 'notation');

    // Assert
    const [mark] = glyphsOf(commands, DYNAMIC_GLYPHS.p.text);
    const lowEHeadBottom = geometry.notationTop! + 4 * NOTATION.space + 3 * NOTATION.space + NOTATION.space / 2;
    expect(mark!.y - DYNAMIC_GLYPHS.p.top * staffSpace(DYNAMIC_MUSIC_SIZE)).toBeGreaterThan(lowEHeadBottom);
  });

  it('draws no marks and keeps the rows as they were when the track never changes dynamic', () => {
    // Arrange
    const song = makeSong([bar(1, ['f', 'f', 'f', 'f'])]);

    // Act
    const { commands, geometry } = engraveSong(song, 'notationAndTab');

    // Assert
    expect(geometry.dynamicsY).toBeUndefined();
    expect(geometry.height).toBe(rowGeometry('notationAndTab', 6, { markLaneCount: 0 }).height);
    expect(texts(commands).filter((c) => Object.values(DYNAMIC_GLYPHS).some((g) => g.text === c.text))).toHaveLength(0);
  });
});

describe('pick strokes in a row', () => {
  it.each<[ScoreMode, 'tab' | 'notation']>([
    ['notationAndTab', 'tab'],
    ['tab', 'tab'],
    ['notation', 'notation'],
  ])('draws the mark once, over the %s rows’ %s staff', (mode, staff) => {
    // Arrange
    const song = makeSong([bar(1, ['f', 'f', 'f', 'f'], 'down')]);

    // Act
    const { commands, geometry, xOf } = engraveSong(song, mode);

    // Assert
    const marks = glyphsOf(commands, PICK_STROKE_GLYPHS.down.text);
    expect(marks).toHaveLength(1);
    expect(marks[0]!.x).toBe(xOf(0, 0));
    const staffTop = staff === 'tab' ? geometry.tabTop! : geometry.notationTop!;
    expect(marks[0]!.y).toBeLessThan(staffTop);
  });
});

describe('triplet feel in a row', () => {
  it('draws the swing mark in the heading of the bar where it starts', () => {
    // Arrange
    const headers = [header(1), header(2, { tripletFeel: 'eighth' })];
    const song = makeSong([bar(1, ['f', 'f', 'f', 'f']), bar(2, ['f', 'f', 'f', 'f'])], headers);

    // Act
    const { commands, geometry } = engraveSong(song, 'notationAndTab');

    // Assert
    const swing = texts(commands).filter((c) => c.text.startsWith(TEXT_NOTE_GLYPHS.quarter.text + TEXT_NOTE_GLYPHS.beam8th.text));
    const secondBar = placeRow({ measures: [layoutMeasure(song, 0, 0), layoutMeasure(song, 0, 1)] }, rowHeaderWidth('notationAndTab', song.tracks[0]!))[1]!;
    expect(swing).toHaveLength(1);
    expect(swing[0]!.x).toBeGreaterThanOrEqual(secondBar.x);
    expect(swing[0]!.y).toBeLessThan(geometry.notationTop!);
  });
});
