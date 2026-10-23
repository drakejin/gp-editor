import { DEFAULT_CHANNEL, QUARTER } from '@gp-editor/core';
import type { Beat, Duration, Note, Song, Track, Voice } from '@gp-editor/core';
import { layoutMeasure } from '../src/lib/layout';
import { type DrawCommand, SMUFL, type TextCommand } from '../src/score/draw';
import { NOTATION, type NotationContext, engraveNotationMeasure } from '../src/score/notation';
import { ACCIDENTAL_PAREN_GLYPHS, FINGERING_GLYPHS, SLASH_GLYPHS } from '../src/score/symbols/smufl';
import { engraveTabMeasure } from '../src/score/tab';
import { PALETTE } from '../test-support/score-helpers';
import { beat, makeSong, note } from '../test-support/songs';

const TOP = NOTATION.above;
const SPACE = NOTATION.space;
const yOf = (position: number) => TOP + ((8 - position) * SPACE) / 2;
const EIGHTH: Duration = { ...QUARTER, value: 8 };
const HALF: Duration = { ...QUARTER, value: 2 };
const GRAND_PIANO = 0;

interface Options {
  readonly track?: Partial<Track>;
  readonly program?: number;
  readonly highlight?: NotationContext['highlight'];
}

function songOf(beats: Beat[], options: Options = {}): Song {
  const song = makeSong([beats]);
  const track = { ...song.tracks[0]!, ...options.track };
  const channels = options.program === undefined ? song.channels : [{ ...DEFAULT_CHANNEL, id: track.channelId, program: options.program }];
  return { ...song, channels, tracks: [track] };
}

function engrave(beats: Beat[], options: Options = {}): DrawCommand[] {
  const song = songOf(beats, options);
  const track = song.tracks[0]!;
  const context: NotationContext = {
    track,
    header: song.measureHeaders[0]!,
    measure: track.measures[0]!,
    layout: layoutMeasure(song, 0, 0),
    top: TOP,
    palette: PALETTE,
    highlight: options.highlight,
    isKeyboard: options.program === GRAND_PIANO,
  };
  return engraveNotationMeasure(context);
}

function engraveTab(beats: Beat[], options: Options = {}): DrawCommand[] {
  const song = songOf(beats, options);
  const track = song.tracks[0]!;
  return engraveTabMeasure({
    track, header: song.measureHeaders[0]!, measure: track.measures[0]!, layout: layoutMeasure(song, 0, 0),
    top: 20, marksY: 10, showRhythm: true, palette: PALETTE,
  });
}

const texts = (commands: readonly DrawCommand[], text?: string): TextCommand[] =>
  commands.filter((c): c is TextCommand => c.kind === 'text' && (text === undefined || c.text === text));

/** A beat whose first voice carries `marks`. */
function marked(start: number, notes: Note[], marks: Partial<Voice>, duration: Duration = QUARTER): Beat {
  const plain = beat(start, notes, duration);
  return { ...plain, voices: plain.voices.map((voice, i) => (i === 0 ? { ...voice, ...marks } : voice)) };
}

function eighths(...marks: Partial<Voice>[]): Beat[] {
  return marks.map((mark, i) => marked(960 + i * 480, [note(2, 1)], mark, EIGHTH));
}

describe('fingering in standard notation', () => {
  it('writes a left-hand finger left of the notehead, level with it', () => {
    // Act
    const commands = engrave([beat(960, [{ ...note(3, 2), leftFinger: 'index' }])]);

    // Assert
    const [head] = texts(commands, SMUFL.noteheadBlack);
    const [finger] = texts(commands, FINGERING_GLYPHS['1'].text);
    expect(finger!.x + FINGERING_GLYPHS['1'].advance * SPACE).toBeLessThan(head!.x);
    expect(Math.abs(finger!.y - head!.y)).toBeLessThanOrEqual(SPACE);
  });

  it('writes the thumb of the left hand as T, and keeps clear of an accidental', () => {
    // Act: G♯ on the third string
    const commands = engrave([beat(960, [{ ...note(3, 1), leftFinger: 'thumb' }])]);

    // Assert
    const [sharp] = texts(commands, SMUFL.accidentalSharp);
    const [finger] = texts(commands, FINGERING_GLYPHS.T.text);
    expect(finger!.x + FINGERING_GLYPHS.T.advance * SPACE).toBeLessThanOrEqual(sharp!.x);
  });

  it('writes right-hand fingers p i m a c away from the stem: above a stem going down, below one going up', () => {
    // Act
    const high = engrave([beat(960, [{ ...note(1, 12), rightFinger: 'middle' }])]);
    const low = engrave([beat(960, [{ ...note(6, 0), rightFinger: 'annular' }])]);

    // Assert
    const [highHead] = texts(high, SMUFL.noteheadBlack);
    const [lowHead] = texts(low, SMUFL.noteheadBlack);
    expect(texts(high, FINGERING_GLYPHS.m.text)[0]!.y).toBeLessThan(highHead!.y - SPACE / 2);
    expect(texts(low, FINGERING_GLYPHS.a.text)[0]!.y).toBeGreaterThan(lowHead!.y + SPACE);
  });

  it('writes piano fingering as 1–5 over the notes of a keyboard track, thumb = 1', () => {
    // Act
    const commands = engrave([beat(960, [{ ...note(1, 12), leftFinger: 'thumb' }, { ...note(2, 12), leftFinger: 'little' }])], { program: GRAND_PIANO });

    // Assert
    expect(texts(commands, FINGERING_GLYPHS['1'].text)).toHaveLength(1);
    expect(texts(commands, FINGERING_GLYPHS['5'].text)).toHaveLength(1);
    expect(texts(commands, FINGERING_GLYPHS.T.text)).toHaveLength(0);
    const heads = texts(commands, SMUFL.noteheadBlack);
    const fingers = [...texts(commands, FINGERING_GLYPHS['1'].text), ...texts(commands, FINGERING_GLYPHS['5'].text)];
    expect(Math.max(...fingers.map((finger) => finger.y))).toBeLessThan(Math.min(...heads.map((head) => head.y)));
  });
});

describe('rhythm slashes in standard notation', () => {
  it('draws a slashed beat as a slash on the middle line, without its noteheads and accidentals', () => {
    // Act
    const commands = engrave([marked(960, [note(1, 1), note(3, 1)], { isSlashed: true })]);

    // Assert
    const slashes = texts(commands, SLASH_GLYPHS.black.text);
    expect(slashes).toHaveLength(1);
    expect(slashes[0]!.y).toBe(yOf(4));
    expect(texts(commands, SMUFL.noteheadBlack)).toHaveLength(0);
    expect(texts(commands, SMUFL.accidentalSharp)).toHaveLength(0);
  });

  it('uses the white slash for a half note and slashes every beat of a track in slash notation', () => {
    // Act
    const commands = engrave([beat(960, [note(2, 1)], HALF), beat(2880, [note(2, 3)])], { track: { hasSlashNotation: true } });

    // Assert
    expect(texts(commands, SLASH_GLYPHS.half.text)).toHaveLength(1);
    expect(texts(commands, SLASH_GLYPHS.black.text)).toHaveLength(1);
  });

  it('lights the slash of the cursor’s beat whatever string the cursor is on', () => {
    // Act
    const commands = engrave([marked(960, [note(1, 1)], { isSlashed: true })], { highlight: { beatIndex: 0, string: 4 } });

    // Assert
    expect(texts(commands, SLASH_GLYPHS.black.text)[0]!.color).toBe(PALETTE.accent);
  });

  it('keeps a rest a rest', () => {
    const commands = engrave([marked(960, [], { isSlashed: true })]);
    expect(texts(commands, SLASH_GLYPHS.black.text)).toHaveLength(0);
  });
});

describe('rhythm slashes in tablature', () => {
  it('leaves the frets of a slashed beat out and draws a slash', () => {
    // Act
    const commands = engraveTab([marked(960, [note(2, 7)], { isSlashed: true }), beat(1920, [note(2, 9)])]);

    // Assert
    const labels = texts(commands).map((text) => text.text);
    expect(labels).not.toContain('7');
    expect(labels).toContain('9');
    expect(texts(commands, SLASH_GLYPHS.black.text)).toHaveLength(1);
  });
});

describe('shown accidentals', () => {
  it('writes a cautionary accidental in parentheses', () => {
    // Act: an E, natural in C major, with a reminder
    const commands = engrave([beat(960, [{ ...note(1, 0), accidentalDisplay: 'cautionary' }])]);

    // Assert
    const [natural] = texts(commands, SMUFL.accidentalNatural);
    const [left] = texts(commands, ACCIDENTAL_PAREN_GLYPHS.left.text);
    const [right] = texts(commands, ACCIDENTAL_PAREN_GLYPHS.right.text);
    expect(left!.x).toBeLessThan(natural!.x);
    expect(right!.x).toBeGreaterThan(natural!.x);
    const [head] = texts(commands, SMUFL.noteheadBlack);
    expect(right!.x + ACCIDENTAL_PAREN_GLYPHS.right.advance * SPACE).toBeLessThanOrEqual(head!.x);
  });

  it('writes a forced accidental without parentheses, and a needed one as usual', () => {
    // Act
    const forced = engrave([beat(960, [{ ...note(1, 0), accidentalDisplay: 'forced' }])]);
    const needed = engrave([beat(960, [{ ...note(1, 2), accidentalDisplay: 'cautionary' }])]);

    // Assert
    expect(texts(forced, SMUFL.accidentalNatural)).toHaveLength(1);
    expect(texts(forced, ACCIDENTAL_PAREN_GLYPHS.left.text)).toHaveLength(0);
    expect(texts(needed, SMUFL.accidentalSharp)).toHaveLength(1);
    expect(texts(needed, ACCIDENTAL_PAREN_GLYPHS.left.text)).toHaveLength(0);
  });
});

describe('beaming set by hand', () => {
  const polygons = (commands: readonly DrawCommand[]) => commands.filter((c) => c.kind === 'polygon');

  it('breaks a beam and joins one across the beat', () => {
    // Act
    const plain = engrave(eighths({}, {}, {}, {}));
    const broken = engrave(eighths({ beamToNext: 'break' }, {}, {}, {}));
    const joined = engrave(eighths({}, { beamToNext: 'join' }, {}, {}));

    // Assert: two beams of two, one beam of two, one beam of four
    expect(polygons(plain)).toHaveLength(2);
    expect(polygons(broken)).toHaveLength(1);
    expect(polygons(joined)).toHaveLength(1);
  });

  it('beams by the bar’s own grouping', () => {
    // Arrange
    const song = makeSong([eighths({}, {}, {}, {})]);
    const header = { ...song.measureHeaders[0]!, beamGrouping: { unit: 8, groups: [4, 4] } as const };
    const track = song.tracks[0]!;

    // Act
    const commands = engraveNotationMeasure({ track, header, measure: track.measures[0]!, layout: layoutMeasure(song, 0, 0), top: TOP, palette: PALETTE });

    // Assert
    expect(polygons(commands)).toHaveLength(1);
  });
});
