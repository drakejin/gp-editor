import { QUARTER } from '@gp-editor/core';
import type { Beat, Measure, Note } from '@gp-editor/core';
import { layoutMeasure } from '../src/lib/layout';
import type {
  CurveCommand,
  DrawCommand,
  LineCommand,
  PolygonCommand,
  TextCommand,
} from '../src/score/draw';
import { FRET_BOX } from '../src/score/symbols/tab-geometry';
import { type TabContext, engraveTabMeasure, stringY } from '../src/score/tab';
import { PALETTE, allFinite } from '../test-support/score-helpers';
import { beat, makeSong, note } from '../test-support/songs';

const TOP = 60;
const MARKS_Y = 44;

/** Engraves the middle of three measures: `previous`, `beats`, `next`. */
function engrave(
  beats: Beat[],
  options: { previous?: Beat[]; next?: Beat[] } = {},
): { commands: DrawCommand[]; context: TabContext } {
  const song = makeSong([options.previous ?? [], beats, options.next ?? []]);
  const track = song.tracks[0]!;
  const context: TabContext = {
    track,
    header: song.measureHeaders[1]!,
    measure: track.measures[1]!,
    layout: layoutMeasure(song, 0, 1),
    previousMeasure:
      options.previous === undefined ? undefined : track.measures[0],
    nextMeasure: options.next === undefined ? undefined : track.measures[2],
    top: TOP,
    marksY: MARKS_Y,
    showRhythm: false,
    palette: PALETTE,
  };
  return { commands: engraveTabMeasure(context), context };
}

const beatX = (context: TabContext, index: number) =>
  context.layout.beats[index]!.x;
const ofKind = <K extends DrawCommand['kind']>(
  commands: readonly DrawCommand[],
  kind: K,
) =>
  commands.filter(
    (c): c is Extract<DrawCommand, { kind: K }> => c.kind === kind,
  );
const labelled = (
  commands: readonly DrawCommand[],
  text: string,
): TextCommand[] => ofKind(commands, 'text').filter(c => c.text === text);
/** Lines that are neither string lines nor bar lines. */
const strokes = (
  commands: readonly DrawCommand[],
  width: number,
): LineCommand[] =>
  ofKind(commands, 'line').filter(
    c => c.y1 !== c.y2 && c.x1 !== width && c.x1 !== c.x2,
  );
const at = (start: number, notes: Note[]) => beat(start, notes);

describe('hammer-ons and pull-offs', () => {
  it('arcs over the fret numbers to the next note on the string with H when the fret rises', () => {
    // Act
    const { commands, context } = engrave([
      at(4800, [note(3, 5, { hammer: true })]),
      at(5760, [note(3, 7)]),
    ]);

    // Assert
    const [arc] = ofKind(commands, 'curve');
    const y = stringY(TOP, 3);
    expect(arc).toMatchObject({
      x1: beatX(context, 0),
      x2: beatX(context, 1),
      color: PALETTE.text,
    });
    expect(arc!.y1).toBeLessThan(y - FRET_BOX.height / 2 + 1);
    expect(arc!.cy).toBeLessThan(arc!.y1);
    const [label] = labelled(commands, 'H');
    expect(label!.x).toBeCloseTo((beatX(context, 0) + beatX(context, 1)) / 2);
    expect(label!.y).toBeLessThan(arc!.y1);
  });

  it('labels a pull-off P', () => {
    const { commands } = engrave([
      at(4800, [note(3, 7, { hammer: true })]),
      at(5760, [note(3, 5)]),
    ]);
    expect(labelled(commands, 'P')).toHaveLength(1);
    expect(labelled(commands, 'H')).toHaveLength(0);
  });

  it('runs a half arc to the bar line when the next note is in the next measure, and into the note there', () => {
    // Arrange
    const hammered = [at(4800, [note(2, 3, { hammer: true })])];
    const target = [at(8640, [note(2, 5)])];

    // Act
    const outgoing = engrave(hammered, { next: target });
    const incoming = engrave(
      target.map(b => ({ ...b, start: 4800 })),
      { previous: hammered.map(b => ({ ...b, start: 960 })) },
    );

    // Assert
    const [out] = ofKind(outgoing.commands, 'curve');
    expect(out!.x2).toBe(outgoing.context.layout.width);
    expect(out!.y2).toBe(out!.cy);
    expect(labelled(outgoing.commands, 'H')).toHaveLength(1);
    const [into] = ofKind(incoming.commands, 'curve');
    expect(into).toMatchObject({ x1: beatX(incoming.context, 0), x2: 0 });
    expect(labelled(incoming.commands, 'H')).toHaveLength(0);
  });

  it('draws nothing without a note to slur to', () => {
    const { commands } = engrave([
      at(4800, [note(2, 3, { hammer: true })]),
      at(5760, []),
    ]);
    expect(ofKind(commands, 'curve')).toHaveLength(0);
  });

  it('draws techniques of the second voice in the accent colour', () => {
    const base = at(4800, [note(1, 0)]);
    const second = (fret: number, hammer: boolean): Beat => ({
      ...base,
      voices: [
        base.voices[0]!,
        { ...base.voices[0]!, notes: [note(4, fret, { hammer })] },
      ],
    });
    const { commands } = engrave([
      second(2, true),
      { ...second(4, false), start: 5760 },
    ]);
    expect(ofKind(commands, 'curve')[0]!.color).toBe(PALETTE.accent);
  });
});

describe('slides', () => {
  it('joins two fret numbers with a straight line rising towards the higher fret', () => {
    // Act
    const { commands, context } = engrave([
      at(4800, [note(2, 5, { slides: ['shift'] })]),
      at(5760, [note(2, 9)]),
    ]);

    // Assert
    const [slide] = strokes(commands, context.layout.width);
    expect(slide!.x1).toBeGreaterThan(beatX(context, 0));
    expect(slide!.x2).toBeLessThan(beatX(context, 1));
    expect(slide!.y2).toBeLessThan(slide!.y1);
    expect((slide!.y1 + slide!.y2) / 2).toBeCloseTo(stringY(TOP, 2));
  });

  it('slopes down towards a lower fret and adds a slur for a legato slide', () => {
    const { commands, context } = engrave([
      at(4800, [note(2, 9, { slides: ['legato'] })]),
      at(5760, [note(2, 5)]),
    ]);
    const [slide] = strokes(commands, context.layout.width);
    expect(slide!.y2).toBeGreaterThan(slide!.y1);
    expect(ofKind(commands, 'curve')).toHaveLength(1);
  });

  it('draws short slides out of and into a note on the right sides', () => {
    // Act
    const { commands, context } = engrave([
      at(4800, [note(1, 5, { slides: ['outDownwards'] })]),
      at(5760, [note(1, 5, { slides: ['outUpwards'] })]),
      at(6720, [note(1, 5, { slides: ['intoFromBelow'] })]),
      at(7680, [note(1, 5, { slides: ['intoFromAbove'] })]),
    ]);

    // Assert
    const [down, up, fromBelow, fromAbove] = strokes(
      commands,
      context.layout.width,
    );
    expect(down!.x1).toBeGreaterThan(beatX(context, 0));
    expect(down!.y2).toBeGreaterThan(down!.y1);
    expect(up!.y2).toBeLessThan(up!.y1);
    expect(fromBelow!.x2).toBeLessThan(beatX(context, 2));
    expect(fromBelow!.y1).toBeGreaterThan(fromBelow!.y2);
    expect(fromAbove!.y1).toBeLessThan(fromAbove!.y2);
  });

  it('slides to the bar line when the next note is in the next measure, and in from it there', () => {
    const slid = [at(4800, [note(2, 5, { slides: ['shift'] })])];
    const outgoing = engrave(slid, { next: [at(8640, [note(2, 7)])] });
    const [out] = strokes(outgoing.commands, outgoing.context.layout.width + 1);
    expect(out!.x2).toBe(outgoing.context.layout.width);
    const incoming = engrave([at(4800, [note(2, 7)])], {
      previous: slid.map(b => ({ ...b, start: 960 })),
    });
    const [into] = strokes(incoming.commands, incoming.context.layout.width);
    expect(into!.x1).toBe(0);
  });
});

describe('bends, grace notes, trills and strokes', () => {
  it('starts a bend arrow right of the fret number and ends it above the staff', () => {
    // Act
    const bend = {
      points: [
        { position: 0, value: 0 },
        { position: 6, value: 4 },
      ],
    };
    const { commands, context } = engrave([
      at(4800, [note(3, 7, { bend })]),
      at(5760, [note(3, 7)]),
    ]);

    // Assert
    const [curve] = ofKind(commands, 'curve') as CurveCommand[];
    const [head] = ofKind(commands, 'polygon') as PolygonCommand[];
    expect(curve!.x1).toBeGreaterThan(beatX(context, 0));
    expect(curve!.y1).toBe(stringY(TOP, 3));
    expect(head!.points[1]).toBeLessThan(TOP);
    expect(head!.points[0]).toBeLessThan(beatX(context, 1));
    expect(labelled(commands, 'full')).toHaveLength(1);
  });

  it('writes a grace note as a small fret number before the beat on a paper box', () => {
    // Arrange
    const grace = {
      fret: 3,
      duration: 2,
      velocity: 95,
      transition: 'none' as const,
      onBeat: false,
      isDead: false,
    };

    // Act
    const { commands, context } = engrave([
      at(4800, [note(2, 5, { grace })]),
      at(5760, [note(2, 5, { grace: { ...grace, isDead: true } })]),
    ]);

    // Assert
    const [small] = labelled(commands, '3');
    expect(small!.x).toBeLessThan(beatX(context, 0) - FRET_BOX.width / 2);
    expect(small!.y).toBe(stringY(TOP, 2));
    expect(small!.size).toBeLessThan(11);
    const box = ofKind(commands, 'rect').find(
      r =>
        r.x < small!.x &&
        r.x + r.width > small!.x &&
        r.height < FRET_BOX.height,
    );
    expect(box?.color).toBe(PALETTE.paper);
    expect(labelled(commands, 'x')).toHaveLength(1);
  });

  it('writes the trill fret in parentheses after the note', () => {
    const trill = { fret: 7, duration: { ...QUARTER, value: 16 as const } };
    const { commands, context } = engrave([at(4800, [note(1, 5, { trill })])]);
    const [fret] = labelled(commands, '(7)');
    expect(fret!.x).toBeGreaterThan(beatX(context, 0));
    expect(fret!.y).toBe(stringY(TOP, 1));
  });

  it('draws a stroke as an arrow beside the chord pointing the way of the stroke', () => {
    // Arrange
    const chord = [note(1, 0), note(2, 1), note(3, 0), note(4, 2)];

    // Act
    const up = engrave([
      { ...at(4800, chord), stroke: { direction: 'up', value: 8 } },
    ]);
    const down = engrave([
      { ...at(4800, chord), stroke: { direction: 'down', value: 8 } },
    ]);

    // Assert
    const [upHead] = ofKind(up.commands, 'polygon');
    const [downHead] = ofKind(down.commands, 'polygon');
    expect(upHead!.points[0]).toBeLessThan(
      beatX(up.context, 0) - FRET_BOX.width / 2,
    );
    expect(upHead!.points[1]).toBeLessThan(stringY(TOP, 1));
    expect(downHead!.points[1]).toBeGreaterThan(stringY(TOP, 4));
  });

  it('keeps every number finite for a measure full of techniques', () => {
    const notes = [
      note(1, 5, {
        hammer: true,
        slides: ['shift', 'outUpwards'],
        bend: {
          points: [
            { position: 0, value: 2 },
            { position: 12, value: 0 },
          ],
        },
      }),
    ];
    const { commands } = engrave([at(4800, notes), at(5760, [note(1, 7)])], {
      previous: [at(960, notes)],
      next: [at(8640, notes)],
    });
    expect(allFinite(commands)).toBe(true);
  });
});

describe('measures without neighbours', () => {
  it('works on a lone measure', () => {
    const beats = [at(960, [note(1, 0, { hammer: true })])];
    const lone: Measure = {
      headerIndex: 0,
      clef: 'treble',
      keySignature: 0,
      beats,
    };
    const song = makeSong([beats]);
    const track = song.tracks[0]!;
    const commands = engraveTabMeasure({
      track,
      header: song.measureHeaders[0]!,
      measure: lone,
      layout: layoutMeasure(song, 0, 0),
      top: TOP,
      marksY: MARKS_Y,
      showRhythm: true,
      palette: PALETTE,
    });
    expect(ofKind(commands, 'curve')).toHaveLength(0);
  });
});
