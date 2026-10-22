import type { DrawCommand, LineCommand, TextCommand } from '../draw';
import { bowCurve } from '../symbols/shapes';
import { GRACE_NOTEHEAD_WIDTH, TECHNIQUE_GLYPHS } from '../symbols/smufl';
import {
  ACCIDENTAL_GLYPHS,
  type Chord,
  type NoteHead,
  chordInkLeft,
} from './chords';
import type { GraceNote } from './events';
import { horizontal, musicGlyph } from './glyphs';
import {
  GRACE,
  MUSIC_FONT_SIZE,
  NOTATION,
  SLIDE,
  STAFF,
  positionY,
} from './metrics';
import type { VoiceLayout } from './voice-layout';

/** Grace notes: small notes left of the main note (slashed before the beat, plain on the beat). */

const HEAD_WIDTH = GRACE_NOTEHEAD_WIDTH * NOTATION.space;
const LEDGER_STEP = 2;

/** Left edge of the grace notehead column of a chord with grace notes. */
function graceX(chord: Chord): number {
  return chordInkLeft(chord) - GRACE.gap - HEAD_WIDTH;
}

function graceHeads(
  chord: Chord,
): ReadonlyArray<{ readonly head: NoteHead; readonly grace: GraceNote }> {
  return chord.heads.flatMap(head =>
    head.note.grace === undefined ? [] : [{ head, grace: head.note.grace }],
  );
}

function accidentalWidth(grace: GraceNote): number {
  return grace.accidental === undefined
    ? 0
    : ACCIDENTAL_GLYPHS[grace.accidental].width * GRACE.scale + GRACE.gap / 2;
}

/** Left edge of the chord's grace notes and their accidentals; undefined without grace notes. */
export function graceLeft(chord: Chord): number | undefined {
  const graces = graceHeads(chord);
  if (graces.length === 0) {
    return undefined;
  }
  return (
    graceX(chord) -
    Math.max(
      GRACE.ledgerExtension,
      ...graces.map(({ grace }) => accidentalWidth(grace)),
    )
  );
}

function graceLedgers(
  position: number,
  x: number,
  top: number,
  color: string,
): LineCommand[] {
  const above =
    position > STAFF.topLine + 1
      ? Math.floor((position - STAFF.topLine) / LEDGER_STEP)
      : 0;
  const below =
    position < STAFF.bottomLine - 1
      ? Math.floor((STAFF.bottomLine - position) / LEDGER_STEP)
      : 0;
  const positions = [
    ...Array.from(
      { length: above },
      (_, i) => STAFF.topLine + LEDGER_STEP * (i + 1),
    ),
    ...Array.from(
      { length: below },
      (_, i) => STAFF.bottomLine - LEDGER_STEP * (i + 1),
    ),
  ];
  return positions.map(p =>
    horizontal(
      x - GRACE.ledgerExtension,
      x + HEAD_WIDTH + GRACE.ledgerExtension,
      positionY(top, p),
      GRACE.ledgerWidth,
      color,
    ),
  );
}

function graceAccidental(
  grace: GraceNote,
  x: number,
  y: number,
  color: string,
): TextCommand[] {
  if (grace.accidental === undefined) {
    return [];
  }
  const glyph = ACCIDENTAL_GLYPHS[grace.accidental];
  return [
    {
      ...musicGlyph(x - accidentalWidth(grace), y, glyph.text, color),
      size: MUSIC_FONT_SIZE * GRACE.scale,
    },
  ];
}

/** A hammered grace note is slurred under to its note; a slid one is joined by a line. */
function transition(
  grace: GraceNote,
  x: number,
  y: number,
  main: NoteHead,
  color: string,
): DrawCommand[] {
  if (grace.transition === 'hammer') {
    const below = NOTATION.space / 2;
    return [
      bowCurve(
        x + HEAD_WIDTH / 2,
        y + below,
        main.x + main.width / 2,
        main.y + below,
        GRACE.slurHeight,
        SLIDE.width,
        color,
      ),
    ];
  }
  if (grace.transition === 'slide') {
    return [
      {
        kind: 'line',
        x1: x + HEAD_WIDTH + SLIDE.gap,
        y1: y,
        x2: main.x - SLIDE.gap,
        y2: main.y,
        width: SLIDE.width,
        color,
      },
    ];
  }
  return [];
}

export function graceNotes(layout: VoiceLayout): DrawCommand[] {
  return layout.chords.flatMap(chord => {
    if (chord === undefined) {
      return [];
    }
    const x = graceX(chord);
    return graceHeads(chord).flatMap(({ head, grace }) => {
      const y = positionY(layout.top, grace.position);
      const glyph = grace.isOnBeat
        ? TECHNIQUE_GLYPHS.graceNoteAppoggiaturaStemUp
        : TECHNIQUE_GLYPHS.graceNoteAcciaccaturaStemUp;
      return [
        ...graceLedgers(grace.position, x, layout.top, layout.color),
        ...graceAccidental(grace, x, y, layout.color),
        musicGlyph(x, y, glyph.text, layout.color),
        ...transition(grace, x, y, head, layout.color),
      ];
    });
  });
}
