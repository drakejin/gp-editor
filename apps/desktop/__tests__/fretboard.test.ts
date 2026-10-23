import type { CircleCommand } from '../src/score/draw';
import { engraveFretboard, FRETBOARD, fretboardHeight, fretX, neckFret } from '../src/score/fretboard';
import { SCALE_COLORS } from '../src/score/scale-marks';
import { makeSong, note } from '../test-support/songs';
import { PALETTE, allFinite, texts } from '../test-support/score-helpers';

const guitar = makeSong([[]]).tracks[0]!;

describe('engraveFretboard', () => {
  it('names every position of a six-string neck: 6 strings × 25 positions', () => {
    const commands = engraveFretboard({ track: guitar, width: 1000, palette: PALETTE, notes: [] });
    const names = texts(commands).filter((t) => t.size === 7.5);
    expect(names).toHaveLength(6 * (FRETBOARD.frets + 1));
    expect(names.slice(0, 6).map((t) => t.text)).toEqual(['E', 'F', 'F#', 'G', 'G#', 'A']);
    expect(allFinite(commands)).toBe(true);
  });

  it('draws a four-string bass with its own tuning', () => {
    const bass = { ...guitar, strings: [43, 38, 33, 28].map((tuning, i) => ({ number: i + 1, tuning })) };
    const names = texts(engraveFretboard({ track: bass, width: 1000, palette: PALETTE, notes: [] })).filter((t) => t.size === 7.5);
    expect(names).toHaveLength(4 * 25);
    expect(names.filter((t) => t.bold).map((t) => t.text)).toEqual(['G', 'D', 'A', 'E']);
  });

  it('lights the current notes with their names at the neck position, counting the capo', () => {
    const capo2 = { ...guitar, offset: 2 };
    const commands = engraveFretboard({ track: capo2, width: 1000, palette: PALETTE, notes: [note(2, 1), note(6, 0, { deadNote: true })] });
    const lit = texts(commands).filter((t) => t.color === PALETTE.accentText).map((t) => t.text);
    expect(lit).toEqual(['D', 'x']);
    expect(neckFret(capo2, 1)).toBe(3);
    expect(commands.some((c) => c.kind === 'rect' && c.color === `${PALETTE.text}AA`)).toBe(true);
  });

  it('draws nothing for percussion and sizes by string count', () => {
    expect(engraveFretboard({ track: { ...guitar, isPercussion: true }, width: 800, palette: PALETTE, notes: [] })).toEqual([]);
    expect(fretboardHeight(4)).toBeLessThan(fretboardHeight(6));
    expect(fretX({ nutX: 30, fretWidth: 20 }, 0)).toBe(15);
    expect(fretX({ nutX: 30, fretWidth: 20 }, 12)).toBe(260);
  });

  it('colours the chosen scale’s positions on all 24 frets, the roots apart, under the current notes', () => {
    // Arrange: A minor pentatonic (A C D E G)
    const scale = { pitchClasses: [9, 0, 2, 4, 7], root: 9 };

    // Act
    const commands = engraveFretboard({ track: guitar, width: 1000, palette: PALETTE, notes: [note(1, 5)], scale });

    // Assert: A on E 5/17, A 0/12/24, D 7/19, G 2/14, B 10/22, e 5/17
    const circles = commands.filter((command): command is CircleCommand => command.kind === 'circle');
    expect(circles.filter((circle) => circle.color === SCALE_COLORS.root)).toHaveLength(13);
    expect(circles.filter((circle) => circle.color === SCALE_COLORS.note).length).toBeGreaterThan(40);
    const circleColors = commands.map((command) => (command.kind === 'circle' ? command.color : ''));
    expect(circleColors.indexOf(PALETTE.accent)).toBeGreaterThan(circleColors.lastIndexOf(SCALE_COLORS.root));
    expect(texts(commands).filter((text) => text.size === 7.5 && text.color === SCALE_COLORS.text && text.text === 'A')).toHaveLength(13);
  });

  it('draws necks of 3 to 10 strings, every string named on all 24 frets', () => {
    for (const count of [3, 4, 5, 6, 7, 8, 9, 10]) {
      const track = { ...guitar, strings: Array.from({ length: count }, (_, i) => ({ number: i + 1, tuning: 64 - i * 5 })) };
      const commands = engraveFretboard({ track, width: 1000, palette: PALETTE, notes: [] });
      expect(texts(commands).filter((text) => text.size === 7.5)).toHaveLength(count * 25);
      expect(fretboardHeight(count)).toBe(FRETBOARD.top + (count - 1) * FRETBOARD.stringGap + FRETBOARD.bottom);
      expect(allFinite(commands)).toBe(true);
    }
  });

  it('outlines the cursor string at the nut', () => {
    const commands = engraveFretboard({ track: guitar, width: 800, palette: PALETTE, notes: [], cursorString: 3 });
    expect(commands.some((c) => c.kind === 'rect' && c.color === `${PALETTE.accent}40`)).toBe(true);
  });
});
