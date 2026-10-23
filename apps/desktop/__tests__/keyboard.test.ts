import type { CircleCommand, RectCommand } from '../src/score/draw';
import { SCALE_COLORS } from '../src/score/scale-marks';
import { KEY_COLORS, PIANO, engraveKeyboard, keyboardHeight, pianoKey, soundingPitches } from '../src/score/keyboard';
import { PALETTE, allFinite, texts } from '../test-support/score-helpers';
import { makeSong, note } from '../test-support/songs';

const WIDTH = 1040;
const guitar = makeSong([[]]).tracks[0]!;

const rects = (commands: ReturnType<typeof engraveKeyboard>): RectCommand[] => commands.filter((command): command is RectCommand => command.kind === 'rect');

describe('engraveKeyboard', () => {
  it('draws the 88 keys of a piano, A0 to C8: 52 white and 36 black', () => {
    // Act
    const commands = engraveKeyboard({ width: WIDTH, pitches: [], palette: PALETTE });

    // Assert
    expect(rects(commands).filter((rect) => rect.color === KEY_COLORS.white)).toHaveLength(52);
    expect(rects(commands).filter((rect) => rect.color === KEY_COLORS.black)).toHaveLength(36);
    expect(PIANO.highest - PIANO.lowest + 1).toBe(88);
    expect(allFinite(commands)).toBe(true);
  });

  it('lays the keys out by pitch, a black key between its white neighbours, across the whole width', () => {
    // Act
    const [c4, cSharp4, d4] = [60, 61, 62].map((pitch) => pianoKey(WIDTH, pitch));
    const [lowest, highest] = [pianoKey(WIDTH, PIANO.lowest), pianoKey(WIDTH, PIANO.highest)];

    // Assert
    expect(cSharp4!.isBlack).toBe(true);
    expect(c4!.x + c4!.width).toBeGreaterThan(cSharp4!.x);
    expect(cSharp4!.x + cSharp4!.width).toBeGreaterThan(d4!.x);
    expect(cSharp4!.width).toBeLessThan(c4!.width);
    expect(lowest!.x).toBe(0);
    expect(highest!.x + highest!.width).toBeCloseTo(WIDTH);
    expect(pianoKey(WIDTH, PIANO.lowest - 1)).toBeUndefined();
  });

  it('lights the keys of the sounding notes, white and black, and names them', () => {
    // Act
    const commands = engraveKeyboard({ width: WIDTH, pitches: [64, 61], palette: PALETTE });

    // Assert
    expect(rects(commands).filter((rect) => rect.color === PALETTE.accent)).toHaveLength(2);
    expect(texts(commands).filter((text) => text.color === PALETTE.accentText).map((text) => text.text).sort()).toEqual(['C#4', 'E4']);
  });

  it('marks every C so the octaves can be found, once when the C is lit', () => {
    // Act
    const plain = texts(engraveKeyboard({ width: WIDTH, pitches: [], palette: PALETTE })).map((text) => text.text);
    const litC4 = texts(engraveKeyboard({ width: WIDTH, pitches: [60], palette: PALETTE })).map((text) => text.text);

    // Assert
    expect(plain).toEqual(['C1', 'C2', 'C3', 'C4', 'C5', 'C6', 'C7', 'C8']);
    expect(litC4.filter((text) => text === 'C4')).toHaveLength(1);
  });

  it('leaves out pitches a piano does not have', () => {
    const commands = engraveKeyboard({ width: WIDTH, pitches: [12, 120], palette: PALETTE });
    expect(rects(commands).filter((rect) => rect.color === PALETTE.accent)).toHaveLength(0);
  });

  it('marks every key of the chosen scale with a dot, the root’s in its own colour', () => {
    // Arrange: A minor pentatonic (A C D E G)
    const scale = { pitchClasses: [9, 0, 2, 4, 7], root: 9 };

    // Act
    const commands = engraveKeyboard({ width: WIDTH, pitches: [64], palette: PALETTE, scale });

    // Assert: A0 … A7 are roots; C D E G of every octave the other notes; the sounding E4 stays lit
    const dots = commands.filter((command): command is CircleCommand => command.kind === 'circle');
    expect(dots.filter((dot) => dot.color === SCALE_COLORS.root)).toHaveLength(8);
    expect(dots.filter((dot) => dot.color === SCALE_COLORS.note)).toHaveLength(8 + 7 + 7 + 7);
    expect(rects(commands).filter((rect) => rect.color === PALETTE.accent)).toHaveLength(1);
    expect(allFinite(commands)).toBe(true);
  });

  it('has the height of its white keys and room around them', () => {
    expect(keyboardHeight()).toBeGreaterThanOrEqual(PIANO.whiteKeyHeight);
  });
});

describe('soundingPitches', () => {
  it('gives each note’s pitch on the neck, counting the capo, without dead notes', () => {
    // Arrange: standard tuning (string 1 = E4 = 64), capo at the 2nd fret
    const capo2 = { ...guitar, offset: 2 };

    // Act
    const pitches = soundingPitches(capo2, [note(1, 3), note(6, 0), note(5, 2, { deadNote: true }), note(9, 1)]);

    // Assert
    expect(pitches).toEqual([69, 42]);
  });
});
