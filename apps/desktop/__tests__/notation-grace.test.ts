import type { Grace, GraceTransition, Note } from '@gp-editor/core';
import { layoutMeasure } from '../src/lib/layout';
import {
  type DrawCommand,
  type LineCommand,
  SMUFL,
  type TextCommand,
} from '../src/score/draw';
import { NOTATION, engraveNotationMeasure } from '../src/score/notation';
import { TECHNIQUE_GLYPHS } from '../src/score/symbols/smufl';
import { PALETTE } from '../test-support/score-helpers';
import { beat, makeSong, note } from '../test-support/songs';

const TOP = NOTATION.above;
const SPACE = NOTATION.space;
const yOf = (position: number) => TOP + ((8 - position) * SPACE) / 2;
const SLASHED = TECHNIQUE_GLYPHS.graceNoteAcciaccaturaStemUp.text;
const ON_BEAT = TECHNIQUE_GLYPHS.graceNoteAppoggiaturaStemUp.text;

function grace(fret: number, overrides: Partial<Grace> = {}): Grace {
  return {
    fret,
    duration: 2,
    velocity: 95,
    transition: 'none',
    onBeat: false,
    isDead: false,
    ...overrides,
  };
}

function engrave(
  notes: Note[],
  options: { isPercussion?: boolean } = {},
): DrawCommand[] {
  const song = makeSong([[beat(960, notes)]]);
  const track = {
    ...song.tracks[0]!,
    isPercussion: options.isPercussion ?? false,
  };
  return engraveNotationMeasure({
    track,
    header: song.measureHeaders[0]!,
    measure: track.measures[0]!,
    layout: layoutMeasure(song, 0, 0),
    top: TOP,
    palette: PALETTE,
  });
}

const texts = (commands: readonly DrawCommand[], text: string): TextCommand[] =>
  commands.filter(
    (c): c is TextCommand => c.kind === 'text' && c.text === text,
  );

describe('grace notes', () => {
  it('draws a small slashed note on the grace pitch left of the main note', () => {
    // Act: G string, grace on fret 2 (A) before the open string (G)
    const commands = engrave([note(3, 0, { grace: grace(2) })]);

    // Assert
    const [small] = texts(commands, SLASHED);
    const [main] = texts(commands, SMUFL.noteheadBlack);
    expect(small).toMatchObject({
      y: yOf(3),
      font: 'music',
      color: PALETTE.text,
    });
    expect(
      small!.x +
        TECHNIQUE_GLYPHS.graceNoteAcciaccaturaStemUp.advance * SPACE * 0.6,
    ).toBeLessThan(main!.x);
  });

  it('draws an on-beat grace note without the slash', () => {
    const commands = engrave([
      note(3, 0, { grace: grace(2, { onBeat: true }) }),
    ]);
    expect(texts(commands, ON_BEAT)).toHaveLength(1);
    expect(texts(commands, SLASHED)).toHaveLength(0);
  });

  it('keeps clear of the main note’s accidental and gives the grace note its own, smaller', () => {
    // Act: F#5 main note after a G#5 grace note
    const commands = engrave([note(1, 2, { grace: grace(4) })]);

    // Assert
    const sharps = texts(commands, SMUFL.accidentalSharp);
    const main = sharps.find(c => c.y === yOf(8));
    const small = sharps.find(c => c.y === yOf(9));
    const [head] = texts(commands, SLASHED);
    expect(head!.x).toBeLessThan(main!.x);
    expect(small!.x).toBeLessThan(head!.x);
    expect(small!.size).toBeLessThan(main!.size);
  });

  it('gives a grace note above the staff short ledger lines', () => {
    const commands = engrave([note(1, 10, { grace: grace(12) })]);
    const [small] = texts(commands, SLASHED);
    const ledgers = commands.filter(
      (c): c is LineCommand =>
        c.kind === 'line' &&
        c.y1 === c.y2 &&
        c.x1 > 0 &&
        c.x2 <= small!.x + SPACE * 1.5 &&
        c.x1 >= small!.x - SPACE,
    );
    expect(small!.y).toBe(yOf(14));
    expect(ledgers.map(c => c.y1)).toEqual([yOf(10), yOf(12), yOf(14)]);
  });

  it.each<[GraceTransition, DrawCommand['kind']]>([
    ['hammer', 'curve'],
    ['slide', 'line'],
  ])('joins a %s grace note to its note', (transition, kind) => {
    const plain = engrave([note(3, 0, { grace: grace(2) })]);
    const joined = engrave([note(3, 0, { grace: grace(2, { transition }) })]);
    const count = (commands: DrawCommand[]) =>
      commands.filter(c => c.kind === kind).length;
    expect(count(joined)).toBe(count(plain) + 1);
  });

  it('places a grace note on the drum staff by its drum', () => {
    const commands = engrave([note(1, 38, { grace: grace(38) })], {
      isPercussion: true,
    });
    expect(texts(commands, SLASHED)[0]!.y).toBe(yOf(5));
  });
});
