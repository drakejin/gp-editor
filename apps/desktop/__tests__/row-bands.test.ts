import { type Beat, DYNAMICS, type Measure, type MeasureHeader, type NoteEffect, type Song } from '@gp-editor/core';
import { DEFAULT_CHORD_DISPLAY } from '../src/score/chords';
import { NOTATION, STAFF_HEIGHT } from '../src/score/notation';
import { ROW, type ScoreMode } from '../src/score/geometry';
import { NOTATION_ROOM } from '../src/score/row-bands';
import { type ScoreLayout, layoutScore } from '../src/score/score-layout';
import { notationReach } from '../src/score/staff-reach';
import { beat, header, makeSong, note, toTux } from '../test-support/songs';

const QUARTER_TICKS = 960;
/** Four bars a system: each bar is four quarter notes. */
const WIDTH = 760;

/** `count` bars of four quarter notes on string 3, `notes(bar, beat)` in place of any of them. */
function song(count: number, notes: (bar: number, beatIndex: number) => ReturnType<typeof note> | undefined = () => undefined, headers?: (bar: number) => Partial<MeasureHeader>): Song {
  const bars = Array.from({ length: count }, (_, i) =>
    Array.from({ length: 4 }, (__, b) => beat(toTux(header(i + 1).start) + b * QUARTER_TICKS, [notes(i, b) ?? note(3, 2)])),
  );
  return makeSong(bars, bars.map((_, i) => header(i + 1, headers?.(i) ?? {})));
}

function withMeasure(base: Song, measureIndex: number, change: (measure: Measure) => Measure): Song {
  const [track] = base.tracks;
  return { ...base, tracks: [{ ...track!, measures: track!.measures.map((measure, i) => (i === measureIndex ? change(measure) : measure)) }] };
}

function withBeat(base: Song, measureIndex: number, change: (beat: Beat) => Beat): Song {
  return withMeasure(base, measureIndex, (measure) => ({ ...measure, beats: measure.beats.map((each, i) => (i === 0 ? change(each) : each)) }));
}

const effect = (partial: Partial<NoteEffect>) => (bar: number, beatIndex: number) => (bar === 8 && beatIndex === 1 ? note(1, 3, partial) : undefined);

function layoutOf(score: Song, mode: ScoreMode = 'notationAndTab'): ScoreLayout {
  return layoutScore(score, [{ trackIndex: 0, mode }], DEFAULT_CHORD_DISPLAY, WIDTH);
}

/** The system holding bar `measureIndex`. */
function systemOf(layout: ScoreLayout, measureIndex: number): number {
  return layout.systems.findIndex((system) => system.rows[0]?.measures.some((measure) => measure.measureIndex === measureIndex));
}

describe('each system makes room only for what its own bars hold', () => {
  const plain = song(16);

  it('lays the test song out four bars a system', () => {
    expect(layoutOf(plain).systems.map((system) => system.rows[0]?.measures.length)).toEqual([4, 4, 4, 4]);
  });

  it('makes room for the dynamics only in the system where the dynamic changes', () => {
    // Arrange: bar 9 turns quiet and stays so
    const quiet = DYNAMICS.find((entry) => entry.name === 'p')?.velocity ?? 0;
    const score = song(16, (bar) => (bar >= 8 ? { ...note(3, 2), velocity: quiet } : undefined));

    // Act
    const [before, after] = [layoutOf(plain), layoutOf(score)];

    // Assert
    const changed = systemOf(after, 8);
    after.systems.forEach((system, i) => {
      expect(system.height - (before.systems[i]?.height ?? 0)).toBeCloseTo(i === changed ? ROW.dynamics : 0);
      expect(system.staves[0]?.geometry.dynamicsY === undefined).toBe(i !== changed);
    });
  });

  it('gives a system the effect-mark lanes of its own bars, none without marks', () => {
    // Arrange: palm muting in bar 9 only
    const score = song(16, effect({ palmMute: true }));

    // Act
    const layout = layoutOf(score);

    // Assert
    const marked = systemOf(layout, 8);
    expect(layout.systems.map((system) => system.staves[0]?.markLanes)).toEqual(layout.systems.map((_, i) => (i === marked ? ['palmMute'] : [])));
    // A system without marks: between its notation's room and its tab, only the empty marks band.
    const unmarked = layout.systems[0]!.staves[0]!;
    const notationBottom = (unmarked.geometry.notationTop ?? 0) + STAFF_HEIGHT + unmarked.bands.notationBelow;
    expect((unmarked.geometry.tabTop ?? 0) - notationBottom).toBeCloseTo(ROW.marksEmpty);
  });

  it('keeps the bends band to the systems with a bend', () => {
    // Arrange
    const score = song(16, effect({ bend: { points: [{ position: 0, value: 0 }, { position: 6, value: 4 }] } }));

    // Act
    const layout = layoutOf(score);

    // Assert
    const bent = systemOf(layout, 8);
    expect(layout.systems.map((system) => system.staves[0]?.bands.hasBends)).toEqual(layout.systems.map((_, i) => i === bent));
  });

  it('gives the heading its whole band where it shows a tempo or an ending, else only its bar number’s line', () => {
    // Arrange: an alternate ending on bar 13
    const score = song(16, undefined, (bar) => (bar === 12 ? { repeatAlternative: 1 } : {}));

    // Act
    const heights = layoutOf(score).systems.map((system) => system.staves[0]?.geometry.headingHeight);

    // Assert: the first system shows the tempo
    expect(heights).toEqual([ROW.heading, ROW.headingCompact, ROW.headingCompact, ROW.heading]);
  });

  it('keeps the lyrics and chord bands to the systems with a syllable or a chord', () => {
    // Arrange: two words from bar 5, an Am chord in bar 13
    const [track] = plain.tracks;
    const sung: Song = { ...plain, tracks: [{ ...track!, lyrics: { from: 5, text: 'la la' } }] };
    const score = withBeat(sung, 12, (each) => ({ ...each, chord: { name: 'Am', firstFret: 1, frets: [0, 1, 2, 2, 0, -1] } }));

    // Act
    const layout = layoutOf(score);

    // Assert
    expect(layout.systems.map((system) => system.staves[0]?.geometry.lyricsY !== undefined)).toEqual([false, true, false, false]);
    expect(layout.systems.map((system) => system.staves[0]?.geometry.chordNamesY !== undefined)).toEqual([false, false, false, true]);
  });

  it('makes room for a sustain pedal held into a system without pedal marks of its own', () => {
    // Arrange: the pedal down in bar 3, up in bar 6
    const down = withMeasure(plain, 2, (measure) => ({ ...measure, pedals: [{ offset: 0, action: 'down' }] }));
    const score = withMeasure(down, 5, (measure) => ({ ...measure, pedals: [{ offset: 0, action: 'up' }] }));

    // Act
    const layout = layoutOf(score);

    // Assert
    expect(layout.systems.map((system) => system.staves[0]?.geometry.pedalsY !== undefined)).toEqual([true, true, false, false]);
  });
});

describe('the staves’ room', () => {
  it('makes the notation’s room above and below the staff as tall as its notes reach, and a little', () => {
    // Arrange: bar 9 climbs to the 20th fret of the top string, far above the staff
    const score = song(16, (bar) => (bar === 8 ? note(1, 20) : undefined));

    // Act
    const layout = layoutOf(score);

    // Assert
    const high = layout.systems[systemOf(layout, 8)]!;
    const low = layout.systems[0]!;
    const reach = notationReach(score, 0, 'notationAndTab', high.rows[0]!);
    expect(high.staves[0]?.bands.notationAbove).toBeCloseTo(reach.above + NOTATION_ROOM.clearance);
    expect(high.staves[0]?.bands.notationAbove).toBeGreaterThan(low.staves[0]?.bands.notationAbove ?? Infinity);
    expect(low.staves[0]?.bands.notationAbove).toBeLessThan(NOTATION.above);
    expect(low.staves[0]?.bands.notationBelow).toBeLessThan(NOTATION.below);
    const { notationTop = 0, tabTop = 0 } = low.staves[0]?.geometry ?? {};
    expect(tabTop - (notationTop + STAFF_HEIGHT)).toBeLessThan(NOTATION.below + ROW.marks);
  });

  it('leaves room above the tab for a hammer-on’s arc and its H over the top string', () => {
    // Arrange: a hammer-on on the top string in bar 9
    const score = song(16, (bar, beatIndex) => (bar === 8 && beatIndex < 2 ? note(1, 3 + beatIndex, { hammer: beatIndex === 0 }) : undefined));

    // Act
    const layout = layoutOf(score);

    // Assert: the room over the tab grows past the empty marks band
    const linked = layout.systems[systemOf(layout, 8)]!.staves[0]!;
    const plain = layout.systems[0]!.staves[0]!;
    expect(linked.bands.tabAbove).toBeGreaterThan(ROW.marksEmpty);
    expect((linked.geometry.tabTop ?? 0) - (linked.geometry.notationTop ?? 0)).toBeGreaterThan((plain.geometry.tabTop ?? 0) - (plain.geometry.notationTop ?? 0));
  });

  it('measures a bar once, whatever row it is on: the same bars reach as far at any width', () => {
    // Arrange
    const score = song(16, (bar) => (bar % 3 === 0 ? note(1, 15) : undefined));
    const narrow = layoutScore(score, [{ trackIndex: 0, mode: 'notationAndTab' }], DEFAULT_CHORD_DISPLAY, 420);

    // Act: each narrow row's reach, and the same bars' reach in a row of their own at the wide width
    const reaches = narrow.systems.map((system) => notationReach(score, 0, 'notationAndTab', system.rows[0]!));
    const again = narrow.systems.map((system) => notationReach(score, 0, 'notationAndTab', { measures: system.rows[0]!.measures.map((measure) => ({ ...measure, width: measure.width * 2 })) }));

    // Assert
    expect(again).toEqual(reaches);
  });
});
