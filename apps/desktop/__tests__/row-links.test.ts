import { type Beat, type Note, type Song, setSystemBars } from '@gp-editor/core';
import { DEFAULT_CHORD_DISPLAY } from '../src/score/chords';
import { type CurveCommand, type DrawCommand, type LineCommand, SMUFL, type TextCommand } from '../src/score/draw';
import type { ScoreMode } from '../src/score/geometry';
import { GLYPH_WIDTH } from '../src/score/notation/metrics';
import { engraveRow, placeRow } from '../src/score/row';
import { type ScoreLayout, layoutScore } from '../src/score/score-layout';
import { engraveSystemStaff, staffDecor } from '../src/score/system-staff';
import { FRET_BOX, tabStringY, voiceColor } from '../src/score/symbols/tab-geometry';
import { PALETTE } from '../test-support/score-helpers';
import { beat, makeSong, note, withTrack } from '../test-support/songs';

/** Hammer-ons, pull-offs and slides as the score draws them, row by row: in a bar, across a bar line, across a system break. */

const H = { hammer: true } as const;
const WIDTH = 1200;

/** Beat `q` (0–3, quarter notes) of bar `bar` (1-based). */
const at = (bar: number, q: number, notes: Note[]): Beat => beat(960 + (bar - 1) * 3840 + q * 960, notes);

interface EngravedStaff {
  readonly commands: DrawCommand[];
  /** x of beat `beatIndex` of measure `measureIndex` in the staff's coordinates; undefined when not in this system. */
  readonly beatX: (measureIndex: number, beatIndex: number) => number | undefined;
  /** x of the measure's left and right bar lines in the staff's coordinates. */
  readonly edges: (measureIndex: number) => { readonly left: number; readonly right: number } | undefined;
  readonly tabTop: number;
  readonly notationTop?: number;
}

/** Every staff of every system, engraved as the score view does it (`[system][staff]`). */
function engraveScore(song: Song, mode: ScoreMode = 'notationAndTab', trackIndexes: readonly number[] = [0]): EngravedStaff[][] {
  const layout: ScoreLayout = layoutScore(song, trackIndexes.map((trackIndex) => ({ trackIndex, mode })), DEFAULT_CHORD_DISPLAY, WIDTH);
  return layout.systems.map((system, systemIndex) =>
    layout.staves.map((staff, staffIndex) => {
      const row = system.rows[staffIndex]!;
      const context = { song, trackIndex: staff.trackIndex, row, headerWidth: layout.clefWidth, mode: staff.mode, geometry: staff.geometry, palette: PALETTE, markLanes: staff.markLanes, hasHeading: staff.hasHeading };
      const decor = staffDecor(song, layout, systemIndex, staffIndex);
      const placed = placeRow(row, layout.clefWidth + (decor?.namesWidth ?? 0));
      const find = (measureIndex: number) => placed.find((p) => p.layout.measureIndex === measureIndex);
      return {
        commands: decor === undefined ? engraveRow(context) : engraveSystemStaff(context, decor),
        beatX: (measureIndex, beatIndex) => {
          const measure = find(measureIndex);
          const beatLayout = measure?.layout.beats.find((b) => b.beatIndex === beatIndex);
          return measure === undefined || beatLayout === undefined ? undefined : measure.x + beatLayout.x;
        },
        edges: (measureIndex) => {
          const measure = find(measureIndex);
          return measure === undefined ? undefined : { left: measure.x, right: measure.x + measure.layout.width };
        },
        tabTop: staff.geometry.tabTop!,
        notationTop: staff.geometry.notationTop,
      };
    }),
  );
}

/** The song with a system starting at each of these measures (0-based), three bars each at most. */
function withSystems(song: Song, starts: readonly number[]): Song {
  return starts.reduce((s, index, i) => setSystemBars(s, index, (starts[i + 1] ?? song.measureHeaders.length) - index), song);
}

const curves = (commands: readonly DrawCommand[]) => commands.filter((c): c is CurveCommand => c.kind === 'curve');
const slanted = (commands: readonly DrawCommand[]) =>
  commands.filter((c): c is LineCommand => c.kind === 'line' && c.x1 !== c.x2 && c.y1 !== c.y2);
const labels = (commands: readonly DrawCommand[], text: string) =>
  commands.filter((c): c is TextCommand => c.kind === 'text' && c.text === text);
/** Marks of the notes on tab string `string`: arcs start just over its fret numbers, slide lines cross it. */
const onTabString = <T extends CurveCommand | LineCommand>(marks: readonly T[], staff: EngravedStaff, string: number) => {
  const y = tabStringY(staff.tabTop, string);
  return marks.filter((m) => m.y1 >= y - FRET_BOX.height / 2 - 1 && m.y1 <= y + FRET_BOX.height / 4 && Math.min(m.x1, m.x2) > 0);
};
/** Marks above the tab staff: on the notation staff. */
const inNotation = <T extends CurveCommand | LineCommand>(marks: readonly T[], staff: EngravedStaff) =>
  marks.filter((m) => Math.max(m.y1, m.y2) < staff.tabTop - FRET_BOX.height);
const noteheads = (commands: readonly DrawCommand[], staff: EngravedStaff) =>
  commands.filter((c): c is TextCommand => c.kind === 'text' && c.text === SMUFL.noteheadBlack && c.y < staff.tabTop);
/** The notehead whose centre is at x (single notes are centred on their beat). */
const headAt = (commands: readonly DrawCommand[], staff: EngravedStaff, x: number) =>
  noteheads(commands, staff).find((head) => Math.abs(head.x + GLYPH_WIDTH.noteheadBlack / 2 - x) < 0.5);

/** Bar 1 ends with `last` (beat 4); bar 2 starts with `first`; bar 3 is a plain bar. */
function acrossBarLine(last: Note[], first: Note[]): Song {
  return makeSong([
    [at(1, 0, [note(1, 0)]), at(1, 1, [note(1, 0)]), at(1, 2, [note(1, 0)]), at(1, 3, last)],
    [at(2, 0, first), at(2, 1, [note(1, 0)]), at(2, 2, [note(1, 0)]), at(2, 3, [note(1, 0)])],
    [at(3, 0, [note(1, 0)])],
  ]);
}

describe('a hammer-on across a bar line on one system', () => {
  const song = acrossBarLine([note(3, 5, H)], [note(3, 7)]);

  it('arcs over the tab from fret to fret in one curve, labelled once', () => {
    // Act
    const [staff] = engraveScore(song)[0]!;

    // Assert
    const arcs = onTabString(curves(staff!.commands), staff!, 3);
    expect(arcs).toHaveLength(1);
    expect(arcs[0]).toMatchObject({ x1: staff!.beatX(0, 3), x2: staff!.beatX(1, 0) });
    expect(arcs[0]!.y2).toBe(arcs[0]!.y1);
    expect(arcs[0]!.cy).toBeLessThan(arcs[0]!.y1);
    const [label] = labels(staff!.commands, 'H');
    expect(labels(staff!.commands, 'H')).toHaveLength(1);
    expect(label!.x).toBeCloseTo((staff!.beatX(0, 3)! + staff!.beatX(1, 0)!) / 2);
  });

  it('slurs the noteheads in one curve from notehead to notehead', () => {
    // Act
    const [staff] = engraveScore(song)[0]!;

    // Assert
    const slurs = inNotation(curves(staff!.commands), staff!);
    expect(slurs).toHaveLength(1);
    const from = headAt(staff!.commands, staff!, staff!.beatX(0, 3)!);
    const to = headAt(staff!.commands, staff!, staff!.beatX(1, 0)!);
    expect(slurs[0]!.x1).toBeCloseTo(from!.x + GLYPH_WIDTH.noteheadBlack / 2);
    expect(slurs[0]!.x2).toBeCloseTo(to!.x + GLYPH_WIDTH.noteheadBlack / 2);
    // Both ends the same way from their noteheads: one arc, not two halves meeting at the bar line.
    expect(Math.sign(slurs[0]!.y1 - from!.y)).toBe(Math.sign(slurs[0]!.y2 - to!.y));
    expect(slurs[0]!.y2 - to!.y).toBeCloseTo(slurs[0]!.y1 - from!.y);
  });

  it('draws it in tab only and notation only too', () => {
    const [tab] = engraveScore(song, 'tab')[0]!;
    const [notation] = engraveScore(song, 'notation')[0]!;
    expect(curves(tab!.commands).filter((c) => c.x1 === tab!.beatX(0, 3) && c.x2 === tab!.beatX(1, 0))).toHaveLength(1);
    expect(curves(notation!.commands)).toHaveLength(1);
  });
});

describe('a hammer-on across a system break', () => {
  const song = withSystems(acrossBarLine([note(3, 7, H)], [note(3, 5)]), [0, 1]);

  it('runs a half arc to the end of the first system and in from the start of the next one, in tab and notation', () => {
    // Act
    const [[first], [second]] = engraveScore(song) as [EngravedStaff[], EngravedStaff[]];

    // Assert
    const out = onTabString(curves(first!.commands), first!, 3);
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({ x1: first!.beatX(0, 3), x2: first!.edges(0)!.right });
    expect(out[0]!.cy).toBe(out[0]!.y2);
    const into = onTabString(curves(second!.commands), second!, 3);
    expect(into).toHaveLength(1);
    expect(into[0]).toMatchObject({ x1: second!.beatX(1, 0), x2: second!.edges(1)!.left });
    expect(labels(first!.commands, 'P')).toHaveLength(1);
    expect(labels(second!.commands, 'P')).toHaveLength(0);
    expect(inNotation(curves(first!.commands), first!)[0]!.x2).toBe(first!.edges(0)!.right);
    expect(inNotation(curves(second!.commands), second!)).toHaveLength(1);
  });
});

describe('slides across a bar line on one system', () => {
  it('draws a shift slide up as one straight line from fret to fret and from notehead to notehead', () => {
    // Act
    const [staff] = engraveScore(acrossBarLine([note(4, 5, { slides: ['shift'] })], [note(4, 9)]))[0]!;

    // Assert
    const [line, ...others] = onTabString(slanted(staff!.commands), staff!, 4);
    expect(others).toHaveLength(0);
    expect(line!.x1).toBeCloseTo(staff!.beatX(0, 3)! + FRET_BOX.width / 2 - 2);
    expect(line!.x2).toBeCloseTo(staff!.beatX(1, 0)! - FRET_BOX.width / 2 + 2);
    expect(line!.y2).toBeLessThan(line!.y1);
    expect(curves(staff!.commands)).toHaveLength(0);
    const [slide, ...rest] = inNotation(slanted(staff!.commands), staff!);
    expect(rest).toHaveLength(0);
    const from = headAt(staff!.commands, staff!, staff!.beatX(0, 3)!);
    const to = headAt(staff!.commands, staff!, staff!.beatX(1, 0)!);
    expect(slide!.x1).toBeGreaterThan(from!.x + GLYPH_WIDTH.noteheadBlack);
    expect(slide!.x2).toBeLessThan(to!.x);
    expect(slide!.x2).toBeGreaterThan(staff!.edges(1)!.left);
    expect(slide!.y2).toBeCloseTo(to!.y);
    expect(slide!.y1).toBeCloseTo(from!.y);
  });

  it('adds one slur to a legato slide down, over the tab and on the notation staff', () => {
    // Act
    const [staff] = engraveScore(acrossBarLine([note(4, 9, { slides: ['legato'] })], [note(4, 5)]))[0]!;

    // Assert
    const [line] = onTabString(slanted(staff!.commands), staff!, 4);
    expect(line!.y2).toBeGreaterThan(line!.y1);
    expect(onTabString(curves(staff!.commands), staff!, 4)).toHaveLength(1);
    expect(inNotation(slanted(staff!.commands), staff!)).toHaveLength(1);
    expect(inNotation(curves(staff!.commands), staff!)).toHaveLength(1);
  });
});

describe('links of a chord across a bar line', () => {
  it('links each string to its own next note', () => {
    // Arrange
    const song = acrossBarLine([note(2, 5, H), note(3, 5, H), note(4, 7, { slides: ['shift'] })], [note(2, 7), note(3, 7), note(4, 9)]);

    // Act
    const [staff] = engraveScore(song)[0]!;

    // Assert
    [2, 3].forEach((string) => {
      expect(onTabString(curves(staff!.commands), staff!, string).map((c) => [c.x1, c.x2])).toEqual([[staff!.beatX(0, 3), staff!.beatX(1, 0)]]);
    });
    expect(onTabString(slanted(staff!.commands), staff!, 4)).toHaveLength(1);
    expect(inNotation(curves(staff!.commands), staff!)).toHaveLength(2);
    expect(inNotation(slanted(staff!.commands), staff!)).toHaveLength(1);
  });
});

describe('links of other voices and other tracks across a bar line', () => {
  it('draws voice 2’s hammer-on in its colour from fret to fret', () => {
    // Arrange
    const song = makeSong([
      [at(1, 0, [note(1, 0)]), { ...at(1, 3, [note(1, 0)]), voices: [...at(1, 3, [note(1, 0)]).voices, { ...at(1, 3, [note(5, 3, H)]).voices[0]! }] }],
      [{ ...at(2, 0, [note(1, 0)]), voices: [...at(2, 0, [note(1, 0)]).voices, { ...at(2, 0, [note(5, 5)]).voices[0]! }] }],
    ]);

    // Act
    const [staff] = engraveScore(song)[0]!;

    // Assert
    const [arc, ...others] = onTabString(curves(staff!.commands), staff!, 5);
    expect(others).toHaveLength(0);
    expect(arc).toMatchObject({ x1: staff!.beatX(0, 1), x2: staff!.beatX(1, 0), color: voiceColor(1, PALETTE) });
  });

  it('draws a second track’s hammer-on whole in a multitrack system', () => {
    // Arrange
    const song = withTrack(acrossBarLine([note(1, 0)], [note(1, 0)]), [
      [at(1, 0, [note(4, 2)]), at(1, 3, [note(4, 5, H)])],
      [at(2, 0, [note(4, 7)])],
      [at(3, 0, [note(4, 7)])],
    ]);

    // Act
    const [, second] = engraveScore(song, 'notationAndTab', [0, 1])[0]!;

    // Assert
    const arcs = onTabString(curves(second!.commands), second!, 4);
    expect(arcs.map((c) => [c.x1, c.x2])).toEqual([[second!.beatX(0, 1), second!.beatX(1, 0)]]);
    expect(inNotation(curves(second!.commands), second!)).toHaveLength(1);
  });
});

describe('more links at bar lines', () => {
  it('labels a pull-off across the bar line P, once, between the two frets', () => {
    const [staff] = engraveScore(acrossBarLine([note(2, 8, H)], [note(2, 5)]))[0]!;
    expect(labels(staff!.commands, 'H')).toHaveLength(0);
    expect(labels(staff!.commands, 'P').map((label) => label.x)).toEqual([(staff!.beatX(0, 3)! + staff!.beatX(1, 0)!) / 2]);
  });

  it.each([
    [3, 2],
    [4, 3],
  ])('links voice %i to its own next note across the bar line', (_voice, voiceIndex) => {
    // Arrange: voice 1 plays string 1, the other voice hammers on string 6 across the bar line.
    const inVoice = (b: Beat, notes: Note[]): Beat => ({
      ...b,
      voices: Array.from({ length: voiceIndex + 1 }, (_, v) => (v === 0 ? b.voices[0]! : v === voiceIndex ? { ...b.voices[0]!, notes } : { ...b.voices[0]!, notes: [], isEmpty: true })),
    });
    const song = makeSong([
      [at(1, 0, [note(1, 0)]), inVoice(at(1, 3, [note(1, 0)]), [note(6, 3, H)])],
      [inVoice(at(2, 0, [note(1, 0)]), [note(6, 5)])],
    ]);

    // Act
    const [staff] = engraveScore(song)[0]!;

    // Assert
    const arcs = onTabString(curves(staff!.commands), staff!, 6);
    expect(arcs).toEqual([expect.objectContaining({ x1: staff!.beatX(0, 1), x2: staff!.beatX(1, 0), color: voiceColor(voiceIndex, PALETTE) })]);
    expect(inNotation(curves(staff!.commands), staff!)).toHaveLength(1);
  });

  it('keeps a slide out of the last note and a slide into the next bar’s first note short lines of their own', () => {
    // Act
    const [staff] = engraveScore(acrossBarLine([note(3, 5, { slides: ['outDownwards'] })], [note(3, 7, { slides: ['intoFromBelow'] })]))[0]!;

    // Assert
    const y = tabStringY(staff!.tabTop, 3);
    const lines = slanted(staff!.commands).filter((line) => Math.abs(line.y1 - y) <= 6 && Math.abs(line.y2 - y) <= 6);
    expect(lines).toHaveLength(2);
    expect(lines.every((line) => Math.abs(line.x2 - line.x1) < FRET_BOX.width)).toBe(true);
    expect(lines[0]!.x1).toBeGreaterThan(staff!.beatX(0, 3)!);
    expect(lines[1]!.x2).toBeLessThan(staff!.beatX(1, 0)!);
    expect(curves(staff!.commands)).toHaveLength(0);
    expect(inNotation(slanted(staff!.commands), staff!)).toHaveLength(2);
  });

  it('runs a legato slide across a system break to the system’s end and in again at the next one', () => {
    // Arrange
    const song = withSystems(acrossBarLine([note(4, 5, { slides: ['legato'] })], [note(4, 9)]), [0, 1]);

    // Act
    const [[first], [second]] = engraveScore(song) as [EngravedStaff[], EngravedStaff[]];

    // Assert
    const [out] = onTabString(slanted(first!.commands), first!, 4);
    expect(out!.x2).toBe(first!.edges(0)!.right);
    expect(out!.y2).toBeLessThan(out!.y1);
    expect(onTabString(curves(first!.commands), first!, 4)[0]!.x2).toBe(first!.edges(0)!.right);
    const [into] = onTabString(slanted(second!.commands), second!, 4);
    expect(into!.x1).toBe(second!.edges(1)!.left);
    expect(into!.y2).toBeLessThan(into!.y1);
    expect(onTabString(curves(second!.commands), second!, 4)[0]!.x2).toBe(second!.edges(1)!.left);
  });
});
