import { describe, expect, it } from 'vitest';
import { NORMAL_TUPLET, NOTE_VALUES, durationTicks, isMeasureOverfull, measureTicks, roundTempo, tupletOf } from '../src/model/defaults';
import { type Duration, QUARTER_TIME, type Song, type Tuplet } from '../src/model/song';
import { buildSong, n, play, rest } from './helpers/edit-songs';

function firstMeasure(song: Song) {
  const header = song.measureHeaders[0];
  const measure = song.tracks[0]?.measures[0];
  if (header === undefined || measure === undefined) {
    throw new Error('test song has no first measure');
  }
  return { header, measure };
}

describe('isMeasureOverfull', () => {
  it('is false for a full and for an incomplete measure', () => {
    const full = firstMeasure(buildSong({ tracks: [[[[play(2, n(1, 0)), rest(2)]]]] }));
    const incomplete = firstMeasure(buildSong({ tracks: [[[[play(4, n(1, 0))]]]] }));
    expect(isMeasureOverfull(full.measure, full.header)).toBe(false);
    expect(isMeasureOverfull(incomplete.measure, incomplete.header)).toBe(false);
  });

  it('is true when any voice runs past the end of the measure', () => {
    // Arrange: 4/4 with five quarters in the second voice
    const song = buildSong({ tracks: [[[[play(1, n(1, 0))], [play(4, n(4, 0)), play(4, n(4, 1)), play(4, n(4, 2)), play(4, n(4, 3)), play(4, n(4, 4))]]]] });

    // Act
    const { header, measure } = firstMeasure(song);

    // Assert
    expect(isMeasureOverfull(measure, header)).toBe(true);
  });
});

describe('tupletOf', () => {
  it.each([
    [3, 2],
    [5, 4],
    [6, 4],
    [7, 4],
    [9, 8],
    [10, 8],
    [11, 8],
    [12, 8],
  ])('gives the tuplet of %i notes Guitar Pro stores: in the time of %i', (enters, times) => {
    // Act / Assert
    expect(tupletOf(enters)).toEqual({ enters, times });
  });

  it('gives no tuplet for one note', () => {
    expect(tupletOf(1)).toBe(NORMAL_TUPLET);
  });

  it.each([0, 2, 4, 8, 13, 2.5, -3, Number.NaN])('knows no tuplet of %d notes', (enters) => {
    expect(tupletOf(enters)).toBeUndefined();
  });
});

/** Every tuplet Guitar Pro stores: GP3–GP8's 3:2 … 12:8 and GP5's 13:8. */
const GP_TUPLETS: readonly Tuplet[] = [
  { enters: 3, times: 2 },
  { enters: 5, times: 4 },
  { enters: 6, times: 4 },
  { enters: 7, times: 4 },
  { enters: 9, times: 8 },
  { enters: 10, times: 8 },
  { enters: 11, times: 8 },
  { enters: 12, times: 8 },
  { enters: 13, times: 8 },
];

const DOTS = [
  { dotted: false, doubleDotted: false },
  { dotted: true, doubleDotted: false },
  { dotted: false, doubleDotted: true },
] as const;

/** Nested pairs whose length is not a whole number of ticks: the same prime 7, 11 or 13 twice (see QUARTER_TIME). */
const INEXACT_NESTING: ReadonlySet<string> = new Set(['7:7', '11:11', '13:13']);

/** Every note value with every dot, as plain durations. */
const PLAIN_DURATIONS: readonly Duration[] = NOTE_VALUES.flatMap((value) => DOTS.map((dots) => ({ value, ...dots, tuplet: NORMAL_TUPLET })));

const SINGLE_CASES = GP_TUPLETS.map((tuplet) => [`${tuplet.enters}:${tuplet.times}`, tuplet] as const);

const NESTED_CASES = GP_TUPLETS.flatMap((outer) =>
  GP_TUPLETS.filter((inner) => !INEXACT_NESTING.has(`${outer.enters}:${inner.enters}`)).map(
    (inner) => [`${inner.enters}:${inner.times}`, `${outer.enters}:${outer.times}`, outer, inner] as const,
  ),
);

function describeDuration(duration: Duration): string {
  return `1/${duration.value}${duration.dotted ? '.' : ''}${duration.doubleDotted ? '..' : ''}`;
}

describe('QUARTER_TIME', () => {
  it('is a multiple of 960, so positions of the old resolution scale exactly', () => {
    // Assert
    expect(QUARTER_TIME % 960).toBe(0);
  });

  it('keeps a long song with its repeats played out in exact integers', () => {
    // Arrange: 65,536 played bars (the playback order's cap) of 4/4, played in 64 practice passes
    const lastTick = QUARTER_TIME + 65_536 * 64 * measureTicks(4, 4);

    // Assert
    expect(Number.isSafeInteger(lastTick)).toBe(true);
  });
});

describe('durationTicks of single tuplets', () => {
  it.each(SINGLE_CASES)('%s: n notes of any value and dots last as long as the plain notes they replace', (_name, tuplet) => {
    for (const plain of PLAIN_DURATIONS) {
      // Arrange
      const inTuplet: Duration = { ...plain, tuplet };

      // Act
      const ticks = durationTicks(inTuplet);

      // Assert
      expect(Number.isInteger(ticks), describeDuration(plain)).toBe(true);
      expect(ticks * tuplet.enters, describeDuration(plain)).toBe(durationTicks(plain) * tuplet.times);
    }
  });

  it('adds seven 7:4 sixteenths up to exactly one quarter', () => {
    // Arrange
    const sixteenth: Duration = { value: 16, dotted: false, doubleDotted: false, tuplet: { enters: 7, times: 4 } };

    // Act
    const total = Array.from({ length: 7 }, () => durationTicks(sixteenth)).reduce((sum, ticks) => sum + ticks, 0);

    // Assert
    expect(total).toBe(QUARTER_TIME);
  });

  it('floors a tuplet whose notes are not a whole number of ticks', () => {
    // Arrange: 17 sixteenths in the time of 16, a ratio no Guitar Pro palette offers
    const odd: Duration = { value: 16, dotted: false, doubleDotted: false, tuplet: { enters: 17, times: 16 } };

    // Act
    const ticks = durationTicks(odd);

    // Assert
    expect(ticks).toBe(Math.floor((QUARTER_TIME * 16) / 17 / 4));
  });
});

describe('durationTicks of nested tuplets', () => {
  it.each(NESTED_CASES)('%s inside %s: n inner notes of any value and dots last as long as the outer notes they replace', (_inner, _outer, outer, inner) => {
    for (const plain of PLAIN_DURATIONS) {
      // Arrange
      const outerOnly: Duration = { ...plain, tuplet: outer };
      const nested: Duration = { ...outerOnly, innerTuplet: inner };

      // Act
      const ticks = durationTicks(nested);

      // Assert
      expect(Number.isInteger(ticks), describeDuration(plain)).toBe(true);
      expect(ticks * inner.enters, describeDuration(plain)).toBe(durationTicks(outerOnly) * inner.times);
    }
  });

  it('fills a quarter with a quintuplet of sixteenths whose middle two are a triplet', () => {
    // Arrange
    const quintuplet: Duration = { value: 16, dotted: false, doubleDotted: false, tuplet: { enters: 5, times: 4 } };
    const nested: Duration = { ...quintuplet, innerTuplet: { enters: 3, times: 2 } };
    const group = [quintuplet, nested, nested, nested, quintuplet, quintuplet];

    // Act
    const total = group.reduce((sum, duration) => sum + durationTicks(duration), 0);

    // Assert
    expect(total).toBe(QUARTER_TIME);
  });

  it('rounds a 7:4 inside a 7:4 down to a whole tick (the documented limit)', () => {
    // Arrange
    const seventh: Duration = { value: 16, dotted: false, doubleDotted: false, tuplet: { enters: 7, times: 4 }, innerTuplet: { enters: 7, times: 4 } };

    // Act
    const ticks = durationTicks(seventh);

    // Assert
    expect(ticks).toBe(Math.floor((QUARTER_TIME * 16) / 49 / 4));
  });
});

describe('roundTempo', () => {
  it('keeps a tempo to two decimals', () => {
    expect(roundTempo(92.5)).toBe(92.5);
    expect(roundTempo(92.456)).toBe(92.46);
    expect(roundTempo(120)).toBe(120);
    expect(roundTempo(60.004)).toBe(60);
  });
});
