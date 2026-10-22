import { QUARTER } from '@gp-editor/core';
import type { Beat, Duration, Note, Voice } from '@gp-editor/core';
import { type MeasureLayout, layoutMeasure } from '../src/lib/layout';
import { type DrawCommand, SMUFL, type TextCommand } from '../src/score/draw';
import { NOTATION, engraveNotationMeasure } from '../src/score/notation';
import { PALETTE } from '../test-support/score-helpers';
import { beat, makeSong, note } from '../test-support/songs';

const TOP = NOTATION.above;
const SPACE = NOTATION.space;
const yOf = (position: number) => TOP + ((8 - position) * SPACE) / 2;
const HALF: Duration = { ...QUARTER, value: 2 };

function voice(notes: Note[], duration: Duration = QUARTER): Voice {
  return { duration, notes, isEmpty: false, direction: 'none' };
}

function twoVoices(first: Voice, second: Voice): Beat {
  return { ...beat(960, []), voices: [first, second] };
}

function engrave(beats: Beat[]): {
  commands: DrawCommand[];
  layout: MeasureLayout;
} {
  const song = makeSong([beats]);
  const track = song.tracks[0]!;
  const layout = layoutMeasure(song, 0, 0);
  return {
    commands: engraveNotationMeasure({
      track,
      header: song.measureHeaders[0]!,
      measure: track.measures[0]!,
      layout,
      top: TOP,
      palette: PALETTE,
    }),
    layout,
  };
}

const texts = (commands: readonly DrawCommand[], text: string): TextCommand[] =>
  commands.filter(
    (c): c is TextCommand => c.kind === 'text' && c.text === text,
  );
const headAt = (
  commands: readonly DrawCommand[],
  position: number,
  glyph: string = SMUFL.noteheadBlack,
) => texts(commands, glyph).find(c => c.y === yOf(position));

describe('two voices on one beat', () => {
  it('moves the upper voice right of the lower one when their notes are a second apart', () => {
    // Arrange: voice 1 A4 (stem up), voice 2 G4 (stem down)
    const beats = [twoVoices(voice([note(3, 2)]), voice([note(3, 0)]))];

    // Act
    const { commands, layout } = engrave(beats);

    // Assert
    const upper = headAt(commands, 3)!;
    const lower = headAt(commands, 2)!;
    expect(lower.x).toBeCloseTo(layout.beats[0]!.x - (1.18 * SPACE) / 2);
    expect(upper.x).toBeGreaterThanOrEqual(lower.x + 1.18 * SPACE - 1);
  });

  it('leaves voices apart when their notes do not touch, and shares a unison notehead', () => {
    const apart = engrave([
      twoVoices(voice([note(1, 0)]), voice([note(5, 0)])),
    ]).commands;
    expect(headAt(apart, 7)!.x).toBeCloseTo(headAt(apart, -4)!.x);
    const unison = engrave([
      twoVoices(voice([note(3, 0)]), voice([note(3, 0)])),
    ]).commands;
    const [a, b] = texts(unison, SMUFL.noteheadBlack);
    expect(a!.x).toBe(b!.x);
  });

  it('moves a unison apart when the noteheads differ', () => {
    const { commands } = engrave([
      twoVoices(voice([note(3, 0)], HALF), voice([note(3, 0)])),
    ]);
    expect(headAt(commands, 2, SMUFL.noteheadHalf)!.x).toBeGreaterThan(
      headAt(commands, 2)!.x,
    );
  });

  it('moves a rest of the upper voice above high notes of the lower voice', () => {
    // Act: voice 2 plays G5 (position 9) under a voice 1 rest
    const { commands } = engrave([twoVoices(voice([]), voice([note(1, 3)]))]);

    // Assert
    const [rest] = texts(commands, SMUFL.restQuarter);
    expect(rest!.y).toBeLessThanOrEqual(yOf(13));
  });

  it('moves a rest of the lower voice below low notes of the upper voice', () => {
    const { commands } = engrave([twoVoices(voice([note(6, 0)]), voice([]))]);
    const [rest] = texts(commands, SMUFL.restQuarter);
    expect(rest!.y).toBeGreaterThanOrEqual(yOf(-11));
  });

  it('keeps the usual rest places when the other voice is out of the way', () => {
    const { commands } = engrave([twoVoices(voice([]), voice([note(6, 0)]))]);
    expect(texts(commands, SMUFL.restQuarter)[0]!.y).toBe(yOf(8));
  });
});
