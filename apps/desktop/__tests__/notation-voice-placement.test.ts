import { type Song, readSong } from '@gp-editor/core';
import { layoutMeasure } from '../src/lib/layout';
import type { DrawCommand } from '../src/score/draw';
import { NOTATION, engraveNotationMeasure } from '../src/score/notation';
import { nextMeasureHeads } from '../src/score/notation/voice-placement';
import { readFixture } from '../test-support/fixtures';
import { PALETTE } from '../test-support/score-helpers';

/** The next bar's noteheads, which slurs and slides across a bar line end on, against that bar's own engraving. */

const TOP = NOTATION.above;
/** Bars checked per track: enough for chords, beams, voices and octave signs, few enough to stay quick. */
const BARS = 40;

const key = (x: number, y: number, glyph: string) => `${x.toFixed(3)} ${y.toFixed(3)} ${glyph}`;

/** Every music glyph the measure's own engraving draws, as "x y glyph". */
function drawnGlyphs(commands: readonly DrawCommand[]): Set<string> {
  return new Set(commands.flatMap((c) => (c.kind === 'text' && c.font === 'music' ? [key(c.x, c.y, c.text)] : [])));
}

/** For every note of the first bars of every pitched track: whether the lookup's notehead is one the bar draws. */
function compare(song: Song): { readonly found: number; readonly missing: string[] } {
  let found = 0;
  const missing: string[] = [];
  song.tracks.forEach((track, trackIndex) => {
    if (track.isPercussion) {
      return;
    }
    track.measures.slice(0, BARS).forEach((measure, measureIndex) => {
      const header = song.measureHeaders[measureIndex]!;
      const layout = layoutMeasure(song, trackIndex, measureIndex);
      const previousMeasure = track.measures[measureIndex - 1];
      const drawn = drawnGlyphs(engraveNotationMeasure({ track, header, measure, layout, previousMeasure, top: TOP, palette: PALETTE }));
      const headOn = nextMeasureHeads(track, measure, { header, layout }, TOP, 0);
      measure.beats.forEach((beat, beatIndex) =>
        beat.voices.forEach((voice, voiceIndex) =>
          voice.notes.forEach((note) => {
            const placed = headOn(beatIndex, voiceIndex, note.string);
            if (placed === undefined) {
              return;
            }
            const { x, y, glyph } = placed.head;
            if (drawn.has(key(x, y, glyph))) {
              found += 1;
            } else {
              missing.push(`track ${trackIndex + 1} bar ${measureIndex + 1} beat ${beatIndex} voice ${voiceIndex + 1} string ${note.string}`);
            }
          }),
        ),
      );
    });
  });
  return { found, missing };
}

describe('nextMeasureHeads', () => {
  it.each([
    ['guitarpro5', 'canon.gp5'],
    ['guitarpro5', 'nightwish.gp5'],
    ['guitarpro1', 'sweet-child-o-mine.gtp'],
    ['guitarpro8', 'faulty.gp'],
  ])('places every notehead of %s/%s where the bar’s own engraving draws it', (folder, name) => {
    // Arrange
    const song = readSong(readFixture(folder, name));

    // Act
    const { found, missing } = compare(song);

    // Assert
    expect(missing).toEqual([]);
    expect(found).toBeGreaterThan(50);
  });

  it('moves the noteheads right by the offset it is given', () => {
    // Arrange
    const song = readSong(readFixture('guitarpro5', 'canon.gp5'));
    const track = song.tracks[0]!;
    const measureIndex = track.measures.findIndex((m) => m.beats.some((b) => b.voices[0]!.notes.length > 0));
    const measure = track.measures[measureIndex]!;
    const next = { header: song.measureHeaders[measureIndex]!, layout: layoutMeasure(song, 0, measureIndex) };
    const beatIndex = measure.beats.findIndex((b) => b.voices[0]!.notes.length > 0);
    const string = measure.beats[beatIndex]!.voices[0]!.notes[0]!.string;

    // Act
    const atZero = nextMeasureHeads(track, measure, next, TOP, 0)(beatIndex, 0, string);
    const shifted = nextMeasureHeads(track, measure, next, TOP, 250)(beatIndex, 0, string);

    // Assert
    expect(shifted!.head.x).toBeCloseTo(atZero!.head.x + 250);
    expect(shifted!.head.y).toBe(atZero!.head.y);
    expect(shifted!.chord.stemX).toBeCloseTo(atZero!.chord.stemX + 250);
  });
});
