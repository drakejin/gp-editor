import { QUARTER, drumNotation } from '@gp-editor/core';
import type { Beat, Duration, Song } from '@gp-editor/core';
import { layoutMeasure } from '../src/lib/layout';
import { type DrawCommand, type LineCommand, SMUFL, type TextCommand } from '../src/score/draw';
import { NOTATION, engraveNotationMeasure } from '../src/score/notation';
import { DRUM_ROOM, drumHeadGlyph, drumPlacement } from '../src/score/notation/drum-notes';
import { GLYPH_WIDTH, STAFF, STEM } from '../src/score/notation/metrics';
import { PALETTE } from '../test-support/score-helpers';
import { beat, makeSong, note } from '../test-support/songs';

const TOP = NOTATION.above;
const SPACE = NOTATION.space;
const yOf = (position: number) => TOP + ((8 - position) * SPACE) / 2;
const HALF: Duration = { ...QUARTER, value: 2 };

function drumSong(beats: Beat[]): Song {
  const song = makeSong([beats]);
  const track = song.tracks[0]!;
  return { ...song, tracks: [{ ...track, isPercussion: true, strings: track.strings.map((s) => ({ ...s, tuning: 0 })) }] };
}

/** The commands of a one-bar drum track holding `beats`. */
function engraveDrums(beats: Beat[]): DrawCommand[] {
  const song = drumSong(beats);
  const track = song.tracks[0]!;
  return engraveNotationMeasure({ track, header: song.measureHeaders[0]!, measure: track.measures[0]!, layout: layoutMeasure(song, 0, 0), top: TOP, palette: PALETTE });
}

function glyphs(commands: readonly DrawCommand[], text: string): TextCommand[] {
  return commands.filter((c): c is TextCommand => c.kind === 'text' && c.text === text);
}

/** One quarter note per key, a beat apart. */
const hits = (...keys: number[]) => keys.map((key, i) => beat(960 + i * 960, [note(1, key)]));

describe('drumPlacement', () => {
  it.each([
    [36, 1, SMUFL.noteheadBlack],
    [38, 5, SMUFL.noteheadBlack],
    [42, 9, SMUFL.noteheadXBlack],
    [46, 9, SMUFL.noteheadCircleX],
    [92, 9, SMUFL.noteheadCircleSlash],
    [44, -1, SMUFL.noteheadXBlack],
    [41, 3, SMUFL.noteheadBlack],
    [43, 2, SMUFL.noteheadBlack],
    [45, 3, SMUFL.noteheadBlack],
    [47, 4, SMUFL.noteheadBlack],
    [48, 6, SMUFL.noteheadBlack],
    [50, 7, SMUFL.noteheadBlack],
    [49, 10, SMUFL.noteheadHeavyX],
    [57, 9, SMUFL.noteheadHeavyX],
    [52, 11, SMUFL.noteheadHeavyXHat],
    [55, 10, SMUFL.noteheadXBlack],
    [51, 8, SMUFL.noteheadXBlack],
    [53, 8, SMUFL.noteheadDiamondWhite],
  ])('writes key %i where Guitar Pro does: position %i', (key, position, glyph) => {
    // Act
    const placement = drumPlacement(key);

    // Assert
    expect(placement.position).toBe(position);
    expect(drumHeadGlyph(placement.noteheads, 4).glyph).toBe(glyph);
  });

  it('keeps a key the kit lacks on the middle line with a plain notehead', () => {
    expect(drumPlacement(27)).toEqual({ position: STAFF.middleLine, noteheads: { black: 'noteheadBlack', half: 'noteheadHalf', whole: 'noteheadWhole' } });
  });

  it('writes a drum whose line is beyond the staff room on the middle line, with its own notehead', () => {
    // Arrange: the guiro sits 30 steps below the bottom line in Guitar Pro's kit; the woodblock 17 above.
    const guiro = drumNotation(73)!;

    // Act / Assert
    expect(guiro.position).toBeLessThan(DRUM_ROOM.lowest);
    expect(drumPlacement(73)).toMatchObject({ position: STAFF.middleLine, noteheads: guiro.noteheads });
    expect(drumPlacement(77)).toMatchObject({ position: STAFF.middleLine, noteheads: { black: 'noteheadTriangleUpBlack' } });
    expect(drumPlacement(61).position).toBe(15); // low bongo: in the room, three ledger lines up
  });

  it('picks the notehead of the note value', () => {
    const placement = drumPlacement(100); // cowbell low (tip)

    expect(drumHeadGlyph(placement.noteheads, 4).glyph).toBe(SMUFL.noteheadXBlack);
    expect(drumHeadGlyph(placement.noteheads, 2).glyph).toBe(SMUFL.noteheadXHalf);
    expect(drumHeadGlyph(placement.noteheads, 1).glyph).toBe(SMUFL.noteheadXWhole);
  });
});

describe('drums on the score', () => {
  it('writes open and closed hi-hats apart: a circled x for the open one', () => {
    // Act
    const commands = engraveDrums(hits(42, 46));

    // Assert
    expect(glyphs(commands, SMUFL.noteheadXBlack).map((c) => c.y)).toEqual([yOf(9)]);
    expect(glyphs(commands, SMUFL.noteheadCircleX).map((c) => c.y)).toEqual([yOf(9)]);
  });

  it('writes crash, china and ride bell with their own noteheads', () => {
    const commands = engraveDrums(hits(49, 52, 53));

    expect(glyphs(commands, SMUFL.noteheadHeavyX).map((c) => c.y)).toEqual([yOf(10)]);
    expect(glyphs(commands, SMUFL.noteheadHeavyXHat).map((c) => c.y)).toEqual([yOf(11)]);
    expect(glyphs(commands, SMUFL.noteheadDiamondWhite).map((c) => c.y)).toEqual([yOf(8)]);
  });

  it('draws ledger lines for drums above and below the staff', () => {
    // China above the top line, pedal hi-hat in the space under the bottom line, high conga three ledger lines down.
    const commands = engraveDrums(hits(52, 44, 63));
    const ledgers = commands.filter((c): c is LineCommand => c.kind === 'line' && c.width === 1.2);

    expect(ledgers.map((c) => c.y1).sort((a, b) => a - b)).toEqual([yOf(10), yOf(-2), yOf(-4), yOf(-6)]);
  });

  it('writes the edge of the ride with its pictogram above the staff', () => {
    const commands = engraveDrums(hits(93));
    const [edge] = glyphs(commands, SMUFL.pictEdgeOfCymbal);

    expect(edge).toBeDefined();
    expect(edge!.y).toBeLessThan(yOf(8));
    expect(edge!.size).toBeLessThan(4 * SPACE);
  });

  it('writes a choke as a dot and a mute in parentheses', () => {
    const commands = engraveDrums(hits(97, 104));

    expect(glyphs(commands, String.fromCodePoint(0xe4a2)).length + glyphs(commands, String.fromCodePoint(0xe4a3)).length).toBe(1);
    expect(glyphs(commands, SMUFL.noteheadParenthesis).map((c) => c.y)).toEqual([yOf(13)]);
  });

  it('writes a half-note drum with its half notehead', () => {
    const commands = engraveDrums([beat(960, [note(1, 100)], HALF)]);

    expect(glyphs(commands, SMUFL.noteheadXHalf)).toHaveLength(1);
  });

  it('attaches the stem at the edge of a wide crash notehead', () => {
    // Arrange: a crash alone, stem down (above the middle line).
    const commands = engraveDrums(hits(49));
    const [head] = glyphs(commands, SMUFL.noteheadHeavyX);
    const stem = commands.find((c): c is LineCommand => c.kind === 'line' && c.width === STEM.width && c.x1 === c.x2 && Math.abs(c.x1 - head!.x) < 2 * SPACE);

    // Assert: the stem leaves the notehead's left edge (it is wider than a black notehead), not inside it.
    expect(stem!.x1).toBeCloseTo(head!.x + STEM.width / 2, 5);
    expect(stem!.x1).toBeLessThan(head!.x + (1.54 * SPACE - GLYPH_WIDTH.noteheadBlack) / 2);
  });

  it('never moves drums by an octave', () => {
    const commands = engraveDrums(hits(61, 64));

    expect(commands.some((c) => c.kind === 'text' && /8v|15m/.test(c.text))).toBe(false);
  });
});
