import { EMPTY_VOICE, QUARTER, type Beat, type Note, type Voice } from '@gp-editor/core';
import { layoutMeasure } from '../src/lib/layout';
import type { DrawCommand, RectCommand, TextCommand } from '../src/score/draw';
import { engraveTabMeasure } from '../src/score/tab';
import { tabStringY } from '../src/score/symbols/tab-geometry';
import { PALETTE } from '../test-support/score-helpers';
import { beat, makeSong, note } from '../test-support/songs';

/** The test palette with Guitar Pro 8's four voice colours. */
const VOICED = { ...PALETTE, voices: ['#A00001', '#00A002', '#A000A3', '#5000A4'] };
const TOP = 60;

function voice(notes: Note[]): Voice {
  return { duration: QUARTER, notes, isEmpty: false, direction: 'none' };
}

/** One beat: voice 1 fret 1 on string 1, voice 2 fret 2 on string 6, voice 3 fret 3 on string 3, voice 4 fret 4 on string 5. */
const FOUR: Beat = { ...beat(960, []), voices: [voice([note(1, 1)]), voice([note(6, 2)]), voice([note(3, 3)]), voice([note(5, 4)])] };

function engrave(overrides: Partial<Parameters<typeof engraveTabMeasure>[0]> = {}, beats: Beat[] = [FOUR]): DrawCommand[] {
  const song = makeSong([beats]);
  const track = song.tracks[0]!;
  return engraveTabMeasure({
    track,
    header: song.measureHeaders[0]!,
    measure: track.measures[0]!,
    layout: layoutMeasure(song, 0, 0),
    top: TOP,
    marksY: 44,
    showRhythm: false,
    palette: VOICED,
    ...overrides,
  });
}

const fretOn = (commands: readonly DrawCommand[], string: number) =>
  commands.filter((c): c is TextCommand => c.kind === 'text' && c.font === 'mono' && c.y === tabStringY(TOP, string));

describe('the tab in four voices', () => {
  it('writes every voice’s frets, voice 1 in ink and voices 2, 3 and 4 in their colours', () => {
    // Act
    const commands = engrave();

    // Assert
    expect([1, 6, 3, 5].map((string) => fretOn(commands, string).map((fret) => [fret.text, fret.color]))).toEqual([
      [['1', VOICED.text]],
      [['2', VOICED.voices[1]]],
      [['3', VOICED.voices[2]]],
      [['4', VOICED.voices[3]]],
    ]);
  });

  it('fades the voices not being edited', () => {
    const commands = engrave({ editedVoiceIndex: 2 });
    expect([1, 6, 3, 5].map((string) => fretOn(commands, string)[0]?.color)).toEqual([VOICED.muted, VOICED.muted, VOICED.voices[2], VOICED.muted]);
  });

  it('washes the cursor in its voice’s colour and shows that voice’s note on it', () => {
    // Act: the cursor in voice 3 on string 3; in voice 1 on string 1
    const inVoice3 = engrave({ editedVoiceIndex: 2, cursor: { beatIndex: 0, string: 3, voiceIndex: 2 } });
    const inVoice1 = engrave({ editedVoiceIndex: 0, cursor: { beatIndex: 0, string: 1, voiceIndex: 0 } });

    // Assert
    const box = (commands: readonly DrawCommand[]) => commands.filter((c): c is RectCommand => c.kind === 'rect' && c.radius === 4).pop();
    expect(box(inVoice3)?.color).toBe(`${VOICED.voices[2]}4D`);
    expect(box(inVoice1)?.color).toBe(VOICED.selection);
    expect(fretOn(inVoice3, 3).pop()).toMatchObject({ text: '3', color: VOICED.text });
  });

  it('keeps another voice’s note visible, faded, under a cursor on an empty position of the edited voice', () => {
    // Act: the cursor in voice 2 on string 1, where voice 1 plays fret 1
    const commands = engrave({ editedVoiceIndex: 1, cursor: { beatIndex: 0, string: 1, voiceIndex: 1 } }, [{ ...beat(960, []), voices: [voice([note(1, 1)]), EMPTY_VOICE] }]);

    // Assert
    expect(fretOn(commands, 1).pop()).toMatchObject({ text: '1', color: VOICED.muted });
  });
});
