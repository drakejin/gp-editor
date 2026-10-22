import { QUARTER } from '@gp-editor/core';
import type { Beat, NoteEffect } from '@gp-editor/core';
import { layoutMeasure } from '../src/lib/layout';
import type { DrawCommand, LineCommand, TextCommand } from '../src/score/draw';
import { TECHNIQUE_GLYPHS, TREMOLO_GLYPHS } from '../src/score/symbols/smufl';
import { TAB_MARKS } from '../src/score/symbols/tab-geometry';
import { tabMarkLanes } from '../src/score/symbols/tab-marks';
import { type TabContext, engraveTabMeasure } from '../src/score/tab';
import { PALETTE } from '../test-support/score-helpers';
import { beat, makeSong, note } from '../test-support/songs';

const TOP = 60;
const MARKS_Y = 44;
const LANE_1 = MARKS_Y - TAB_MARKS.laneHeight;

interface Options {
  readonly previous?: Beat[];
  readonly next?: Beat[];
  readonly lanes?: TabContext['markLanes'];
}

/** Engraves the middle of three measures. */
function engrave(
  beats: Beat[],
  options: Options = {},
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
    previousBeat: track.measures[0]!.beats[track.measures[0]!.beats.length - 1],
    nextMeasure: options.next === undefined ? undefined : track.measures[2],
    top: TOP,
    marksY: MARKS_Y,
    markLanes: options.lanes,
    showRhythm: false,
    palette: PALETTE,
  };
  return { commands: engraveTabMeasure(context), context };
}

/** Four quarter beats on string 1 with the effect on the beats whose flag is true. */
function quarters(
  effect: Partial<NoteEffect>,
  flags: readonly boolean[] = [true, true, true, true],
  start = 4800,
): Beat[] {
  return flags.map((on, i) =>
    beat(start + i * 960, [note(1, 5, on ? effect : {})]),
  );
}

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
const dashed = (commands: readonly DrawCommand[]): LineCommand[] =>
  ofKind(commands, 'line').filter(c => c.dash !== undefined);
const beatX = (context: TabContext, index: number) =>
  context.layout.beats[index]!.x;

describe('palm mute and let ring spans', () => {
  it('labels the start of a run and dashes to its end with a hook down', () => {
    // Act
    const { commands, context } = engrave(
      quarters({ palmMute: true }, [true, true, true, false]),
    );

    // Assert
    const [label] = labelled(commands, 'P.M.');
    expect(label).toMatchObject({
      y: MARKS_Y,
      color: PALETTE.muted,
      align: 'left',
    });
    expect(label!.x).toBeLessThan(beatX(context, 0));
    const [dashes] = dashed(commands);
    expect(dashes!.x1).toBeGreaterThan(label!.x);
    expect(dashes!.x2).toBeGreaterThan(beatX(context, 2));
    expect(dashes!.x2).toBeLessThan(beatX(context, 3));
    const hook = ofKind(commands, 'line').find(
      c => c.x1 === dashes!.x2 && c.x2 === dashes!.x2,
    );
    expect(hook!.y2).toBeGreaterThan(hook!.y1);
  });

  it('starts the dashes at the bar line without a label when the run goes on from the previous measure', () => {
    const { commands } = engrave(
      quarters({ palmMute: true }, [true, false, false, false]),
      {
        previous: quarters(
          { palmMute: true },
          [false, false, false, true],
          960,
        ),
      },
    );
    expect(labelled(commands, 'P.M.')).toHaveLength(0);
    expect(dashed(commands)[0]!.x1).toBe(0);
  });

  it('runs to the bar line without a hook when the run goes on into the next measure', () => {
    // Act
    const { commands, context } = engrave(quarters({ letRing: true }), {
      next: quarters({ letRing: true }, [true], 8640),
    });

    // Assert
    const [dashes] = dashed(commands);
    expect(labelled(commands, 'let ring')).toHaveLength(1);
    expect(dashes!.x2).toBe(context.layout.width);
    expect(
      ofKind(commands, 'line').some(
        c => c.x1 === context.layout.width && c.y2 > c.y1 && c.y1 === MARKS_Y,
      ),
    ).toBe(false);
  });

  it('starts a new run after a rest', () => {
    const beats = [
      ...quarters({ palmMute: true }, [true]),
      beat(5760, []),
      ...quarters({ palmMute: true }, [true, true], 6720),
    ];
    expect(labelled(engrave(beats).commands, 'P.M.')).toHaveLength(2);
  });

  it('stacks palm mute and let ring in their own lanes', () => {
    const { commands } = engrave(quarters({ palmMute: true, letRing: true }));
    expect(labelled(commands, 'P.M.')[0]!.y).toBe(MARKS_Y);
    expect(labelled(commands, 'let ring')[0]!.y).toBe(LANE_1);
  });
});

describe('waves', () => {
  it('draws vibrato as a wavy line from the note to the end of the run', () => {
    // Act
    const { commands, context } = engrave(
      quarters({ vibrato: true }, [false, true, true, false]),
    );

    // Assert
    const wave = ofKind(commands, 'text').find(c =>
      c.text.startsWith(TECHNIQUE_GLYPHS.guitarVibratoStroke.text),
    );
    expect(wave).toMatchObject({ font: 'music', color: PALETTE.muted });
    expect(wave!.x).toBeLessThan(beatX(context, 1));
    expect(wave!.text.length).toBeGreaterThan(5);
    expect(Math.abs(wave!.y - MARKS_Y)).toBeLessThan(TAB_MARKS.laneHeight / 2);
  });

  it('writes tr before the trill wave', () => {
    const trill = { fret: 7, duration: { ...QUARTER, value: 16 as const } };
    const { commands } = engrave(
      quarters({ trill }, [true, false, false, false]),
    );
    const tr = labelled(commands, TECHNIQUE_GLYPHS.ornamentTrill.text)[0];
    const wave = ofKind(commands, 'text').find(c =>
      c.text.startsWith(TECHNIQUE_GLYPHS.wiggleTrill.text),
    );
    expect(tr).toBeDefined();
    expect(wave!.x).toBeGreaterThan(tr!.x);
  });

  it('labels the tremolo bar w/bar and draws the dip', () => {
    // Arrange
    const tremoloBar = {
      points: [
        { position: 0, value: 0 },
        { position: 6, value: -4 },
        { position: 12, value: 0 },
      ],
    };

    // Act
    const { commands, context } = engrave(
      quarters({ tremoloBar }, [true, false, false, false]),
    );

    // Assert
    const [label] = labelled(commands, 'w/bar');
    expect(label!.align).toBe('right');
    expect(label!.x).toBeLessThan(beatX(context, 0));
    const dip = ofKind(commands, 'line').filter(
      c => c.y1 !== c.y2 && c.x1 !== c.x2,
    );
    expect(dip).toHaveLength(2);
    expect(dip[0]!.y2).toBeGreaterThan(dip[0]!.y1);
  });
});

describe('beat labels', () => {
  it('writes tapping, slap, pop and harmonic labels', () => {
    const { commands } = engrave([
      beat(4800, [note(1, 5, { tapping: true })]),
      beat(5760, [
        note(1, 5, {
          slapping: true,
          harmonic: { type: 'artificial', data: 12 },
        }),
      ]),
      beat(6720, [
        note(1, 5, { popping: true, harmonic: { type: 'pinch', data: 0 } }),
      ]),
      beat(7680, [note(1, 5, { harmonic: { type: 'natural', data: 0 } })]),
    ]);
    const values = ofKind(commands, 'text')
      .filter(c => c.font === 'ui')
      .map(c => c.text);
    expect(values).toEqual(['T', 'S A.H.', 'P P.H.']);
  });

  it('draws accents, staccato and tremolo picking as music symbols in the marks row', () => {
    // Act
    const { commands, context } = engrave([
      beat(4800, [note(1, 5, { accentuatedNote: true, staccato: true })]),
      beat(5760, [note(1, 5, { heavyAccentuatedNote: true })]),
      beat(6720, [
        note(1, 5, { tremoloPicking: { duration: { ...QUARTER, value: 16 } } }),
      ]),
    ]);

    // Assert
    const music = ofKind(commands, 'text').filter(c => c.font === 'music');
    expect(music.map(c => c.text)).toEqual([
      TECHNIQUE_GLYPHS.articStaccatoAbove.text +
        TECHNIQUE_GLYPHS.articAccentAbove.text,
      TECHNIQUE_GLYPHS.articMarcatoAbove.text,
      TREMOLO_GLYPHS[1]!.text,
    ]);
    expect(
      music.every(c => Math.abs(c.y - MARKS_Y) < TAB_MARKS.laneHeight),
    ).toBe(true);
    expect(music[0]!.x).toBeLessThan(beatX(context, 0));
  });

  it('draws a fade-in hairpin', () => {
    const { commands, context } = engrave([
      beat(4800, [note(1, 5, { fadeIn: true })]),
    ]);
    const hairpin = ofKind(commands, 'line').filter(
      c => c.y1 !== c.y2 && c.x1 !== c.x2,
    );
    expect(hairpin).toHaveLength(2);
    expect(hairpin[0]!.x1).toBe(hairpin[1]!.x1);
    expect(hairpin[0]!.x1).toBeLessThan(beatX(context, 0));
  });

  it('no longer writes the old text marks', () => {
    const { commands } = engrave([
      beat(4800, [
        note(1, 5, { hammer: true, slides: ['shift'], vibrato: true }),
      ]),
      beat(5760, [note(1, 7)]),
    ]);
    const values = ofKind(commands, 'text').map(c => c.text);
    expect(values).not.toContain('sl.');
    expect(values).not.toContain('~');
    expect(values.some(v => v.includes('↑'))).toBe(false);
  });
});

describe('lanes', () => {
  it('lists the kinds of marks in the measures in a fixed order', () => {
    const measures = makeSong([
      quarters({ letRing: true }),
      [beat(960, [note(1, 0, { vibrato: true, tapping: true })])],
    ]).tracks[0]!.measures;
    expect(tabMarkLanes(measures)).toEqual(['labels', 'vibrato', 'letRing']);
    expect(tabMarkLanes([])).toEqual([]);
  });

  it('uses the lanes given for the row so a span keeps its height across measures', () => {
    const { commands } = engrave(quarters({ palmMute: true }), {
      lanes: ['vibrato', 'palmMute'],
    });
    expect(labelled(commands, 'P.M.')[0]!.y).toBe(LANE_1);
  });
});
