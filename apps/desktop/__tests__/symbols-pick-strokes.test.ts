import type { Beat, StrokeDirection } from '@gp-editor/core';
import { layoutMeasure } from '../src/lib/layout';
import type { DrawCommand, TextCommand } from '../src/score/draw';
import { TAB_PICK_STROKE_SIZE, hasPickStroke, pickStrokeGlyph } from '../src/score/symbols/pick-strokes';
import { PICK_STROKE_GLYPHS, staffSpace } from '../src/score/symbols/smufl';
import { TAB_MARKS } from '../src/score/symbols/tab-geometry';
import { tabMarkLanes } from '../src/score/symbols/tab-marks';
import { type TabContext, engraveTabMeasure } from '../src/score/tab';
import { PALETTE, texts } from '../test-support/score-helpers';
import { beat, makeSong, note } from '../test-support/songs';

const TOP = 60;
const MARKS_Y = 44;

function picked(start: number, pickStroke: StrokeDirection, effect: Parameters<typeof note>[2] = {}): Beat {
  return { ...beat(start, [note(1, 5, effect)]), pickStroke };
}

function engrave(beats: Beat[], markLanes?: TabContext['markLanes']): { commands: DrawCommand[]; context: TabContext } {
  const song = makeSong([beats]);
  const track = song.tracks[0]!;
  const context: TabContext = {
    track, header: song.measureHeaders[0]!, measure: track.measures[0]!, layout: layoutMeasure(song, 0, 0),
    top: TOP, marksY: MARKS_Y, markLanes, showRhythm: false, palette: PALETTE,
  };
  return { commands: engraveTabMeasure(context), context };
}

const glyphsOf = (commands: readonly DrawCommand[], text: string): TextCommand[] => texts(commands).filter((c) => c.text === text);

describe('pick strokes above the tab', () => {
  it('draws a down-bow over a down-picked beat and an up-bow over an up-picked one, centred on the beat', () => {
    // Act
    const { commands, context } = engrave([picked(960, 'down'), picked(1920, 'none'), picked(2880, 'up')]);

    // Assert
    const [down] = glyphsOf(commands, PICK_STROKE_GLYPHS.down.text);
    const [up] = glyphsOf(commands, PICK_STROKE_GLYPHS.up.text);
    expect(down).toMatchObject({ x: context.layout.beats[0]!.x, font: 'music', align: 'center', size: TAB_PICK_STROKE_SIZE, color: PALETTE.muted });
    expect(up).toMatchObject({ x: context.layout.beats[2]!.x });
    expect(texts(commands).filter((c) => c.font === 'music')).toHaveLength(2);
  });

  it('centres the mark on its lane', () => {
    // Act
    const { commands } = engrave([picked(960, 'up')]);

    // Assert
    const glyph = PICK_STROKE_GLYPHS.up;
    const [up] = glyphsOf(commands, glyph.text);
    const space = staffSpace(TAB_PICK_STROKE_SIZE);
    expect((up!.y - glyph.top * space + up!.y - glyph.bottom * space) / 2).toBeCloseTo(MARKS_Y);
    expect(glyph.top * space).toBeLessThanOrEqual(TAB_MARKS.laneHeight);
  });

  it('gets the outermost lane, above the other marks of the beat', () => {
    // Act
    const { commands } = engrave([picked(960, 'down', { palmMute: true })], ['palmMute', 'pickStroke']);

    // Assert
    const [down] = glyphsOf(commands, PICK_STROKE_GLYPHS.down.text);
    const [palmMute] = glyphsOf(commands, 'P.M.');
    expect(palmMute!.y).toBe(MARKS_Y);
    expect(down!.y).toBeLessThan(MARKS_Y);
  });

  it('adds the lane only to tracks that pick-stroke somewhere', () => {
    // Arrange
    const plain = makeSong([[beat(960, [note(1, 0, { palmMute: true })])]]).tracks[0]!.measures;
    const withStrokes = makeSong([[picked(960, 'up', { palmMute: true })]]).tracks[0]!.measures;

    // Act + Assert
    expect(tabMarkLanes(plain)).toEqual(['palmMute']);
    expect(tabMarkLanes(withStrokes)).toEqual(['palmMute', 'pickStroke']);
  });

  it('knows which beats have a pick stroke and their marks', () => {
    // Act + Assert
    expect(hasPickStroke(picked(960, 'down'))).toBe(true);
    expect(hasPickStroke(picked(960, 'none'))).toBe(false);
    expect(hasPickStroke(undefined)).toBe(false);
    expect(pickStrokeGlyph('down')?.text).toBe('\u{E610}');
    expect(pickStrokeGlyph('up')?.text).toBe('\u{E612}');
    expect(pickStrokeGlyph('none')).toBeUndefined();
  });
});
