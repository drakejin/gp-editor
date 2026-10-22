import { engraveFretboard, FRETBOARD, fretboardHeight, fretX, neckFret } from '../src/score/fretboard';
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

  it('outlines the cursor string at the nut', () => {
    const commands = engraveFretboard({ track: guitar, width: 800, palette: PALETTE, notes: [], cursorString: 3 });
    expect(commands.some((c) => c.kind === 'rect' && c.color === `${PALETTE.accent}40`)).toBe(true);
  });
});
