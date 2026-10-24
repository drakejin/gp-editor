import { EMPTY_VOICE, QUARTER } from '@gp-editor/core';
import type { Beat, Duration, Note, Voice } from '@gp-editor/core';
import { layoutMeasure } from '../src/lib/layout';
import { type DrawCommand, SMUFL, type TextCommand } from '../src/score/draw';
import { NOTATION, engraveNotationMeasure } from '../src/score/notation';
import type { Highlight } from '../src/score/notation/engrave-voices';
import { PALETTE } from '../test-support/score-helpers';
import { beat, makeSong, note } from '../test-support/songs';

const TOP = NOTATION.above;
const SPACE = NOTATION.space;
const yOf = (position: number) => TOP + ((8 - position) * SPACE) / 2;
const EIGHTH: Duration = { ...QUARTER, value: 8 };
/** The test palette with Guitar Pro 8's four voice colours. */
const VOICED = { ...PALETTE, voices: ['#A00001', '#00A002', '#A000A3', '#5000A4'] };

function voice(notes: Note[], duration: Duration = QUARTER): Voice {
  return { duration, notes, isEmpty: false, direction: 'none' };
}

/** One beat at the bar's start holding the given voices (undefined = no event in that voice). */
function voicesBeat(...voices: (Voice | undefined)[]): Beat {
  return { ...beat(960, []), voices: voices.map((v) => v ?? EMPTY_VOICE) };
}

interface EngraveOptions {
  readonly editedVoiceIndex?: number;
  readonly highlight?: Highlight;
  readonly palette?: typeof VOICED;
}

function engrave(beats: Beat[], options: EngraveOptions = {}): DrawCommand[] {
  const song = makeSong([beats]);
  const track = song.tracks[0]!;
  return engraveNotationMeasure({
    track,
    header: song.measureHeaders[0]!,
    measure: track.measures[0]!,
    layout: layoutMeasure(song, 0, 0),
    top: TOP,
    palette: options.palette ?? PALETTE,
    highlight: options.highlight,
    editedVoiceIndex: options.editedVoiceIndex,
  });
}

const glyphs = (commands: readonly DrawCommand[], text: string): TextCommand[] => commands.filter((c): c is TextCommand => c.kind === 'text' && c.text === text);
const headAt = (commands: readonly DrawCommand[], position: number) => glyphs(commands, SMUFL.noteheadBlack).find((c) => c.y === yOf(position));

/** Written an octave up: voice 1 A5 (position 10), voice 2 E4 (0), voice 3 E5 (7), voice 4 E3 (-7). */
const FOUR_EIGHTHS = [voicesBeat(voice([note(1, 5)], EIGHTH), voice([note(4, 2)], EIGHTH), voice([note(2, 5)], EIGHTH), voice([note(6, 0)], EIGHTH))];

describe('four voices on the staff', () => {
  it('stems voices 1 and 3 up and voices 2 and 4 down', () => {
    // Act
    const commands = engrave(FOUR_EIGHTHS);

    // Assert
    expect(glyphs(commands, SMUFL.flagUp[0]!)).toHaveLength(2);
    expect(glyphs(commands, SMUFL.flagDown[0]!)).toHaveLength(2);
  });

  it('puts the rests of voices 1 and 3 above the middle line and of voices 2 and 4 below, apart from each other', () => {
    // Act: all four voices rest on the same beat
    const commands = engrave([voicesBeat(voice([]), voice([]), voice([]), voice([]))]);

    // Assert: drawn in voice order, top to bottom 3, 1, 2, 4
    const [first, second, third, fourth] = glyphs(commands, SMUFL.restQuarter).map((rest) => rest.y);
    expect(first).toBe(yOf(8));
    expect(second).toBe(yOf(0));
    expect(third).toBeLessThanOrEqual(first! - 3 * SPACE);
    expect(fourth).toBeGreaterThanOrEqual(second! + 3 * SPACE);
  });

  it('stacks a voice 3 rest above voice 1’s rest where that rest moved up over voice 2’s notes', () => {
    // Act: voice 2 plays D5 (position 6), voices 1 and 3 rest
    const commands = engrave([voicesBeat(voice([]), voice([note(2, 3)]), voice([]))]);

    // Assert
    const [first, third] = glyphs(commands, SMUFL.restQuarter).map((rest) => rest.y);
    expect(third).toBeLessThanOrEqual(first! - 3 * SPACE);
  });

  it('keeps a voice 3 rest clear of voice 1’s notes above it', () => {
    // Act: voice 1 plays G5 (position 9) where voice 3 rests
    const commands = engrave([voicesBeat(voice([note(1, 3)]), undefined, voice([]))]);

    // Assert
    const [rest] = glyphs(commands, SMUFL.restQuarter);
    expect(rest!.y).toBeLessThanOrEqual(yOf(13));
  });

  it('moves voice 3 beside voice 1 when their notes are a second apart, both stems up', () => {
    // Act: voice 1 A4 (position 3), voice 3 B4 (position 4)
    const commands = engrave([voicesBeat(voice([note(3, 2)]), undefined, voice([note(3, 4)]))]);

    // Assert
    expect(headAt(commands, 4)!.x).toBeGreaterThanOrEqual(headAt(commands, 3)!.x + 1.18 * SPACE - 1);
  });

  it('shares a unison of voices 1 and 3', () => {
    const commands = engrave([voicesBeat(voice([note(3, 2)]), undefined, voice([note(3, 2)]))]);
    const [a, b] = glyphs(commands, SMUFL.noteheadBlack);
    expect(a!.x).toBe(b!.x);
  });
});

describe('the voice being edited', () => {
  it('draws the edited voice in ink and fades the other voices, rests and stems included', () => {
    // Act: voice 2 is edited
    const commands = engrave(FOUR_EIGHTHS, { editedVoiceIndex: 1 });

    // Assert
    expect(headAt(commands, 0)?.color).toBe(PALETTE.text);
    expect([10, 7, -7].map((position) => headAt(commands, position)?.color)).toEqual([PALETTE.muted, PALETTE.muted, PALETTE.muted]);
    expect(glyphs(commands, SMUFL.flagDown[0]!).map((flag) => flag.color).sort()).toEqual([PALETTE.muted, PALETTE.text].sort());
  });

  it('fades nothing when no voice is being edited (print) or the bar holds only the edited voice', () => {
    const plain = engrave(FOUR_EIGHTHS);
    expect(glyphs(plain, SMUFL.noteheadBlack).every((head) => head.color === PALETTE.text)).toBe(true);
    const single = engrave([beat(960, [note(1, 5)])], { editedVoiceIndex: 0 });
    expect(glyphs(single, SMUFL.noteheadBlack).map((head) => head.color)).toEqual([PALETTE.text]);
  });

  it('lights the cursor’s note in its voice only, in the voice’s colour', () => {
    // Act: the cursor on string 2 in voice 3; voice 1 has no note on string 2
    const commands = engrave(FOUR_EIGHTHS, { palette: VOICED, editedVoiceIndex: 2, highlight: { beatIndex: 0, string: 2, voiceIndex: 2 } });

    // Assert
    expect(headAt(commands, 7)?.color).toBe(VOICED.voices[2]);
    expect(headAt(commands, 10)?.color).toBe(PALETTE.muted);
  });

  it('lights every voice’s note at the playing beat', () => {
    const commands = engrave(FOUR_EIGHTHS, { palette: VOICED, highlight: { beatIndex: 0 } });
    expect(glyphs(commands, SMUFL.noteheadBlack).every((head) => head.color === VOICED.accent)).toBe(true);
  });

  it('shows a faint whole rest in the voice’s colour where the edited voice has nothing in the bar', () => {
    // Act
    const commands = engrave([beat(960, [note(1, 5)])], { palette: VOICED, editedVoiceIndex: 2 });

    // Assert
    const placeholders = glyphs(commands, SMUFL.restWhole);
    expect(placeholders).toHaveLength(1);
    expect(placeholders[0]!.color.startsWith(VOICED.voices[2]!)).toBe(true);
    expect(placeholders[0]!.color).toHaveLength(9);
  });

  it('puts voice 3’s placeholder above voice 1’s whole rest, apart from it', () => {
    // Act: voice 1 rests the whole bar, voice 2 plays, voice 3 is edited
    const whole: Duration = { ...QUARTER, value: 1 };
    const commands = engrave([voicesBeat(voice([], whole), voice([note(6, 0)], whole))], { palette: VOICED, editedVoiceIndex: 2 });

    // Assert: a whole rest is a space tall, hanging from its line; two spaces keep them apart
    const [rest, placeholder] = glyphs(commands, SMUFL.restWhole);
    expect(placeholder!.y).toBeLessThanOrEqual(rest!.y - 2 * SPACE);
  });

  it('shows no placeholder where the edited voice plays', () => {
    const commands = engrave(FOUR_EIGHTHS, { palette: VOICED, editedVoiceIndex: 3 });
    expect(glyphs(commands, SMUFL.restWhole)).toHaveLength(0);
  });
});
