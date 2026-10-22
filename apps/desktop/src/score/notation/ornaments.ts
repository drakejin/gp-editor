import type { DrawCommand, TextCommand } from '../draw';
import { verticalArrow, wavyLine } from '../symbols/shapes';
import { TECHNIQUE_GLYPHS, TREMOLO_GLYPHS } from '../symbols/smufl';
import { articulationHeightAbove } from './articulations';
import { type Chord, chordInkLeft } from './chords';
import { graceLeft } from './grace';
import { musicGlyph } from './glyphs';
import { MUSIC_FONT_SIZE, NOTATION, ORNAMENT, STROKE } from './metrics';
import { type VoiceLayout, eventEndX, lineAbove } from './voice-layout';

/** Tremolo strokes, trills, vibrato and strum arrows on the notation staff. */

const SPACE = NOTATION.space;
/** log2 of a quarter note's value: an eighth has one beam, so one tremolo stroke. */
const QUARTER_LOG = 2;

function hasEffect(
  chord: Chord | undefined,
  has: (chord: Chord) => boolean,
): chord is Chord {
  return chord !== undefined && has(chord);
}

/** Tremolo picking: one stroke across the stem per beam of the picking value; over the note when it has no stem. */
export function tremoloStrokes(layout: VoiceLayout): TextCommand[] {
  return layout.chords.flatMap((chord, index) => {
    const picking = chord?.heads.find(
      head => head.note.effect.tremoloPicking !== undefined,
    )?.note.effect.tremoloPicking;
    if (chord === undefined || picking === undefined) {
      return [];
    }
    const count = Math.max(
      1,
      Math.min(
        TREMOLO_GLYPHS.length,
        Math.log2(picking.duration.value) - QUARTER_LOG,
      ),
    );
    const glyph = TREMOLO_GLYPHS[count - 1] ?? TREMOLO_GLYPHS[0];
    const tip = layout.tips[index];
    if (glyph === undefined) {
      return [];
    }
    // Tremolo ink is centred on the glyph origin, so the origin goes on the stem.
    if (chord.hasStem && tip !== undefined) {
      return [
        musicGlyph(
          chord.stemX,
          chord.stemBase + (tip - chord.stemBase) * ORNAMENT.stemRatio,
          glyph.text,
          layout.color,
        ),
      ];
    }
    const highest = Math.min(...chord.heads.map(head => head.y));
    return [
      musicGlyph(
        chord.event.x,
        highest - ORNAMENT.stemlessLift,
        glyph.text,
        layout.color,
      ),
    ];
  });
}

/** Room above a run of chords for a wavy line: past the notes, stems and articulations above them. */
export function waveLine(
  layout: VoiceLayout,
  indexes: readonly number[],
  glyphHeight: number,
): number {
  const lift = Math.max(
    0,
    ...indexes.map(index => {
      const chord = layout.chords[index];
      return chord === undefined
        ? 0
        : articulationHeightAbove(chord, layout.isMultiVoice);
    }),
  );
  return lineAbove(layout, indexes, glyphHeight) - lift;
}

/** "tr" over the note and a wavy line to the end of its time. */
export function trills(layout: VoiceLayout): TextCommand[] {
  const tr = TECHNIQUE_GLYPHS.ornamentTrill;
  const wave = TECHNIQUE_GLYPHS.wiggleTrill;
  return layout.chords.flatMap((chord, index) => {
    if (
      !hasEffect(chord, c =>
        c.heads.some(head => head.note.effect.trill !== undefined),
      )
    ) {
      return [];
    }
    const y = waveLine(layout, [index], tr.top * SPACE);
    const waveStart = chord.left + tr.advance * SPACE + ORNAMENT.endGap;
    return [
      musicGlyph(chord.left, y, tr.text, layout.color),
      ...wavyLine(
        waveStart,
        eventEndX(layout, index),
        y,
        wave,
        MUSIC_FONT_SIZE,
        layout.color,
      ),
    ];
  });
}

/** Consecutive events of one voice whose chords have vibrato. */
function vibratoRuns(layout: VoiceLayout): number[][] {
  const voices = [...new Set(layout.events.map(event => event.voiceIndex))];
  return voices.flatMap(voiceIndex => {
    const indexes = layout.events.flatMap((event, index) =>
      event.voiceIndex === voiceIndex ? [index] : [],
    );
    return indexes.reduce<number[][]>((runs, index, k) => {
      if (
        !hasEffect(layout.chords[index], c =>
          c.heads.some(head => head.note.effect.vibrato),
        )
      ) {
        return runs;
      }
      const last = runs[runs.length - 1];
      return last !== undefined && last[last.length - 1] === indexes[k - 1]
        ? [...runs.slice(0, -1), [...last, index]]
        : [...runs, [index]];
    }, []);
  });
}

/** One wavy line over each run of notes with vibrato. */
export function vibratos(layout: VoiceLayout): TextCommand[] {
  const glyph = TECHNIQUE_GLYPHS.guitarVibratoStroke;
  return vibratoRuns(layout).flatMap(run => {
    const first = layout.chords[run[0] ?? -1];
    const last = run[run.length - 1];
    if (first === undefined || last === undefined) {
      return [];
    }
    return wavyLine(
      first.left,
      eventEndX(layout, last),
      waveLine(layout, run, glyph.top * SPACE),
      glyph,
      MUSIC_FONT_SIZE,
      layout.color,
    );
  });
}

/** A strummed chord: an arrow left of it (and of its grace notes), pointing the way of the stroke. */
export function strokes(layout: VoiceLayout): DrawCommand[] {
  return layout.chords.flatMap((chord, index) => {
    const event = layout.events[index];
    const isFirstOfBeat =
      layout.events.findIndex(
        (other, i) =>
          other.beatIndex === event?.beatIndex &&
          layout.chords[i] !== undefined,
      ) === index;
    if (
      chord === undefined ||
      event === undefined ||
      event.stroke === 'none' ||
      !isFirstOfBeat
    ) {
      return [];
    }
    const x = (graceLeft(chord) ?? chordInkLeft(chord)) - STROKE.gap;
    const high = Math.min(...chord.heads.map(head => head.y)) - STROKE.overhang;
    const low = Math.max(...chord.heads.map(head => head.y)) + STROKE.overhang;
    const [from, to] = event.stroke === 'up' ? [low, high] : [high, low];
    return verticalArrow(x, from, to, STROKE.width, layout.color);
  });
}
