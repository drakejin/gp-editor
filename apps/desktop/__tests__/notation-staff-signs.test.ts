import { QUARTER } from '@gp-editor/core';
import type { Beat, Clef, Measure, Ottava, Song, Track } from '@gp-editor/core';
import { layoutMeasure } from '../src/lib/layout';
import {
  type DrawCommand,
  type LineCommand,
  SMUFL,
  type TextCommand,
} from '../src/score/draw';
import {
  NOTATION,
  engraveNotationMeasure,
  engraveNotationRowHeader,
  notationRowHeaderWidth,
} from '../src/score/notation';
import {
  CLEF_CHANGE_SCALE,
  MUSIC_FONT_SIZE,
  OTTAVA,
} from '../src/score/notation/metrics';
import {
  clefKind,
  spellPitch,
  staffPosition,
} from '../src/score/notation/pitch';
import { PALETTE } from '../test-support/score-helpers';
import { beat, makeSong, note } from '../test-support/songs';

const TOP = NOTATION.above;
const yOf = (position: number) => TOP + ((8 - position) * NOTATION.space) / 2;
/** Written E5 (string 1, open; guitar is written an octave above where it sounds): the top space of the treble staff. */
const E5 = 7;
/** Written E3: the low E string, open, three ledger lines under the staff. */
const E3 = -7;

const signed = (beatValue: Beat, ottava: Ottava | undefined): Beat =>
  ottava === undefined ? beatValue : { ...beatValue, ottava };

function withClefs(song: Song, clefs: readonly Clef[]): Song {
  const [track] = song.tracks;
  return {
    ...song,
    tracks: [
      {
        ...track!,
        measures: track!.measures.map((measure, i) => ({
          ...measure,
          clef: clefs[i] ?? measure.clef,
        })),
      },
    ],
  };
}

interface EngraveOptions {
  readonly isRowStart?: boolean;
  readonly clefs?: readonly Clef[];
}

/** Engraves bar `measureIndex` of `measures` with its neighbours. */
function engrave(
  measures: Beat[][],
  measureIndex: number,
  options: EngraveOptions = {},
): DrawCommand[] {
  const song = withClefs(makeSong(measures), options.clefs ?? []);
  const track = song.tracks[0]!;
  return engraveNotationMeasure({
    track,
    header: song.measureHeaders[measureIndex]!,
    measure: track.measures[measureIndex]!,
    layout: layoutMeasure(song, 0, measureIndex),
    previousMeasure: track.measures[measureIndex - 1],
    nextMeasure: track.measures[measureIndex + 1],
    isRowStart: options.isRowStart ?? false,
    top: TOP,
    palette: PALETTE,
  });
}

function texts(commands: readonly DrawCommand[], text: string): TextCommand[] {
  return commands.filter(
    (c): c is TextCommand => c.kind === 'text' && c.text === text,
  );
}

const heads = (commands: readonly DrawCommand[]) =>
  texts(commands, SMUFL.noteheadBlack);
const bracketLines = (commands: readonly DrawCommand[]) =>
  commands.filter(
    (c): c is LineCommand => c.kind === 'line' && c.width === OTTAVA.lineWidth,
  );

/** A bar of four quarter notes on string 1 at these frets, each beat under its octave sign. */
function bar(
  frets: readonly number[],
  signs: readonly (Ottava | undefined)[] = [],
): Beat[] {
  return frets.map((fret, i) =>
    signed(beat(960 + i * 960, [note(1, fret)]), signs[i]),
  );
}

describe('written octave signs', () => {
  it('draws the beats under an 8va an octave lower than written, with one 8va mark over them', () => {
    // Act
    const commands = engrave([bar([0, 0, 0, 0], ['8va', '8va'])], 0);

    // Assert
    expect(heads(commands).map(c => c.y)).toEqual([
      yOf(E5 - 7),
      yOf(E5 - 7),
      yOf(E5),
      yOf(E5),
    ]);
    expect(texts(commands, '8va')).toHaveLength(1);
    expect(bracketLines(commands)).toHaveLength(2);
  });

  it('draws 8vb and 15mb notes higher with the mark under the staff, and 15ma two octaves lower', () => {
    // Act: the low E (written E3, under the staff) under 8vb and 15mb
    const lowE = (sign: Ottava) => signed(beat(960, [note(6, 0)]), sign);
    const below = engrave(
      [[lowE('8vb'), { ...lowE('15mb'), start: beat(1920, []).start }]],
      0,
    );
    const above = engrave([bar([0], ['15ma'])], 0);

    // Assert
    expect(heads(below).map(c => c.y)).toEqual([yOf(E3 + 7), yOf(E3 + 14)]);
    expect(texts(below, '8vb')[0]!.y).toBeGreaterThan(yOf(0));
    expect(texts(below, '15mb')).toHaveLength(1);
    expect(heads(above)[0]!.y).toBe(yOf(E5 - 14));
    expect(texts(above, '15ma')).toHaveLength(1);
  });

  it('writes a sign the beat has even where the notes would not need one', () => {
    // Act: written E4 (string 6 fret 12) sits on the staff
    const commands = engrave([[signed(beat(960, [note(6, 12)]), '8vb')]], 0);

    // Assert
    expect(texts(commands, '8vb')).toHaveLength(1);
  });

  it('draws a sign that would move the notes out of the staff’s room as no sign', () => {
    // Act: an 8va over the low E would write it four octaves of ledger lines down
    const commands = engrave([[signed(beat(960, [note(6, 0)]), '15ma')]], 0);

    // Assert
    expect(heads(commands)[0]!.y).toBe(yOf(E3));
    expect(texts(commands, '15ma')).toHaveLength(0);
  });

  it('puts one mark over both voices of the beats under the sign', () => {
    // Arrange
    const twoVoices: Beat = {
      ...signed(beat(960, [note(1, 0)]), '8va'),
      voices: [
        {
          duration: QUARTER,
          notes: [note(1, 0)],
          isEmpty: false,
          direction: 'none',
        },
        {
          duration: QUARTER,
          notes: [note(3, 0)],
          isEmpty: false,
          direction: 'none',
        },
      ],
    };

    // Act
    const commands = engrave([[twoVoices]], 0);

    // Assert
    expect(texts(commands, '8va')).toHaveLength(1);
  });

  it('runs the line on from the bar before without a new mark, and on into the next bar without a hook', () => {
    // Arrange
    const measures = [
      bar([0, 0, 0, 0], [undefined, undefined, undefined, '8va']),
      bar([0, 0, 0, 0], ['8va', '8va', '8va', '8va']),
      bar([0], ['8va']),
    ];

    // Act
    const middle = engrave(measures, 1);
    const atRowStart = engrave(measures, 1, { isRowStart: true });
    const last = engrave(measures, 2);

    // Assert
    expect(texts(middle, '8va')).toHaveLength(0);
    const [line, ...hooks] = bracketLines(middle);
    expect(hooks).toHaveLength(0);
    expect(line!.x1).toBe(0);
    expect(line!.x2).toBe(layoutMeasure(makeSong(measures), 0, 1).width);
    expect(texts(atRowStart, '8va')).toHaveLength(1);
    expect(texts(last, '8va')).toHaveLength(0);
    expect(bracketLines(last).filter(c => c.x1 === c.x2)).toHaveLength(1);
  });

  it('draws the sign over rests under it too', () => {
    // Act
    const commands = engrave(
      [
        [
          signed(
            {
              ...beat(960, []),
              voices: [
                {
                  duration: QUARTER,
                  notes: [],
                  isEmpty: false,
                  direction: 'none',
                },
              ],
            },
            '8va',
          ),
        ],
      ],
      0,
    );

    // Assert
    expect(texts(commands, '8va')).toHaveLength(1);
  });
});

describe('C clefs', () => {
  const GUITAR: Track = makeSong([[]]).tracks[0]!;
  const measure = (keySignature: number, clef: Clef): Measure => ({
    headerIndex: 0,
    clef,
    keySignature,
    beats: [],
  });

  it('places notes on the alto and tenor staves (bottom lines F3 and D3)', () => {
    expect(clefKind(GUITAR, 'alto')).toBe('alto');
    expect(clefKind(GUITAR, 'tenor')).toBe('tenor');
    expect(staffPosition(spellPitch(53, 0).step, 'alto')).toBe(0);
    expect(staffPosition(spellPitch(60, 0).step, 'alto')).toBe(4);
    expect(staffPosition(spellPitch(50, 0).step, 'tenor')).toBe(0);
    expect(staffPosition(spellPitch(60, 0).step, 'tenor')).toBe(6);
  });

  it('draws the octave-down C clef on the middle line (alto) or the fourth line (tenor), with their key signatures', () => {
    // Act
    const alto = engraveNotationRowHeader(
      GUITAR,
      measure(2, 'alto'),
      TOP,
      PALETTE,
    );
    const tenor = engraveNotationRowHeader(
      GUITAR,
      measure(-2, 'tenor'),
      TOP,
      PALETTE,
    );
    const tenorSharps = engraveNotationRowHeader(
      GUITAR,
      measure(3, 'tenor'),
      TOP,
      PALETTE,
    );

    // Assert
    expect(texts(alto, SMUFL.cClef8vb)[0]!.y).toBe(yOf(4));
    expect(texts(alto, SMUFL.accidentalSharp).map(c => c.y)).toEqual([
      yOf(7),
      yOf(4),
    ]);
    expect(texts(tenor, SMUFL.cClef8vb)[0]!.y).toBe(yOf(6));
    expect(texts(tenor, SMUFL.accidentalFlat).map(c => c.y)).toEqual([
      yOf(5),
      yOf(8),
    ]);
    expect(texts(tenorSharps, SMUFL.accidentalSharp).map(c => c.y)).toEqual([
      yOf(2),
      yOf(6),
      yOf(3),
    ]);
  });

  it('widens the row header for a C clef only when the track has one', () => {
    const cClefTrack = { ...GUITAR, measures: [measure(0, 'tenor')] };
    expect(notationRowHeaderWidth(cClefTrack, 0)).toBeGreaterThan(
      notationRowHeaderWidth(GUITAR, 0),
    );
  });
});

describe('clef changes', () => {
  const measures = [bar([0]), bar([0]), bar([0])];

  it('leaves room for a clef where a bar’s clef differs from the bar before', () => {
    // Act
    const song = withClefs(makeSong(measures), ['treble', 'bass', 'bass']);

    // Assert
    expect(layoutMeasure(song, 0, 0).clefChangeX).toBeUndefined();
    expect(layoutMeasure(song, 0, 1).clefChangeX).toBeDefined();
    expect(layoutMeasure(song, 0, 2).clefChangeX).toBeUndefined();
    expect(layoutMeasure(song, 0, 1).beats[0]!.x).toBeGreaterThan(
      layoutMeasure(song, 0, 2).beats[0]!.x,
    );
  });

  it('draws the new clef small at the start of the bar, but not at a row start (the row header shows it)', () => {
    // Act
    const changed = engrave(measures, 1, { clefs: ['treble', 'bass', 'bass'] });
    const atRowStart = engrave(measures, 1, {
      clefs: ['treble', 'bass', 'bass'],
      isRowStart: true,
    });

    // Assert
    const [clef] = texts(changed, SMUFL.fClef8vb);
    expect(clef).toMatchObject({
      y: yOf(6),
      size: MUSIC_FONT_SIZE * CLEF_CHANGE_SCALE,
    });
    expect(texts(atRowStart, SMUFL.fClef8vb)).toHaveLength(0);
  });
});
