import { DYNAMICS, type DynamicName, type Note } from '@gp-editor/core';
import { layoutMeasure } from '../src/lib/layout';
import type { DrawCommand } from '../src/score/draw';
import {
  DYNAMIC_MUSIC_SIZE,
  DYNAMIC_PLACEMENT,
  beatDynamic,
  dynamicBefore,
  dynamicMarks,
  engraveDynamics,
  hasDynamicChanges,
} from '../src/score/dynamics';
import { DYNAMIC_GLYPHS, staffSpace } from '../src/score/symbols/smufl';
import { PALETTE, texts } from '../test-support/score-helpers';
import { beat, header, makeSong, note, toTux } from '../test-support/songs';

const QUARTER_TICKS = 960;
const Y = 200;
const BOTTOM_LINE = 100;
const SPACE = staffSpace(DYNAMIC_MUSIC_SIZE);

function velocityOf(dynamic: DynamicName): number {
  return DYNAMICS.find((entry) => entry.name === dynamic)?.velocity ?? 0;
}

function at(dynamic: DynamicName, string = 1, fret = 5): Note {
  return { ...note(string, fret), velocity: velocityOf(dynamic) };
}

/** Quarter beats of bar `number` (1-based), one per entry: a note at that dynamic, or a rest for undefined. */
function bar(number: number, dynamics: readonly (DynamicName | undefined)[]) {
  return dynamics.map((dynamic, i) => beat(toTux(header(number).start) + i * QUARTER_TICKS, dynamic === undefined ? [] : [at(dynamic)]));
}

describe('beatDynamic', () => {
  it('is the dynamic of the loudest note when a chord mixes them', () => {
    // Arrange
    const chord = beat(960, [at('p', 1), at('ff', 2), at('mf', 3)]);

    // Act
    const dynamic = beatDynamic(chord);

    // Assert
    expect(dynamic).toBe('ff');
  });

  it('counts every voice of the beat', () => {
    // Arrange
    const twoVoices = { ...beat(960, [at('mp')]), voices: [...beat(960, [at('mp')]).voices, ...beat(960, [at('fff', 2)]).voices] };

    // Act + Assert
    expect(beatDynamic(twoVoices)).toBe('fff');
  });

  it('has none for a rest or a beat of tied notes only', () => {
    // Arrange
    const rest = beat(960, []);
    const tied = beat(960, [{ ...at('pp'), isTied: true }]);

    // Act + Assert
    expect(beatDynamic(rest)).toBeUndefined();
    expect(beatDynamic(tied)).toBeUndefined();
  });
});

describe('dynamicMarks', () => {
  it('marks nothing when the track stays at forte, the dynamic it starts at', () => {
    // Arrange
    const song = makeSong([bar(1, ['f', 'f', 'f', 'f']), bar(2, ['f', undefined, 'f', 'f'])]);
    const measures = song.tracks[0]!.measures;

    // Act + Assert
    expect(dynamicMarks(measures, 0)).toEqual([]);
    expect(dynamicMarks(measures, 1)).toEqual([]);
    expect(hasDynamicChanges(measures)).toBe(false);
  });

  it('marks the beats where the dynamic changes from the previous sounding note', () => {
    // Arrange
    const song = makeSong([bar(1, ['p', 'p', undefined, 'mf'])]);

    // Act
    const marks = dynamicMarks(song.tracks[0]!.measures, 0);

    // Assert
    expect(marks).toEqual([
      { beatIndex: 0, dynamic: 'p' },
      { beatIndex: 3, dynamic: 'mf' },
    ]);
  });

  it('carries the dynamic across bar lines and empty bars', () => {
    // Arrange
    const song = makeSong([bar(1, ['pp', 'pp', 'pp', 'pp']), [], bar(3, ['pp', 'f', 'f', 'f'])]);
    const measures = song.tracks[0]!.measures;

    // Act
    const marks = dynamicMarks(measures, 2);

    // Assert
    expect(dynamicBefore(measures, 2)).toBe('pp');
    expect(marks).toEqual([{ beatIndex: 1, dynamic: 'f' }]);
    expect(hasDynamicChanges(measures)).toBe(true);
  });

  it('starts every track at forte', () => {
    // Arrange
    const song = makeSong([bar(1, ['f', 'f', 'f', 'f'])]);

    // Act + Assert
    expect(dynamicBefore(song.tracks[0]!.measures, 0)).toBe('f');
    expect(dynamicBefore([], 3)).toBe('f');
  });
});

describe('engraveDynamics', () => {
  it('draws the changed dynamic under its beat, at the given baseline', () => {
    // Arrange
    const song = makeSong([bar(1, ['f', 'f', 'mp', 'mp'])]);
    const layout = layoutMeasure(song, 0, 0);

    // Act
    const commands = engraveDynamics({ measures: song.tracks[0]!.measures, measureIndex: 0, layout, y: Y, palette: PALETTE });

    // Assert
    expect(texts(commands)).toEqual([
      expect.objectContaining({ text: DYNAMIC_GLYPHS.mp.text, x: layout.beats[2]!.x, y: Y, font: 'music', align: 'center', color: PALETTE.text }),
    ]);
  });

  it('draws nothing in a bar whose dynamic does not change', () => {
    // Arrange
    const song = makeSong([bar(1, ['ppp', 'ppp', 'ppp', 'ppp']), bar(2, ['ppp', 'ppp', 'ppp', 'ppp'])]);

    // Act
    const commands = engraveDynamics({ measures: song.tracks[0]!.measures, measureIndex: 1, layout: layoutMeasure(song, 0, 1), y: Y, palette: PALETTE });

    // Assert
    expect(commands).toEqual([]);
  });

  it('goes close under a staff whose notes stay inside it', () => {
    // Arrange
    const song = makeSong([bar(1, ['p', 'p', 'p', 'p'])]);
    const staffLine: DrawCommand = { kind: 'line', x1: 0, y1: BOTTOM_LINE, x2: 300, y2: BOTTOM_LINE, width: 1, color: '#000000' };

    // Act
    const [mark] = engraveDynamics({
      measures: song.tracks[0]!.measures, measureIndex: 0, layout: layoutMeasure(song, 0, 0), y: Y, palette: PALETTE,
      staff: { commands: [staffLine], bottomLine: BOTTOM_LINE },
    });

    // Assert
    expect(mark!.y).toBeCloseTo(BOTTOM_LINE + DYNAMIC_PLACEMENT.staffGap + DYNAMIC_GLYPHS.p.top * SPACE);
  });

  it('goes down to clear low notes over its beat, never below its band', () => {
    // Arrange
    const song = makeSong([bar(1, ['p', 'p', 'p', 'p']), bar(2, ['f', 'f', 'f', 'f'])]);
    const measures = song.tracks[0]!.measures;
    const x = layoutMeasure(song, 0, 0).beats[0]!.x;
    const lowNote = (bottom: number): DrawCommand => ({ kind: 'rect', x: x - 5, y: BOTTOM_LINE, width: 10, height: bottom - BOTTOM_LINE, color: '#000000' });
    const engraveOver = (ink: DrawCommand) =>
      engraveDynamics({ measures, measureIndex: 0, layout: layoutMeasure(song, 0, 0), y: Y, palette: PALETTE, staff: { commands: [ink], bottomLine: BOTTOM_LINE } })[0]!;

    // Act
    const clear = engraveOver(lowNote(BOTTOM_LINE + 30));
    const deep = engraveOver(lowNote(Y + 50));

    // Assert
    expect(clear.y - DYNAMIC_GLYPHS.p.top * SPACE).toBeCloseTo(BOTTOM_LINE + 30 + DYNAMIC_PLACEMENT.inkGap);
    expect(deep.y).toBe(Y);
  });

  it('has a glyph for each of the eight dynamics', () => {
    // Act
    const glyphs = DYNAMICS.map((entry) => DYNAMIC_GLYPHS[entry.name].text);

    // Assert
    expect(glyphs).toEqual(['\u{E52A}', '\u{E52B}', '\u{E520}', '\u{E52C}', '\u{E52D}', '\u{E522}', '\u{E52F}', '\u{E530}']);
  });
});
