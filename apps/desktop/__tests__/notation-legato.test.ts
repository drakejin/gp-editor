import type { Beat, Note } from '@gp-editor/core';
import { type MeasureLayout, layoutMeasure } from '../src/lib/layout';
import {
  type CurveCommand,
  type DrawCommand,
  type LineCommand,
  SMUFL,
  type TextCommand,
} from '../src/score/draw';
import { NOTATION, engraveNotationMeasure } from '../src/score/notation';
import { PALETTE } from '../test-support/score-helpers';
import { beat, makeSong, note } from '../test-support/songs';

const TOP = NOTATION.above;
const SPACE = NOTATION.space;
const yOf = (position: number) => TOP + ((8 - position) * SPACE) / 2;

interface Engraved {
  readonly commands: DrawCommand[];
  readonly layout: MeasureLayout;
}

/** Engraves `beats` as the second of three measures (the first and last are `previous` and `next`). */
function engrave(
  beats: Beat[],
  options: { previous?: Beat[]; next?: Beat[] } = {},
): Engraved {
  const song = makeSong([options.previous ?? [], beats, options.next ?? []]);
  const track = song.tracks[0]!;
  const layout = layoutMeasure(song, 0, 1);
  const commands = engraveNotationMeasure({
    track,
    header: song.measureHeaders[1]!,
    measure: track.measures[1]!,
    layout,
    previousMeasure:
      options.previous === undefined ? undefined : track.measures[0],
    nextMeasure: options.next === undefined ? undefined : track.measures[2],
    top: TOP,
    palette: PALETTE,
  });
  return { commands, layout };
}

const curves = (commands: readonly DrawCommand[]) =>
  commands.filter((c): c is CurveCommand => c.kind === 'curve');
/** Slanted lines: slides (stems, ledger, staff and bar lines are straight). */
const slanted = (commands: readonly DrawCommand[]) =>
  commands.filter(
    (c): c is LineCommand =>
      c.kind === 'line' && c.x1 !== c.x2 && c.y1 !== c.y2,
  );
const heads = (commands: readonly DrawCommand[]) =>
  commands.filter(
    (c): c is TextCommand =>
      c.kind === 'text' && c.text === SMUFL.noteheadBlack,
  );
const at = (start: number, notes: Note[]) => beat(start, notes);
const tied = (n: Note): Note => ({ ...n, isTied: true });

describe('hammer-on and pull-off slurs', () => {
  it('slurs a note to the next note on its string, under stem-up notes', () => {
    // Act
    const { commands } = engrave([
      at(4800, [note(3, 0, { hammer: true })]),
      at(5760, [note(3, 2)]),
    ]);

    // Assert
    const [slur] = curves(commands);
    const [first, second] = heads(commands);
    expect(curves(commands)).toHaveLength(1);
    expect(slur!.x1).toBeGreaterThan(first!.x);
    expect(slur!.x2).toBeLessThan(second!.x + 10);
    expect(slur!.x2).toBeGreaterThan(second!.x);
    expect(slur!.y1).toBeGreaterThan(yOf(2));
    expect(slur!.cy).toBeGreaterThan(Math.max(slur!.y1, slur!.y2));
    expect(slur!.color).toBe(PALETTE.text);
  });

  it('puts the slur over stem-down notes', () => {
    const [slur] = curves(
      engrave([
        at(4800, [note(1, 5, { hammer: true })]),
        at(5760, [note(1, 3)]),
      ]).commands,
    );
    expect(slur!.cy).toBeLessThan(Math.min(slur!.y1, slur!.y2));
  });

  it('runs a half slur to the bar line when the next note is in the next measure, and in from the bar line there', () => {
    // Arrange
    const hammered = (start: number) => [
      at(start, [note(3, 0, { hammer: true })]),
    ];
    const target = (start: number) => [at(start, [note(3, 2)])];

    // Act
    const outgoing = engrave(hammered(4800), { next: target(8640) });
    const incoming = engrave(target(4800), { previous: hammered(960) });

    // Assert
    const [out] = curves(outgoing.commands);
    expect(out!.x2).toBe(outgoing.layout.width);
    expect(out!.cy).toBe(out!.y2);
    const [into] = curves(incoming.commands);
    expect(into!.x2).toBe(0);
    expect(into!.x1).toBeGreaterThan(heads(incoming.commands)[0]!.x);
  });

  it('draws no slur without a note to go to', () => {
    expect(
      curves(
        engrave([at(4800, [note(3, 0, { hammer: true })]), at(5760, [])])
          .commands,
      ),
    ).toHaveLength(0);
  });
});

describe('slides', () => {
  it('joins the noteheads with a straight line rising to a higher note', () => {
    // Act
    const { commands } = engrave([
      at(4800, [note(3, 0, { slides: ['shift'] })]),
      at(5760, [note(3, 4)]),
    ]);

    // Assert
    const [slide] = slanted(commands);
    const [first, second] = heads(commands);
    expect(slide!.x1).toBeGreaterThan(first!.x + 9);
    expect(slide!.x2).toBeLessThan(second!.x);
    expect(slide!.y2).toBeLessThan(slide!.y1);
    expect(curves(commands)).toHaveLength(0);
  });

  it('adds a slur to a legato slide and falls towards a lower note', () => {
    const { commands } = engrave([
      at(4800, [note(3, 4, { slides: ['legato'] })]),
      at(5760, [note(3, 0)]),
    ]);
    expect(slanted(commands)[0]!.y2).toBeGreaterThan(slanted(commands)[0]!.y1);
    expect(curves(commands)).toHaveLength(1);
  });

  it('draws short slides out of and into notes', () => {
    // Act
    const { commands } = engrave([
      at(4800, [note(3, 0, { slides: ['outDownwards'] })]),
      at(5760, [note(3, 0, { slides: ['outUpwards'] })]),
      at(6720, [note(3, 0, { slides: ['intoFromBelow'] })]),
      at(7680, [note(3, 0, { slides: ['intoFromAbove'] })]),
    ]);

    // Assert
    const [down, up, fromBelow, fromAbove] = slanted(commands);
    const noteheads = heads(commands);
    expect(down!.x1).toBeGreaterThan(noteheads[0]!.x + 9);
    expect(down!.y2).toBeGreaterThan(down!.y1);
    expect(up!.y2).toBeLessThan(up!.y1);
    expect(fromBelow!.x2).toBeLessThan(noteheads[2]!.x);
    expect(fromBelow!.y1).toBeGreaterThan(fromBelow!.y2);
    expect(fromAbove!.y1).toBeLessThan(fromAbove!.y2);
  });

  it('slides to the bar line when the next note is in the next measure', () => {
    const { commands, layout } = engrave(
      [at(4800, [note(3, 0, { slides: ['shift'] })])],
      { next: [at(8640, [note(3, 3)])] },
    );
    const [slide] = slanted(commands);
    expect(slide!.x2).toBe(layout.width);
    expect(slide!.y2).toBeLessThan(slide!.y1);
  });
});

describe('ties across the bar line', () => {
  it('runs a half tie from the last note to the bar line when the next measure ties into it', () => {
    // Act
    const { commands, layout } = engrave([at(4800, [note(3, 0)])], {
      next: [at(8640, [tied(note(3, 0))])],
    });

    // Assert
    const [tie] = curves(commands);
    expect(tie!.x1).toBeGreaterThan(heads(commands)[0]!.x);
    expect(tie!.x2).toBe(layout.width);
    expect(tie!.cy).toBe(tie!.y2);
    expect(tie!.y2).not.toBe(tie!.y1);
  });

  it('meets the half tie of the previous measure at the bar line', () => {
    // Act
    const out = engrave([at(4800, [note(3, 0)])], {
      next: [at(8640, [tied(note(3, 0))])],
    });
    const into = engrave([at(4800, [tied(note(3, 0))])], {
      previous: [at(960, [note(3, 0)])],
    });

    // Assert
    const [outgoing] = curves(out.commands);
    const [incoming] = curves(into.commands);
    expect(incoming!.x2).toBe(0);
    expect(incoming!.y2).toBe(outgoing!.y2);
  });

  it('draws no outgoing tie when the next note on the string is not tied or the string is played again', () => {
    expect(
      curves(
        engrave([at(4800, [note(3, 0)])], { next: [at(8640, [note(3, 0)])] })
          .commands,
      ),
    ).toHaveLength(0);
    const played = engrave([at(4800, [note(3, 0)]), at(5760, [note(3, 0)])], {
      next: [at(8640, [tied(note(3, 0))])],
    });
    expect(curves(played.commands)).toHaveLength(1);
    expect(curves(played.commands)[0]!.x1).toBeGreaterThan(
      heads(played.commands)[1]!.x,
    );
  });
});
