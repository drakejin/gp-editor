import { engraveFretboard, FRETBOARD, fretboardHeight, fretX, neckFret } from '../src/score/fretboard';
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
