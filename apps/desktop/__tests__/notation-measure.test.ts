import { QUARTER } from '@gp-editor/core';
import type {
  Beat,
  Clef,
  Duration,
  MeasureHeader,
  Note,
  Song,
  Voice,
} from '@gp-editor/core';
import { type MeasureLayout, layoutMeasure } from '../src/lib/layout';
import {
  type CircleCommand,
  type CurveCommand,
  type DrawCommand,
  type LineCommand,
  type PolygonCommand,
  type RectCommand,
  SMUFL,
  type TextCommand,
} from '../src/score/draw';
import {
  NOTATION,
  type NotationContext,
  engraveNotationMeasure,
} from '../src/score/notation';
import { OTTAVA } from '../src/score/notation/metrics';
import { CHROME, type Palette } from '../src/theme';
import { beat, header, makeSong, note } from '../test-support/songs';

const PALETTE: Palette = {
  background: '#000001',
  sidebar: '#000002',
  paper: '#FFFFFF',
  text: '#111111',
  muted: '#222222',
  line: '#333333',
  accent: '#FF0000',
  accentText: '#444444',
  selection: '#555555',
  danger: '#666666',
  border: '#777777',
  desk: '#FFFFFF',
  ...CHROME,
};
const TOP = NOTATION.above;
const SPACE = NOTATION.space;
const TUPLET_THREE = String.fromCodePoint(0xe883);

const WHOLE: Duration = { ...QUARTER, value: 1 };
const HALF: Duration = { ...QUARTER, value: 2 };
const EIGHTH: Duration = { ...QUARTER, value: 8 };
const SIXTEENTH: Duration = { ...QUARTER, value: 16 };
const DOTTED_QUARTER: Duration = { ...QUARTER, dotted: true };
const TRIPLET_EIGHTH: Duration = { ...EIGHTH, tuplet: { enters: 3, times: 2 } };

/** y of a staff position: 0 = bottom line, 8 = top line. */
const yOf = (position: number) => TOP + ((8 - position) * SPACE) / 2;

interface EngraveOptions {
  readonly keys?: readonly number[];
  readonly clef?: Clef;
  readonly isPercussion?: boolean;
  readonly strings?: readonly number[];
  readonly headers?: MeasureHeader[];
  readonly highlight?: NotationContext['highlight'];
}

interface Engraved {
  readonly commands: DrawCommand[];
  readonly layout: MeasureLayout;
}

function songWith(measures: Beat[][], options: EngraveOptions): Song {
  const song = makeSong(measures, options.headers);
  const track = song.tracks[0]!;
  const strings =
    options.strings?.map((tuning, i) => ({ number: i + 1, tuning })) ??
    track.strings;
  const trackMeasures = track.measures.map((measure, i) => ({
    ...measure,
    clef: options.clef ?? measure.clef,
    keySignature: options.keys?.[i] ?? measure.keySignature,
  }));
  return {
    ...song,
    tracks: [
      {
        ...track,
        strings,
        isPercussion: options.isPercussion ?? false,
        measures: trackMeasures,
      },
    ],
  };
}

/** Engrave the last measure of `measures` (the earlier ones are its predecessors). */
function engrave(measures: Beat[][], options: EngraveOptions = {}): Engraved {
  const song = songWith(measures, options);
  const track = song.tracks[0]!;
  const measureIndex = measures.length - 1;
  const layout = layoutMeasure(song, 0, measureIndex);
  const commands = engraveNotationMeasure({
    track,
    header: song.measureHeaders[measureIndex]!,
    measure: track.measures[measureIndex]!,
    layout,
    previousMeasure: track.measures[measureIndex - 1],
    top: TOP,
    palette: PALETTE,
    highlight: options.highlight,
  });
  return { commands, layout };
}

function texts(commands: readonly DrawCommand[], text?: string): TextCommand[] {
  return commands.filter(
    (c): c is TextCommand =>
      c.kind === 'text' && (text === undefined || c.text === text),
  );
}

function ofKind<K extends DrawCommand['kind']>(
  commands: readonly DrawCommand[],
  kind: K,
): Extract<DrawCommand, { kind: K }>[] {
  return commands.filter(
    (c): c is Extract<DrawCommand, { kind: K }> => c.kind === kind,
  );
}

const NOTEHEADS: readonly string[] = [
  SMUFL.noteheadBlack,
  SMUFL.noteheadHalf,
  SMUFL.noteheadWhole,
  SMUFL.noteheadXBlack,
];
const heads = (commands: readonly DrawCommand[]) =>
  texts(commands).filter(c => NOTEHEADS.includes(c.text));

/** Stems: vertical lines other than bar lines. */
function stems(engraved: Engraved): LineCommand[] {
  return ofKind(engraved.commands, 'line').filter(
    c => c.x1 === c.x2 && c.y1 !== c.y2 && c.x1 !== engraved.layout.width,
  );
}

/** Short horizontal lines off the five staff lines. */
function ledgerLines(commands: readonly DrawCommand[]): LineCommand[] {
  return ofKind(commands, 'line').filter(c => c.y1 === c.y2 && c.x1 > 0);
}

function voice(notes: Note[], duration: Duration = QUARTER): Voice {
  return { duration, notes, isEmpty: false, direction: 'none' };
}

function twoVoices(start: number, first: Voice, second: Voice): Beat {
  return { ...beat(start, []), voices: [first, second] };
}

const tied = (n: Note): Note => ({ ...n, isTied: true });

describe('staff, bar lines and time signature', () => {
  it('draws five staff lines across the measure and a bar line at its right edge', () => {
    // Arrange
    const measures = [[beat(960, [note(1, 0)])]];

    // Act
    const { commands, layout } = engrave(measures);

    // Assert
    const staff = ofKind(commands, 'line').filter(
      c => c.color === PALETTE.line && c.x1 === 0,
    );
    expect(staff.map(c => c.y1)).toEqual(
      [0, 1, 2, 3, 4].map(i => TOP + i * SPACE),
    );
    expect(staff.every(c => c.x2 === layout.width)).toBe(true);
    const bar = ofKind(commands, 'line').find(
      c => c.x1 === layout.width && c.x2 === layout.width,
    );
    expect(bar).toMatchObject({
      y1: TOP,
      y2: TOP + 4 * SPACE,
      color: PALETTE.text,
    });
  });

  it('draws thick bars and dots for repeats', () => {
    const { commands } = engrave([[beat(960, [note(1, 0)])]], {
      headers: [header(1, { repeatOpen: true, repeatClose: 2 })],
    });
    expect(ofKind(commands, 'rect')).toHaveLength(2);
    const dots = ofKind(commands, 'circle');
    expect(dots).toHaveLength(4);
    expect(new Set(dots.map((dot: CircleCommand) => dot.y))).toEqual(
      new Set([yOf(5), yOf(3)]),
    );
  });

  it('writes the time signature with SMuFL digits only where it is shown', () => {
    const first = engrave([[beat(960, [note(1, 0)])]]);
    const four = String.fromCodePoint(SMUFL.timeSigDigit0 + 4);
    const digits = texts(first.commands, four);
    expect(digits.map(c => c.y)).toEqual([yOf(6), yOf(2)]);
    expect(digits[0]!.x).toBeGreaterThan(first.layout.timeSignatureX!);
    const second = engrave([
      [beat(960, [note(1, 0)])],
      [beat(4800, [note(1, 0)])],
    ]);
    expect(texts(second.commands, four)).toHaveLength(0);
  });
});

describe('noteheads and accidentals', () => {
  it('writes guitar notes an octave above their sounding pitch', () => {
    const { commands, layout } = engrave([
      [beat(960, [note(1, 0)]), beat(1920, [note(6, 0)])],
    ]);
    const [high, low] = heads(commands);
    expect(high).toMatchObject({
      y: yOf(7),
      text: SMUFL.noteheadBlack,
      font: 'music',
      size: 4 * SPACE,
    });
    expect(low!.y).toBe(yOf(-7));
    expect(high!.x).toBeLessThan(layout.beats[0]!.x);
    expect(high!.x + 9.44).toBeGreaterThan(layout.beats[0]!.x);
  });

  it('chooses the notehead by duration and draws x heads for dead notes', () => {
    const whole = heads(engrave([[beat(960, [note(1, 0)], WHOLE)]]).commands);
    const half = heads(engrave([[beat(960, [note(1, 0)], HALF)]]).commands);
    const dead = heads(
      engrave([[beat(960, [note(1, 0, { deadNote: true })])]]).commands,
    );
    expect(whole[0]!.text).toBe(SMUFL.noteheadWhole);
    expect(half[0]!.text).toBe(SMUFL.noteheadHalf);
    expect(dead[0]!.text).toBe(SMUFL.noteheadXBlack);
  });

  it('carries accidentals through the measure and cancels them with naturals', () => {
    // Arrange: F#5, F#5, F5 (written)
    const measures = [
      [
        beat(960, [note(1, 2)]),
        beat(1920, [note(1, 2)]),
        beat(2880, [note(1, 1)]),
      ],
    ];

    // Act
    const { commands } = engrave(measures);

    // Assert
    const sharps = texts(commands, SMUFL.accidentalSharp);
    const naturals = texts(commands, SMUFL.accidentalNatural);
    expect(sharps).toHaveLength(1);
    expect(naturals).toHaveLength(1);
    expect(sharps[0]!.y).toBe(yOf(8));
    expect(sharps[0]!.x).toBeLessThan(heads(commands)[0]!.x);
  });

  it('spells with flats in flat keys and leaves notes of the key alone', () => {
    const { commands } = engrave(
      [[beat(960, [note(1, 6)]), beat(1920, [note(1, 2)])]],
      { keys: [-1] },
    );
    const flats = texts(commands, SMUFL.accidentalFlat);
    expect(flats).toHaveLength(1);
    expect(flats[0]!.y).toBe(yOf(9));
    expect(heads(commands).map(c => c.y)).toEqual([yOf(11), yOf(9)]);
  });
});

describe('ledger lines and octave shifts', () => {
  it('draws ledger lines below and above the staff', () => {
    const low = engrave([[beat(960, [note(6, 0)])]]);
    expect(ledgerLines(low.commands).map(c => c.y1)).toEqual([
      yOf(-2),
      yOf(-4),
      yOf(-6),
    ]);
    const high = engrave([[beat(960, [note(1, 12)])]]);
    expect(ledgerLines(high.commands).map(c => c.y1)).toEqual([
      yOf(10),
      yOf(12),
      yOf(14),
    ]);
  });

  it('moves very high and very low notes by octaves with an 8va / 8vb mark', () => {
    const high = engrave([[beat(960, [note(1, 22)])]]);
    expect(heads(high.commands)[0]!.y).toBe(yOf(13));
    expect(texts(high.commands, '8va')).toHaveLength(1);
    const low = engrave([[beat(960, [note(7, 0)])]], {
      strings: [64, 59, 55, 50, 45, 40, 33],
    });
    expect(heads(low.commands)[0]!.y).toBe(yOf(-4));
    expect(texts(low.commands, '8vb')).toHaveLength(1);
  });

  it('shifts a whole voice by one octave and brackets it with a single mark', () => {
    // Arrange: D7, E6, E5 written; the D7 needs the shift and the voice fits once shifted.
    const measures = [
      [
        beat(960, [note(1, 22)]),
        beat(1920, [note(1, 12)]),
        beat(2880, [note(1, 0)]),
      ],
    ];

    // Act
    const { commands } = engrave(measures);

    // Assert
    expect(heads(commands).map(c => c.y)).toEqual([yOf(13), yOf(7), yOf(0)]);
    expect(texts(commands, '8va')).toHaveLength(1);
    const bracket = ofKind(commands, 'line').filter(
      c => c.width === OTTAVA.lineWidth,
    );
    expect(bracket).toHaveLength(2);
    expect(Math.max(...bracket.map(c => c.y1))).toBeLessThan(yOf(13));
  });

  it('brackets low passages with 8vb under the staff', () => {
    const sevenString = { strings: [64, 59, 55, 50, 45, 40, 33] };
    const { commands } = engrave(
      [[beat(960, [note(7, 0)]), beat(1920, [note(7, 2)])]],
      sevenString,
    );
    expect(heads(commands).map(c => c.y)).toEqual([yOf(-4), yOf(-3)]);
    const [mark] = texts(commands, '8vb');
    expect(mark!.y).toBeGreaterThan(yOf(-4));
    const hook = ofKind(commands, 'line').find(
      c => c.width === OTTAVA.lineWidth && c.x1 === c.x2,
    );
    expect(hook!.y2).toBeLessThan(hook!.y1);
  });

  it('shifts chords one by one when the voice spans too far for one shift', () => {
    const { commands } = engrave([
      [beat(960, [note(1, 22)]), beat(1920, [note(6, 0)])],
    ]);
    expect(heads(commands).map(c => c.y)).toEqual([yOf(13), yOf(-7)]);
    expect(texts(commands, '8va')).toHaveLength(1);
  });
});

describe('chords', () => {
  it('keeps accidentals of a chord apart and shares a column when they are far apart', () => {
    const close = texts(
      engrave([[beat(960, [note(1, 2), note(2, 2)])]]).commands,
      SMUFL.accidentalSharp,
    );
    expect(close).toHaveLength(2);
    expect(close[0]!.x).not.toBe(close[1]!.x);
    const far = texts(
      engrave([[beat(960, [note(1, 2), note(4, 4)])]]).commands,
      SMUFL.accidentalSharp,
    );
    expect(far[0]!.x).toBe(far[1]!.x);
  });

  it('places seconds of a chord on both sides of the stem', () => {
    // E5 + F5 written: stem down, the lower note moves left of the stem.
    const engraved = engrave([[beat(960, [note(1, 0), note(2, 6)])]]);
    const [lower, upper] = [...heads(engraved.commands)].sort(
      (a, b) => b.y - a.y,
    );
    expect(upper!.x - lower!.x).toBeCloseTo(9.44 - 1, 1);
    const [stem] = stems(engraved);
    expect(stem!.x1).toBeGreaterThan(lower!.x);
    expect(stem!.x1).toBeLessThan(upper!.x + 1);
  });
});

describe('stems', () => {
  it('stems low notes up on the right and high notes down on the left, 3.5 spaces long', () => {
    const engraved = engrave([
      [beat(960, [note(3, 0)]), beat(1920, [note(1, 0)])],
    ]);
    const [up, down] = stems(engraved);
    const [low, high] = heads(engraved.commands);
    expect(up!.x1).toBeGreaterThan(engraved.layout.beats[0]!.x);
    expect(Math.min(up!.y1, up!.y2)).toBeCloseTo(yOf(2) - 3.5 * SPACE, 5);
    expect(Math.max(up!.y1, up!.y2)).toBeLessThan(low!.y);
    expect(down!.x1).toBeLessThan(engraved.layout.beats[1]!.x);
    expect(Math.max(down!.y1, down!.y2)).toBeCloseTo(yOf(7) + 3.5 * SPACE, 5);
    expect(Math.min(down!.y1, down!.y2)).toBeGreaterThan(high!.y);
  });

  it('extends stems of notes far outside the staff to the middle line', () => {
    const [stem] = stems(engrave([[beat(960, [note(6, 0)])]]));
    expect(Math.min(stem!.y1, stem!.y2)).toBe(yOf(4));
  });

  it('spans every notehead of a chord with one stem', () => {
    const engraved = engrave([
      [beat(960, [note(1, 0), note(3, 0), note(6, 0)])],
    ]);
    expect(stems(engraved)).toHaveLength(1);
    const [stem] = stems(engraved);
    expect(Math.max(stem!.y1, stem!.y2)).toBeGreaterThan(yOf(-7) - SPACE);
    expect(Math.min(stem!.y1, stem!.y2)).toBeLessThan(yOf(7));
  });

  it('stems the first voice up and the second voice down when both are present', () => {
    const engraved = engrave([
      [twoVoices(960, voice([note(1, 3)]), voice([note(1, 0)]))],
    ]);
    const [first, second] = stems(engraved);
    expect(first!.x1).toBeGreaterThan(engraved.layout.beats[0]!.x);
    expect(Math.min(first!.y1, first!.y2)).toBeLessThan(yOf(9));
    expect(second!.x1).toBeLessThan(engraved.layout.beats[0]!.x);
    expect(Math.max(second!.y1, second!.y2)).toBeGreaterThan(yOf(7));
  });

  it('draws no stem for whole notes', () => {
    expect(stems(engrave([[beat(960, [note(1, 0)], WHOLE)]]))).toHaveLength(0);
  });
});

describe('beams and flags', () => {
  it('beams eighths in the same beat and gives a lone eighth a flag', () => {
    const beamed = engrave([
      [beat(960, [note(1, 0)], EIGHTH), beat(1440, [note(1, 0)], EIGHTH)],
    ]);
    expect(ofKind(beamed.commands, 'polygon')).toHaveLength(1);
    expect(
      texts(beamed.commands).filter(c =>
        (SMUFL.flagDown as readonly string[]).includes(c.text),
      ),
    ).toHaveLength(0);
    const flagged = engrave([
      [beat(960, [note(6, 0)], EIGHTH), beat(1440, [note(6, 0)])],
    ]);
    expect(texts(flagged.commands, SMUFL.flagUp[0])).toHaveLength(1);
    expect(ofKind(flagged.commands, 'polygon')).toHaveLength(0);
  });

  it('draws one flag glyph per note value', () => {
    const flagged = engrave([[beat(960, [note(1, 0)], SIXTEENTH)]]);
    expect(texts(flagged.commands, SMUFL.flagDown[1])).toHaveLength(1);
  });

  it('adds secondary beams for sixteenths and joins stems to the beam', () => {
    // Arrange
    const run = [0, 1, 2, 3].map(i =>
      beat(960 + i * 240, [note(1, i)], SIXTEENTH),
    );

    // Act
    const engraved = engrave([run]);

    // Assert
    const beams = ofKind(engraved.commands, 'polygon');
    expect(beams).toHaveLength(2);
    const ends = stems(engraved).map(stem => Math.max(stem.y1, stem.y2));
    const outer = beams[0]!.points;
    const beamY = (x: number) =>
      outer[1]! +
      ((outer[3]! - outer[1]!) * (x - outer[0]!)) / (outer[2]! - outer[0]!);
    stems(engraved).forEach((stem, i) =>
      expect(ends[i]).toBeCloseTo(beamY(stem.x1), 5),
    );
  });

  it('points all stems of a beam group the same way', () => {
    const engraved = engrave([
      [beat(960, [note(6, 0)], EIGHTH), beat(1440, [note(1, 3)], EIGHTH)],
    ]);
    const [first, second] = stems(engraved);
    const xOffset = (stem: LineCommand, i: number) =>
      stem.x1 - engraved.layout.beats[i]!.x;
    expect(Math.sign(xOffset(first!, 0))).toBe(Math.sign(xOffset(second!, 1)));
  });
});

describe('tuplets and dots after flags', () => {
  it('writes the tuplet number over a triplet', () => {
    const triplet = [0, 1, 2].map(i =>
      beat(960 + i * 320, [note(6, i)], TRIPLET_EIGHTH),
    );
    const { commands } = engrave([triplet]);
    const numbers = texts(commands, TUPLET_THREE);
    expect(numbers).toHaveLength(1);
    expect(numbers[0]!.y).toBeLessThan(yOf(4));
  });

  it('writes the tuplet number under a group with stems down, once per complete group', () => {
    const triplets = [0, 1, 2, 3, 4, 5].map(i =>
      beat(960 + i * 320, [note(1, i)], TRIPLET_EIGHTH),
    );
    const numbers = texts(engrave([triplets]).commands, TUPLET_THREE);
    expect(numbers).toHaveLength(2);
    expect(numbers.every(c => c.y > yOf(0))).toBe(true);
  });

  it('puts the dot of a flagged up-stem note past the flag', () => {
    const engraved = engrave([
      [beat(960, [note(3, 0)], { ...EIGHTH, dotted: true })],
    ]);
    const [flag] = texts(engraved.commands, SMUFL.flagUp[0]);
    const [dot] = texts(engraved.commands, SMUFL.augmentationDot);
    expect(dot!.x).toBeGreaterThan(flag!.x + 8);
  });
});

describe('rests and dots', () => {
  it('centres rests on the staff and hangs the whole rest from the fourth line', () => {
    const quarter = engrave([[beat(960, [])]]);
    expect(texts(quarter.commands, SMUFL.restQuarter)[0]).toMatchObject({
      x: quarter.layout.beats[0]!.x,
      y: yOf(4),
      align: 'center',
    });
    const whole = engrave([[beat(960, [], WHOLE)]]);
    expect(texts(whole.commands, SMUFL.restWhole)[0]!.y).toBe(yOf(6));
    const glyphs = [
      SMUFL.restHalf,
      SMUFL.rest8th,
      SMUFL.rest16th,
      SMUFL.rest32nd,
      SMUFL.rest64th,
    ];
    [2, 8, 16, 32, 64].forEach((value, i) => {
      const rest = engrave([
        [beat(960, [], { ...QUARTER, value: value as Duration['value'] })],
      ]);
      expect(texts(rest.commands, glyphs[i])).toHaveLength(1);
    });
  });

  it('moves rests of two voices apart', () => {
    const { commands } = engrave([[twoVoices(960, voice([]), voice([]))]]);
    expect(texts(commands, SMUFL.restQuarter).map(c => c.y)).toEqual([
      yOf(8),
      yOf(0),
    ]);
  });

  it('draws a whole rest in an empty measure, clear of key and time signatures', () => {
    const first = engrave([[]]);
    const [rest] = texts(first.commands, SMUFL.restWhole);
    expect(rest!.y).toBe(yOf(6));
    expect(rest!.x).toBeGreaterThan(first.layout.timeSignatureX! + 22);
    expect(rest!.x).toBeLessThan(first.layout.width);
    const keyChange = engrave([[], []], { keys: [0, 7] });
    const lastSharp = Math.max(
      ...texts(keyChange.commands, SMUFL.accidentalSharp).map(c => c.x),
    );
    expect(
      texts(keyChange.commands, SMUFL.restWhole)[0]!.x - SPACE,
    ).toBeGreaterThan(lastSharp + SPACE);
  });

  it('puts augmentation dots in the space right of the notehead', () => {
    const onLine = engrave([[beat(960, [note(1, 1)], DOTTED_QUARTER)]]);
    const [dot] = texts(onLine.commands, SMUFL.augmentationDot);
    expect(dot!.y).toBe(yOf(9));
    expect(dot!.x).toBeGreaterThan(heads(onLine.commands)[0]!.x + 9);
    const inSpace = engrave([
      [beat(960, [note(1, 0)], { ...QUARTER, doubleDotted: true })],
    ]);
    expect(
      texts(inSpace.commands, SMUFL.augmentationDot).map(c => c.y),
    ).toEqual([yOf(7), yOf(7)]);
    const rest = engrave([[beat(960, [], DOTTED_QUARTER)]]);
    expect(texts(rest.commands, SMUFL.augmentationDot)).toHaveLength(1);
  });
});

describe('ties', () => {
  it('ties a note to the previous note on the same string', () => {
    // Arrange
    const measures = [
      [beat(960, [note(1, 0)]), beat(1920, [tied(note(1, 0))])],
    ];

    // Act
    const { commands } = engrave(measures);

    // Assert
    const [tie] = ofKind(commands, 'curve');
    const [first, second] = heads(commands);
    expect(ofKind(commands, 'curve')).toHaveLength(1);
    expect(tie!.x1).toBeGreaterThan(first!.x);
    expect(tie!.x2).toBeLessThan(second!.x);
    expect(tie!.cy).not.toBe(tie!.y1);
  });

  it('draws a short arc into a note tied across the bar line', () => {
    const { commands } = engrave([
      [beat(960, [note(1, 0)])],
      [beat(4800, [tied(note(1, 0))])],
    ]);
    const [tie] = ofKind(commands, 'curve');
    expect(tie).toBeDefined();
    expect((tie as CurveCommand).x1).toBeGreaterThanOrEqual(0);
    expect((tie as CurveCommand).x2).toBeLessThan(heads(commands)[0]!.x);
  });

  it('draws no tie without a previous note on the string', () => {
    expect(
      ofKind(engrave([[beat(960, [tied(note(1, 0))])]]).commands, 'curve'),
    ).toHaveLength(0);
    expect(
      ofKind(
        engrave([[beat(960, [note(2, 0)])], [beat(4800, [tied(note(1, 0))])]])
          .commands,
        'curve',
      ),
    ).toHaveLength(0);
  });

  it('curves ties of two voices away from each other', () => {
    const first = twoVoices(960, voice([note(1, 3)]), voice([note(3, 0)]));
    const second = twoVoices(
      1920,
      voice([tied(note(1, 3))]),
      voice([tied(note(3, 0))]),
    );
    const curves = ofKind(engrave([[first, second]]).commands, 'curve');
    expect(curves.map(tie => Math.sign(tie.cy - tie.y1))).toEqual([-1, 1]);
  });

  it('curves ties of a chord away from each other', () => {
    const chord = [note(1, 0), note(3, 0)];
    const { commands } = engrave([
      [beat(960, chord), beat(1920, chord.map(tied))],
    ]);
    const sides = ofKind(commands, 'curve').map(tie =>
      Math.sign(tie.cy - tie.y1),
    );
    expect(new Set(sides)).toEqual(new Set([1, -1]));
  });
});

describe('highlight', () => {
  const measures = [
    [beat(960, [note(1, 0), note(3, 0)]), beat(1920, [note(1, 0), note(3, 0)])],
  ];

  it('colours the noteheads of the highlighted beat', () => {
    const { commands } = engrave(measures, { highlight: { beatIndex: 1 } });
    expect(heads(commands).map(c => c.color)).toEqual([
      PALETTE.text,
      PALETTE.text,
      PALETTE.accent,
      PALETTE.accent,
    ]);
  });

  it('colours only the note on the highlighted string', () => {
    const { commands } = engrave(measures, {
      highlight: { beatIndex: 0, string: 3 },
    });
    const accented = heads(commands).filter(c => c.color === PALETTE.accent);
    expect(accented).toHaveLength(1);
    expect(accented[0]!.y).toBe(yOf(2));
  });

  it('colours a highlighted rest', () => {
    const { commands } = engrave([[beat(960, [])]], {
      highlight: { beatIndex: 0 },
    });
    expect(texts(commands, SMUFL.restQuarter)[0]!.color).toBe(PALETTE.accent);
  });
});

describe('key changes, percussion and bass clef', () => {
  it('cancels the old key with naturals when the key changes to C', () => {
    const { commands, layout } = engrave([[], []], { keys: [2, 0] });
    const naturals = texts(commands, SMUFL.accidentalNatural);
    expect(naturals.map(c => c.y)).toEqual([yOf(8), yOf(5)]);
    expect(naturals.every(c => c.x >= layout.keySignatureX!)).toBe(true);
  });

  it('draws the new key signature where the key changes', () => {
    const sharps = engrave([[], []], { keys: [0, 3] });
    expect(texts(sharps.commands, SMUFL.accidentalSharp).map(c => c.y)).toEqual(
      [yOf(8), yOf(5), yOf(9)],
    );
    const flats = engrave([[], []], { keys: [0, -2], clef: 'bass' });
    expect(texts(flats.commands, SMUFL.accidentalFlat).map(c => c.y)).toEqual([
      yOf(2),
      yOf(5),
    ]);
  });

  it('places drums on a percussion staff with x heads for cymbals and no accidentals', () => {
    const { commands } = engrave(
      [[beat(960, [note(1, 36), note(2, 42)]), beat(1920, [note(1, 61)])]],
      { isPercussion: true },
    );
    const [kick, hiHat, unknown] = heads(commands);
    expect(kick).toMatchObject({ y: yOf(1), text: SMUFL.noteheadBlack });
    expect(hiHat).toMatchObject({ y: yOf(9), text: SMUFL.noteheadXBlack });
    expect(unknown!.y).toBe(yOf(4));
    expect(texts(commands, SMUFL.accidentalSharp)).toHaveLength(0);
  });

  it('writes bass notes on the bass clef an octave up', () => {
    const { commands } = engrave([[beat(960, [note(4, 0)])]], {
      strings: [43, 38, 33, 28],
      clef: 'bass',
    });
    expect(heads(commands)[0]!.y).toBe(yOf(-2));
    expect(ledgerLines(commands)).toHaveLength(1);
  });
});

describe('command budget', () => {
  it('keeps a plain quarter-note measure small', () => {
    const measure = [0, 1, 2, 3].map(i => beat(960 + i * 960, [note(1, i)]));
    const { commands } = engrave([[], measure]);
    expect(commands.length).toBeLessThanOrEqual(5 + 1 + 4 * 3);
    const polygons: PolygonCommand[] = ofKind(commands, 'polygon');
    const rects: RectCommand[] = ofKind(commands, 'rect');
    expect(polygons.length + rects.length).toBe(0);
  });
});
