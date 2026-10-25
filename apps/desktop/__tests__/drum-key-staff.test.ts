import type { Song } from '@gp-editor/core';
import { WHOLE_KIT_KEYS } from '../src/lib/drum-key';
import { AA_TEXT_CONTRAST, DISTINCT_COLOR_DIFFERENCE, colorDifference, contrastRatio } from '../src/lib/contrast';
import { layoutMeasure } from '../src/lib/layout';
import { type DrawCommand, SMUFL, type TextCommand } from '../src/score/draw';
import { DRUM_KEY_STAFF, drumKeyColors, drumKeyStaffBox, engraveDrumKeyStaff } from '../src/score/drum-key-staff';
import { NOTATION, engraveNotationMeasure } from '../src/score/notation';
import { allPalettes } from '../src/theme';
import { PALETTE } from '../test-support/score-helpers';
import { beat, makeSong, note } from '../test-support/songs';

const COLORS = { ink: '#EEEEEE', line: '#999999', lit: '#88BBFF' };
const MUSIC_TEXTS: ReadonlySet<string> = new Set((Object.values(SMUFL) as readonly unknown[]).filter((value): value is string => typeof value === 'string'));
const FLAGS: ReadonlySet<string> = new Set([...SMUFL.flagUp, ...SMUFL.flagDown]);

function musicTexts(commands: readonly DrawCommand[]): TextCommand[] {
  return commands.filter((c): c is TextCommand => c.kind === 'text' && c.font === 'music' && MUSIC_TEXTS.has(c.text));
}

/** What the score draws for one quarter note of `key` on a drum track: its music glyphs, y from the staff's top line. */
function scoreGlyphs(key: number): readonly (readonly [string, number])[] {
  const base = makeSong([[beat(960, [note(1, key)])]]);
  const song: Song = { ...base, tracks: base.tracks.map((track) => ({ ...track, isPercussion: true })) };
  const track = song.tracks[0]!;
  const commands = engraveNotationMeasure({ track, header: song.measureHeaders[0]!, measure: track.measures[0]!, layout: layoutMeasure(song, 0, 0), top: NOTATION.above, palette: PALETTE });
  return musicTexts(commands)
    .filter((c) => c.text !== SMUFL.unpitchedPercussionClef && !FLAGS.has(c.text))
    .map((c) => [c.text, c.y - NOTATION.above] as const);
}

describe('engraveDrumKeyStaff', () => {
  it('writes every drum of the kit with the notehead and on the line the score uses', () => {
    // Arrange / Act: each key alone, on its own staff and on the score.
    const differences = WHOLE_KIT_KEYS.flatMap((key) => {
      const box = drumKeyStaffBox([key]);
      const heads = musicTexts(engraveDrumKeyStaff({ keys: [key], box, colors: COLORS }))
        .filter((c) => scoreGlyphs(key).some(([text]) => text === c.text))
        .map((c) => [c.text, c.y - box.top] as const);
      const fromScore = scoreGlyphs(key).filter(([text]) => heads.some(([own]) => own === text));
      return JSON.stringify(heads.slice(0, 1)) === JSON.stringify(fromScore.slice(0, 1)) ? [] : [{ key, heads, fromScore }];
    });

    // Assert
    expect(differences).toEqual([]);
  });

  it('puts each drum in its own column, the one the mouse is over lit', () => {
    // Act
    const commands = engraveDrumKeyStaff({ keys: [42, 46], box: drumKeyStaffBox([42, 46]), colors: COLORS, litKey: 46 });

    // Assert
    const closed = musicTexts(commands).find((c) => c.text === SMUFL.noteheadXBlack)!;
    const open = musicTexts(commands).find((c) => c.text === SMUFL.noteheadCircleX)!;
    expect(closed.x).toBeLessThan(DRUM_KEY_STAFF.column);
    expect(open.x).toBeGreaterThan(DRUM_KEY_STAFF.column);
    expect([closed.color, open.color]).toEqual([COLORS.ink, COLORS.lit]);
  });

  it('draws five staff lines across every column and no stems', () => {
    const commands = engraveDrumKeyStaff({ keys: [36, 38, 42], box: drumKeyStaffBox([36, 38, 42]), colors: COLORS });
    const lines = commands.filter((c) => c.kind === 'line');

    expect(lines.filter((c) => c.kind === 'line' && c.x1 === 0 && c.x2 === 3 * DRUM_KEY_STAFF.column)).toHaveLength(5);
    expect(lines.filter((c) => c.kind === 'line' && c.x1 === c.x2)).toHaveLength(0);
  });

  it('keeps every drum and symbol of the kit inside its box', () => {
    // Arrange
    const box = drumKeyStaffBox(WHOLE_KIT_KEYS);

    // Act
    const commands = engraveDrumKeyStaff({ keys: WHOLE_KIT_KEYS, box, colors: COLORS });

    // Assert: glyph baselines and lines between the box's top and bottom.
    const ys = commands.flatMap((c) => (c.kind === 'line' ? [c.y1, c.y2] : c.kind === 'text' ? [c.y] : []));
    expect(Math.min(...ys)).toBeGreaterThanOrEqual(0);
    expect(Math.max(...ys)).toBeLessThanOrEqual(box.height);
  });

  it('makes room above the staff for the cymbal edge’s pictogram', () => {
    expect(drumKeyStaffBox([93]).top).toBeGreaterThan(drumKeyStaffBox([51]).top);
    const [edge] = musicTexts(engraveDrumKeyStaff({ keys: [93], box: drumKeyStaffBox([93]), colors: COLORS })).filter((c) => c.text === SMUFL.pictEdgeOfCymbal);
    expect(edge!.y).toBeGreaterThan(0);
  });
});

describe('drumKeyColors', () => {
  it('reads on the chrome in every palette, the lit drum apart from the others', () => {
    const problems = allPalettes().flatMap(([name, palette]) => {
      const colors = drumKeyColors(palette);
      return [
        ...[colors.ink, colors.line, colors.lit].filter((color) => contrastRatio(color, palette.chrome) < AA_TEXT_CONTRAST).map((color) => `${name}: ${color}`),
        ...(colorDifference(colors.lit, colors.ink) < DISTINCT_COLOR_DIFFERENCE ? [`${name}: lit like ink`] : []),
      ];
    });

    expect(problems).toEqual([]);
  });
});
