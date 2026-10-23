import { QUARTER, durationTicks } from '@gp-editor/core';
import type { Beat, Duration } from '@gp-editor/core';
import { layoutMeasure } from '../src/lib/layout';
import {
  type DrawCommand,
  type LineCommand,
  SMUFL,
  type TextCommand,
} from '../src/score/draw';
import { NOTATION, engraveNotationMeasure } from '../src/score/notation';
import { TUPLET } from '../src/score/notation/metrics';
import { PALETTE } from '../test-support/score-helpers';
import { beat, header, makeSong, note, toTux } from '../test-support/songs';

const TOP = NOTATION.above;
const SPACE = NOTATION.space;
const yOf = (position: number) => TOP + ((8 - position) * SPACE) / 2;
const THREE = String.fromCodePoint(0xe883);
const triplet = (value: Duration['value'], dotted = false): Duration => ({
  ...QUARTER,
  value,
  dotted,
  tuplet: { enters: 3, times: 2 },
});

/** Beats one after the other from the start of the measure, on the G string (stems up) or high E (stems down). */
function run(
  durations: readonly Duration[],
  options: { rests?: readonly number[]; string?: number } = {},
): Beat[] {
  const ticks = (d: Duration) =>
    Math.floor(
      ((3840 / d.value) * (d.dotted ? 1.5 : 1) * d.tuplet.times) /
        d.tuplet.enters,
    );
  return durations.reduce<{ beats: Beat[]; start: number }>(
    ({ beats, start }, duration, i) => ({
      beats: [
        ...beats,
        beat(
          start,
          options.rests?.includes(i) ? [] : [note(options.string ?? 3, i % 3)],
          duration,
        ),
      ],
      start: start + ticks(duration),
    }),
    { beats: [], start: 960 },
  ).beats;
}

function engrave(beats: Beat[], numerator = 4): DrawCommand[] {
  const song = makeSong(
    [beats],
    [header(1, { timeSignature: { numerator, denominator: 4 } })],
  );
  const track = song.tracks[0]!;
  return engraveNotationMeasure({
    track,
    header: song.measureHeaders[0]!,
    measure: track.measures[0]!,
    layout: layoutMeasure(song, 0, 0),
    top: TOP,
    palette: PALETTE,
  });
}

const numbers = (commands: readonly DrawCommand[]): TextCommand[] =>
  commands.filter(
    (c): c is TextCommand => c.kind === 'text' && c.text === THREE,
  );
/** Bracket pieces: thin lines off the staff other than stems, ledger lines and staff lines. */
const bracketLines = (commands: readonly DrawCommand[]): LineCommand[] =>
  commands.filter(
    (c): c is LineCommand =>
      c.kind === 'line' && c.width < 1 && c.color === PALETTE.text,
  );

describe('tuplet groups', () => {
  it.each<[string, Duration[], number]>([
    [
      'three 16th triplets and a dotted 8th triplet',
      [triplet(16), triplet(16), triplet(16), triplet(8, true)],
      1,
    ],
    [
      'two 16th and two 8th triplets',
      [triplet(16), triplet(16), triplet(8), triplet(8)],
      1,
    ],
    ['a 16th and an 8th triplet', [triplet(16), triplet(8)], 1],
    ['six 8th triplets', Array.from({ length: 6 }, () => triplet(8)), 2],
    [
      'three 8th and three 32nd triplets',
      [
        triplet(8),
        triplet(8),
        triplet(8),
        triplet(32),
        triplet(32),
        triplet(32),
      ],
      2,
    ],
    [
      'ten 16th triplets and an 8th triplet',
      [...Array.from({ length: 10 }, () => triplet(16)), triplet(8)],
      4,
    ],
    [
      'two 8th triplets and a half triplet',
      [triplet(8), triplet(8), triplet(2)],
      1,
    ],
  ])('groups %s into %i', (_, durations, groups) => {
    expect(numbers(engrave(run(durations), 6))).toHaveLength(groups);
  });
});

describe('tuplet brackets', () => {
  it('brackets a tuplet of notes that are not beamed together, with the number in a gap', () => {
    // Act
    const commands = engrave(run([triplet(4), triplet(4), triplet(4)]));

    // Assert
    const [number] = numbers(commands);
    const pieces = bracketLines(commands);
    const horizontal = pieces.filter(c => c.y1 === c.y2);
    const hooks = pieces.filter(c => c.x1 === c.x2);
    expect(horizontal).toHaveLength(2);
    expect(hooks).toHaveLength(2);
    expect(horizontal[0]!.x2).toBeLessThan(number!.x);
    expect(horizontal[1]!.x1).toBeGreaterThan(number!.x);
    expect(horizontal[0]!.y1).toBeLessThan(number!.y);
    expect(horizontal[0]!.y1).toBeGreaterThan(number!.y - 1.5 * SPACE);
    expect(
      hooks.every(hook => Math.max(hook.y1, hook.y2) > horizontal[0]!.y1),
    ).toBe(true);
    expect(horizontal[0]!.y1).toBeLessThan(yOf(4) - 3 * SPACE);
  });

  it('leaves the bracket off a beamed tuplet', () => {
    const commands = engrave(run([triplet(8), triplet(8), triplet(8)]));
    expect(numbers(commands)).toHaveLength(1);
    expect(bracketLines(commands)).toHaveLength(0);
  });

  it('brackets a beamed tuplet that starts with a rest', () => {
    const commands = engrave(
      run([triplet(8), triplet(8), triplet(8)], { rests: [0] }),
    );
    expect(bracketLines(commands)).toHaveLength(4);
    expect(
      commands.some(c => c.kind === 'text' && c.text === SMUFL.rest8th),
    ).toBe(true);
  });

  it('brackets stems-down tuplets under the staff with hooks pointing up', () => {
    // Act
    const commands = engrave(
      run([triplet(4), triplet(4), triplet(4)], { string: 1 }),
    );

    // Assert
    const pieces = bracketLines(commands);
    const line = pieces.find(c => c.y1 === c.y2)!;
    expect(line.y1).toBeGreaterThan(yOf(0));
    expect(
      pieces
        .filter(c => c.x1 === c.x2)
        .every(hook => Math.min(hook.y1, hook.y2) < line.y1),
    ).toBe(true);
  });
});

describe('tuplets inside tuplets', () => {
  const FIVE = String.fromCodePoint(0xe885);
  const quintuplet = (value: Duration['value']): Duration => ({
    ...QUARTER,
    value,
    tuplet: { enters: 5, times: 4 },
  });
  const nested = (value: Duration['value']): Duration => ({
    ...quintuplet(value),
    innerTuplet: { enters: 3, times: 2 },
  });
  /** A quintuplet whose second, third and fourth notes are a triplet inside it. */
  const group = (value: Duration['value']) => [
    quintuplet(value),
    nested(value),
    nested(value),
    nested(value),
    quintuplet(value),
    quintuplet(value),
  ];
  /** Beats one after the other from the measure start, at exact positions. */
  const exactRun = (durations: readonly Duration[]): Beat[] =>
    durations.reduce<{ beats: Beat[]; start: number }>(
      ({ beats, start }, duration, i) => ({
        beats: [...beats, beat(start, [note(3, i % 3)], duration)],
        start: start + toTux(durationTicks(duration)),
      }),
      { beats: [], start: 960 },
    ).beats;
  const textsOf = (commands: readonly DrawCommand[], digit: string) =>
    commands.filter(
      (c): c is TextCommand => c.kind === 'text' && c.text === digit,
    );

  it('numbers a beamed triplet inside a quintuplet: the 3 next to the notes, the 5 beyond it', () => {
    // Act
    const commands = engrave(exactRun(group(16)));

    // Assert
    const [five] = textsOf(commands, FIVE);
    const [three] = textsOf(commands, THREE);
    expect(textsOf(commands, FIVE)).toHaveLength(1);
    expect(textsOf(commands, THREE)).toHaveLength(1);
    expect(five!.y).toBeLessThan(three!.y - TUPLET.height);
    expect(bracketLines(commands)).toHaveLength(0);
  });

  it('brackets an unbeamed triplet inside a quintuplet inside the quintuplet’s bracket', () => {
    // Act
    const commands = engrave(exactRun(group(4)));

    // Assert
    const lines = bracketLines(commands).filter(c => c.y1 === c.y2);
    const [five] = textsOf(commands, FIVE);
    const [three] = textsOf(commands, THREE);
    expect(lines).toHaveLength(4);
    const outer = lines.filter(c => Math.abs(c.y1 - lines[0]!.y1) < 0.01);
    const inner = lines.filter(c => c.y1 > lines[0]!.y1 + 0.01);
    expect(outer).toHaveLength(2);
    expect(inner).toHaveLength(2);
    expect(five!.y).toBeLessThan(three!.y);
    expect(Math.min(...inner.map(c => c.x1))).toBeGreaterThan(
      Math.min(...outer.map(c => c.x1)),
    );
  });
});
