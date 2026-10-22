import { QUARTER } from '@gp-editor/core';
import type { Beat, Duration, Note, NoteEffect } from '@gp-editor/core';
import { type MeasureLayout, layoutMeasure } from '../src/lib/layout';
import {
  type DrawCommand,
  type LineCommand,
  SMUFL,
  type TextCommand,
} from '../src/score/draw';
import {
  NOTATION,
  type NotationContext,
  engraveNotationMeasure,
} from '../src/score/notation';
import { TECHNIQUE_GLYPHS, TREMOLO_GLYPHS } from '../src/score/symbols/smufl';
import { PALETTE } from '../test-support/score-helpers';
import { beat, makeSong, note } from '../test-support/songs';

const TOP = NOTATION.above;
const SPACE = NOTATION.space;
const yOf = (position: number) => TOP + ((8 - position) * SPACE) / 2;
const WHOLE: Duration = { ...QUARTER, value: 1 };
const HALF: Duration = { ...QUARTER, value: 2 };
const G = TECHNIQUE_GLYPHS;

interface Engraved {
  readonly commands: DrawCommand[];
  readonly layout: MeasureLayout;
}

function engrave(
  beats: Beat[],
  options: {
    isPercussion?: boolean;
    highlight?: NotationContext['highlight'];
  } = {},
): Engraved {
  const song = makeSong([beats]);
  const track = {
    ...song.tracks[0]!,
    isPercussion: options.isPercussion ?? false,
  };
  const layout = layoutMeasure(song, 0, 0);
  const context = {
    track,
    header: song.measureHeaders[0]!,
    measure: track.measures[0]!,
    layout,
    top: TOP,
    palette: PALETTE,
    highlight: options.highlight,
  };
  return { commands: engraveNotationMeasure(context), layout };
}

const one = (n: Note, duration: Duration = QUARTER) =>
  engrave([beat(960, [n], duration)]);
const texts = (
  commands: readonly DrawCommand[],
  text?: string,
): TextCommand[] =>
  commands.filter(
    (c): c is TextCommand =>
      c.kind === 'text' && (text === undefined || c.text === text),
  );
const startingWith = (commands: readonly DrawCommand[], glyph: string) =>
  texts(commands).filter(c => c.text.startsWith(glyph) && c.text.length > 1);
const lines = (commands: readonly DrawCommand[]) =>
  commands.filter((c): c is LineCommand => c.kind === 'line');
/** The stem: the vertical line through the beat that is not the bar line. */
const stemOf = ({ commands, layout }: Engraved) =>
  lines(commands).find(
    c =>
      c.x1 === c.x2 &&
      c.y1 !== c.y2 &&
      c.x1 !== layout.width &&
      Math.abs(c.x1 - layout.beats[0]!.x) < SPACE,
  );
const effectNote = (string: number, effect: Partial<NoteEffect>) =>
  note(string, 0, effect);

describe('noteheads for harmonics and ghost notes', () => {
  it('draws harmonics with diamond noteheads by duration', () => {
    const harmonic = { harmonic: { type: 'natural' as const, data: 0 } };
    expect(
      texts(one(effectNote(3, harmonic)).commands, G.noteheadDiamondBlack.text),
    ).toHaveLength(1);
    expect(
      texts(
        one(effectNote(3, harmonic), HALF).commands,
        G.noteheadDiamondHalf.text,
      ),
    ).toHaveLength(1);
    expect(
      texts(
        one(effectNote(3, harmonic), WHOLE).commands,
        G.noteheadDiamondWhole.text,
      ),
    ).toHaveLength(1);
    const artificial = one(
      effectNote(3, { harmonic: { type: 'artificial', data: 12 } }),
    ).commands;
    expect(texts(artificial, G.noteheadDiamondBlack.text)[0]!.y).toBe(yOf(2));
    expect(texts(artificial, SMUFL.noteheadBlack)).toHaveLength(0);
  });

  it('puts a ghost note in parentheses either side of its notehead, in the notehead colour', () => {
    // Act
    const { commands } = engrave(
      [beat(960, [effectNote(3, { ghostNote: true })])],
      { highlight: { beatIndex: 0 } },
    );

    // Assert
    const [head] = texts(commands, SMUFL.noteheadBlack);
    const [left] = texts(commands, G.noteheadParenthesisLeft.text);
    const [right] = texts(commands, G.noteheadParenthesisRight.text);
    expect(left!.x).toBeLessThan(head!.x);
    expect(right!.x).toBeGreaterThan(head!.x + 9);
    expect([left!.y, right!.y]).toEqual([head!.y, head!.y]);
    expect([left!.color, right!.color]).toEqual([
      PALETTE.accent,
      PALETTE.accent,
    ]);
  });

  it('keeps an accidental clear of the parentheses and ghost snare hits on the drum staff', () => {
    const sharp = one(note(1, 2, { ghostNote: true })).commands;
    const [accidental] = texts(sharp, SMUFL.accidentalSharp);
    expect(accidental!.x + 0.996 * SPACE).toBeLessThanOrEqual(
      texts(sharp, G.noteheadParenthesisLeft.text)[0]!.x,
    );
    const drums = engrave([beat(960, [note(1, 38, { ghostNote: true })])], {
      isPercussion: true,
    }).commands;
    expect(texts(drums, G.noteheadParenthesisLeft.text)[0]!.y).toBe(yOf(5));
  });
});

describe('articulations', () => {
  it('puts accents opposite the stem: under a stem-up note, over a stem-down note', () => {
    const low = texts(
      one(effectNote(3, { accentuatedNote: true })).commands,
      G.articAccentBelow.text,
    );
    expect(low).toHaveLength(1);
    expect(low[0]!.y).toBeGreaterThan(yOf(2));
    const high = texts(
      one(effectNote(1, { accentuatedNote: true })).commands,
      G.articAccentAbove.text,
    );
    expect(high[0]!.y).toBeLessThan(yOf(7));
    expect(high[0]).toMatchObject({ align: 'center', color: PALETTE.text });
  });

  it('stacks staccato nearest the notehead and the accent beyond it', () => {
    // Act
    const { commands } = one(
      effectNote(3, { staccato: true, heavyAccentuatedNote: true }),
    );

    // Assert
    const [dot] = texts(commands, G.articStaccatoBelow.text);
    const [marcato] = texts(commands, G.articMarcatoBelow.text);
    expect(dot!.y).toBeGreaterThan(yOf(2));
    expect(marcato!.y).toBeGreaterThan(dot!.y);
  });

  it('puts articulations of two voices on the stem side, beyond the stems', () => {
    // Arrange
    const base = beat(960, [effectNote(3, { accentuatedNote: true })]);
    const twoVoices: Beat = {
      ...base,
      voices: [
        base.voices[0]!,
        { ...base.voices[0]!, notes: [effectNote(6, { staccato: true })] },
      ],
    };

    // Act
    const { commands } = engrave([twoVoices]);

    // Assert
    const [above] = texts(commands, G.articAccentAbove.text);
    const [below] = texts(commands, G.articStaccatoBelow.text);
    expect(above!.y).toBeLessThan(yOf(2) - 3 * SPACE);
    expect(below!.y).toBeGreaterThan(yOf(-7) + 3 * SPACE);
  });

  it('puts the accent of a whole note over it', () => {
    expect(
      texts(
        one(effectNote(3, { accentuatedNote: true }), WHOLE).commands,
        G.articAccentAbove.text,
      ),
    ).toHaveLength(1);
  });
});

describe('tremolo picking', () => {
  it('crosses the stem with one stroke per beam of the picking value', () => {
    // Act
    const engraved = one(
      effectNote(3, {
        tremoloPicking: { duration: { ...QUARTER, value: 16 } },
      }),
    );

    // Assert
    const stem = stemOf(engraved)!;
    const [strokes] = texts(engraved.commands, TREMOLO_GLYPHS[1]!.text);
    expect(strokes!.x).toBe(stem.x1);
    expect(strokes!.y).toBeLessThan(Math.max(stem.y1, stem.y2));
    expect(strokes!.y).toBeGreaterThan(Math.min(stem.y1, stem.y2));
    expect(
      texts(
        one(
          effectNote(3, {
            tremoloPicking: { duration: { ...QUARTER, value: 8 } },
          }),
        ).commands,
        TREMOLO_GLYPHS[0]!.text,
      ),
    ).toHaveLength(1);
    expect(
      texts(
        one(
          effectNote(3, {
            tremoloPicking: { duration: { ...QUARTER, value: 32 } },
          }),
        ).commands,
        TREMOLO_GLYPHS[2]!.text,
      ),
    ).toHaveLength(1);
  });

  it('puts the strokes over a whole note, which has no stem', () => {
    const { commands, layout } = one(
      effectNote(3, { tremoloPicking: { duration: { ...QUARTER, value: 8 } } }),
      WHOLE,
    );
    const [strokes] = texts(commands, TREMOLO_GLYPHS[0]!.text);
    expect(strokes!.y).toBeLessThan(yOf(2) - SPACE);
    expect(Math.abs(strokes!.x - layout.beats[0]!.x)).toBeLessThan(1);
  });
});

describe('trills and vibrato', () => {
  it('writes tr over the staff with a wavy line to the end of the note', () => {
    // Act
    const trill = { fret: 2, duration: { ...QUARTER, value: 16 as const } };
    const { commands, layout } = engrave([
      beat(960, [effectNote(3, { trill })]),
      beat(1920, [note(3, 0)]),
    ]);

    // Assert
    const [tr] = texts(commands, G.ornamentTrill.text);
    const [wave] = texts(commands).filter(c =>
      c.text.startsWith(G.wiggleTrill.text),
    );
    expect(tr!.y).toBeLessThan(TOP);
    expect(wave!.x).toBeGreaterThan(tr!.x);
    expect(wave!.x).toBeLessThan(layout.beats[1]!.x);
  });

  it('draws one vibrato wave over the staff across consecutive notes with vibrato', () => {
    // Act
    const vibrato = { vibrato: true };
    const { commands, layout } = engrave([
      beat(960, [effectNote(3, vibrato)]),
      beat(1920, [effectNote(3, vibrato)]),
      beat(2880, [note(3, 0)]),
    ]);

    // Assert
    const waves = startingWith(commands, G.guitarVibratoStroke.text);
    expect(waves).toHaveLength(1);
    expect(waves[0]!.y).toBeLessThan(TOP);
    expect(waves[0]!.x).toBeLessThan(layout.beats[0]!.x);
    const reach =
      waves[0]!.x +
      waves[0]!.text.length * G.guitarVibratoStroke.advance * SPACE;
    expect(reach).toBeGreaterThan(layout.beats[1]!.x);
    expect(reach).toBeLessThan(layout.beats[2]!.x);
  });

  it('lifts the vibrato over high notes and runs it to the bar line at the end of the measure', () => {
    const { commands, layout } = engrave([
      beat(960, [note(1, 12, { vibrato: true })], WHOLE),
    ]);
    const [wave] = startingWith(commands, G.guitarVibratoStroke.text);
    expect(wave!.y).toBeLessThan(yOf(14) - SPACE);
    expect(
      wave!.x + wave!.text.length * G.guitarVibratoStroke.advance * SPACE,
    ).toBeGreaterThan(layout.width - 3 * SPACE);
  });
});

describe('strokes', () => {
  it('draws an arrow left of the chord pointing the way of the stroke', () => {
    // Arrange
    const chord = [note(1, 0), note(3, 0), note(5, 2)];

    // Act
    const up = engrave([
      { ...beat(960, chord), stroke: { direction: 'up', value: 8 } },
    ]);
    const down = engrave([
      { ...beat(960, chord), stroke: { direction: 'down', value: 8 } },
    ]);

    // Assert
    const [upHead] = up.commands.filter(c => c.kind === 'polygon');
    const [downHead] = down.commands.filter(c => c.kind === 'polygon');
    const leftmost = Math.min(
      ...texts(up.commands, SMUFL.noteheadBlack).map(c => c.x),
    );
    expect(upHead?.kind === 'polygon' && upHead.points[0]).toBeLessThan(
      leftmost,
    );
    expect(upHead?.kind === 'polygon' && upHead.points[1]).toBeLessThan(yOf(7));
    expect(downHead?.kind === 'polygon' && downHead.points[1]).toBeGreaterThan(
      yOf(-3),
    );
  });
});

describe('ornaments under an 8va mark', () => {
  it('lifts the vibrato over the 8va mark of very high notes', () => {
    // Act: written E7, drawn an octave lower under 8va
    const { commands } = one(note(1, 24, { vibrato: true }));

    // Assert
    const [ottava] = texts(commands, '8va');
    const [wave] = startingWith(commands, G.guitarVibratoStroke.text);
    expect(ottava).toBeDefined();
    expect(wave!.y).toBeLessThan(ottava!.y - 4);
  });
});
