import type { CircleCommand } from '../src/score/draw';
import { engraveFretboard, FRETBOARD, fretboardHeight, fretboardHoverRegions, fretX, neckFret } from '../src/score/fretboard';
import { SCALE_COLORS } from '../src/score/scale-marks';
import { makeSong, note } from '../test-support/songs';
import { PALETTE, allFinite, texts } from '../test-support/score-helpers';

const guitar = makeSong([[]]).tracks[0]!;
/** A 5-string banjo in open G: string 5 is the short high g drone. */
const banjo = { ...guitar, strings: [62, 59, 55, 50, 67].map((tuning, i) => ({ number: i + 1, tuning })) };
/** The fret positions of a neck 1000 points wide. */
const NECK_1000 = { nutX: FRETBOARD.openWidth, fretWidth: (1000 - FRETBOARD.openWidth - FRETBOARD.padRight) / FRETBOARD.frets };

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

  it('names a scale’s positions as the scale spells them', () => {
    const scale = { pitchClasses: [3, 5, 7, 8, 10, 0, 2], root: 3, names: ['Eb', 'F', 'G', 'Ab', 'Bb', 'C', 'D'] };
    const names = texts(engraveFretboard({ track: guitar, width: 1000, palette: PALETTE, notes: [], scale })).filter((text) => text.color === SCALE_COLORS.text);
    expect(new Set(names.map((text) => text.text))).toEqual(new Set(scale.names));
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

  it('starts a 5-string banjo’s short 5th string at the 5th fret: no positions before it, its peg named as the open g', () => {
    // Act
    const commands = engraveFretboard({ track: banjo, width: 1000, palette: PALETTE, notes: [] });

    // Assert
    const names = texts(commands).filter((t) => t.size === 7.5);
    const droneY = FRETBOARD.top + 4 * FRETBOARD.stringGap;
    const drone = names.filter((t) => t.y === droneY);
    expect(names).toHaveLength(4 * 25 + 20);
    expect(drone[0]).toMatchObject({ text: 'G', bold: true, x: fretX(NECK_1000, 5) });
    expect(drone.slice(0, 3).map((t) => t.text)).toEqual(['G', 'G#', 'A']);
    expect(commands.some((c) => c.kind === 'circle' && c.strokeWidth !== undefined && c.y === droneY)).toBe(true);
  });

  it('lights a banjo drone note where the string is fretted: the open drone at its peg, stored fret 2 at the 7th fret', () => {
    const commands = engraveFretboard({ track: banjo, width: 1000, palette: PALETTE, notes: [note(5, 0), note(1, 2)] });
    const fretted = engraveFretboard({ track: banjo, width: 1000, palette: PALETTE, notes: [note(5, 2)] });
    const lit = (list: typeof commands) => texts(list).filter((t) => t.color === PALETTE.accentText).map((t) => [t.text, t.x]);
    expect(lit(commands)).toEqual([['G', fretX(NECK_1000, 5)], ['E', fretX(NECK_1000, 2)]]);
    expect(lit(fretted)).toEqual([['A', fretX(NECK_1000, 7)]]);
  });

  it('outlines the cursor string at the nut', () => {
    const commands = engraveFretboard({ track: guitar, width: 800, palette: PALETTE, notes: [], cursorString: 3 });
    expect(commands.some((c) => c.kind === 'rect' && c.color === `${PALETTE.accent}40`)).toBe(true);
  });
});

describe('fretboardHoverRegions', () => {
  it('gives every position of every string its cell and the pitch it sounds', () => {
    // Act
    const regions = fretboardHoverRegions(guitar, 1000);
    const lowE5 = regions.find((region) => region.x <= fretX(NECK_1000, 5) && region.x + region.width > fretX(NECK_1000, 5) && region.pitch === 45);

    // Assert: six strings × 25 positions; the open high E is 64, the 12th fret of the low E is 52
    expect(regions).toHaveLength(6 * (FRETBOARD.frets + 1));
    expect(regions[0]).toEqual({ pitch: 64, x: 0, y: FRETBOARD.top - FRETBOARD.stringGap / 2, width: FRETBOARD.openWidth, height: FRETBOARD.stringGap });
    expect(regions.some((region) => region.pitch === 52 && Math.abs(region.x + region.width / 2 - fretX(NECK_1000, 12)) < 1e-6)).toBe(true);
    expect(lowE5).toBeDefined();
  });

  it('starts a banjo’s short string at its peg', () => {
    const fifth = fretboardHoverRegions(banjo, 1000).filter((region) => region.y > FRETBOARD.top + 3 * FRETBOARD.stringGap);
    expect(fifth).toHaveLength(FRETBOARD.frets + 1 - 5);
    expect(fifth[0]?.pitch).toBe(67);
  });
});
