import { QUARTER, type Song, readSong } from '@gp-editor/core';
import type { MeasureLayout } from '../src/lib/layout';
import { DEFAULT_CHORD_DISPLAY } from '../src/score/chords';
import { LYRICS, engraveLyrics, hasLyrics, measureSyllables } from '../src/score/lyrics';
import { layoutScore } from '../src/score/score-layout';
import { textWidth } from '../src/score/symbols/shapes';
import { readFixture } from '../test-support/fixtures';
import { PALETTE, texts } from '../test-support/score-helpers';
import { beat, makeSong, note } from '../test-support/songs';

/** Bar 1: two notes and a rest; bar 2: two notes; bar 3: one note. */
function sungSong(text: string, from = 1) {
  const song = makeSong([
    [beat(960, [note(1, 0)]), beat(1920, []), beat(2880, [note(1, 2)])],
    [beat(4800, [note(1, 3)]), beat(5760, [note(2, 1), note(1, 0)])],
    [beat(8640, [note(1, 5)])],
  ]);
  const track = song.tracks[0]!;
  return { ...song, tracks: [{ ...track, lyrics: { from, text } }] };
}

const layout = (measureIndex: number, xs: readonly number[]): MeasureLayout => ({
  measureIndex,
  width: 200,
  beats: xs.map((x, beatIndex) => ({ beatIndex, x })),
  showTimeSignature: false,
  showTempo: false,
  showTripletFeel: false,
});

describe('measureSyllables', () => {
  it('gives each beat with notes the next syllable, rests none, across bars', () => {
    // Arrange
    const track = sungSong('Pa- per boats on the').tracks[0]!;

    // Act + Assert
    expect(measureSyllables(track, 0)).toEqual([{ beatIndex: 0, text: 'Pa-' }, { beatIndex: 2, text: 'per' }]);
    expect(measureSyllables(track, 1)).toEqual([{ beatIndex: 0, text: 'boats' }, { beatIndex: 1, text: 'on' }]);
    expect(measureSyllables(track, 2)).toEqual([{ beatIndex: 0, text: 'the' }]);
  });

  it('leaves a note without a syllable where two spaces meet, and reads line breaks as spaces', () => {
    const track = sungSong('one  two\nthree').tracks[0]!;
    expect(measureSyllables(track, 0)).toEqual([{ beatIndex: 0, text: 'one' }]);
    expect(measureSyllables(track, 1)).toEqual([{ beatIndex: 0, text: 'two' }, { beatIndex: 1, text: 'three' }]);
  });

  it('splits words after their hyphens and sings words joined by "+" on one note, as Guitar Pro does', () => {
    const track = sungSong('Pa-per boats+on the').tracks[0]!;
    expect(measureSyllables(track, 0)).toEqual([{ beatIndex: 0, text: 'Pa-' }, { beatIndex: 2, text: 'per' }]);
    expect(measureSyllables(track, 1)).toEqual([{ beatIndex: 0, text: 'boats on' }, { beatIndex: 1, text: 'the' }]);
  });

  it('starts at the lyrics’ first bar', () => {
    const track = sungSong('late start', 2).tracks[0]!;
    expect(measureSyllables(track, 0)).toEqual([]);
    expect(measureSyllables(track, 1)).toEqual([{ beatIndex: 0, text: 'late' }, { beatIndex: 1, text: 'start' }]);
  });

  it('has nothing for a track without lyrics', () => {
    expect(measureSyllables(makeSong([[beat(960, [note(1, 0)])]]).tracks[0]!, 0)).toEqual([]);
  });
});

describe('engraveLyrics', () => {
  it('centres each syllable under its beat on the lyrics line', () => {
    // Act
    const commands = engraveLyrics({ track: sungSong('Pa- per').tracks[0]!, layout: layout(0, [20, 60, 100]), y: 140, palette: PALETTE });

    // Assert
    expect(texts(commands).map((text) => [text.text, text.x, text.y, text.size, text.align])).toEqual([
      ['Pa-', 20, 140, LYRICS.size, 'center'],
      ['per', 100, 140, LYRICS.size, 'center'],
    ]);
  });
});

describe('hasLyrics', () => {
  it('is true only for a track with some lyrics text', () => {
    expect(hasLyrics(sungSong('la').tracks[0])).toBe(true);
    expect(hasLyrics(sungSong('   ').tracks[0])).toBe(false);
    expect(hasLyrics(makeSong([[]]).tracks[0])).toBe(false);
  });
});

/** The syllables of the track's laid-out bars that run into the one before them or out of their bar, as "bar: text". */
function crowdedSyllables(song: Song, trackIndex: number): string[] {
  const track = song.tracks[trackIndex]!;
  const score = layoutScore(song, [{ trackIndex, mode: 'notationAndTab' }], DEFAULT_CHORD_DISPLAY, 900);
  return score.systems.flatMap((system) =>
    (system.rows[0]?.measures ?? []).flatMap((measure) => {
      const spans = engraveLyrics({ track, layout: measure, y: 0, palette: PALETTE }).map((command) => {
        const half = textWidth(command.text, command.size) / 2;
        return { text: command.text, left: command.x - half, right: command.x + half };
      });
      return spans.filter((span, i) => span.left < 0 || span.right > measure.width || span.left < (spans[i - 1]?.right ?? -Infinity)).map((span) => `${measure.measureIndex + 1}: ${span.text}`);
    }),
  );
}

describe('lyrics in the layout', () => {
  it('widens the beats under syllables wider than their notes, so none runs into another (beat-lyrics.gp)', () => {
    // Arrange
    const song = readSong(readFixture('guitarpro7', 'beat-lyrics.gp'));
    const trackIndex = song.tracks.findIndex(hasLyrics);

    // Act / Assert
    expect(trackIndex).toBeGreaterThanOrEqual(0);
    expect(crowdedSyllables(song, trackIndex)).toEqual([]);
  });

  it('makes room for long words on sixteenth notes, and none for a short one', () => {
    // Arrange: four sixteenths sung "Manually Modified to ensure"; then the same notes sung "a b c d"
    const notes = makeSong([[960, 1200, 1440, 1680].map((start) => beat(start, [note(1, 0)], { ...QUARTER, value: 16 }))]);
    const sung = (text: string): Song => ({ ...notes, tracks: notes.tracks.map((track) => ({ ...track, lyrics: { from: 1, text } })) });
    const barWidth = (song: Song) => layoutScore(song, [{ trackIndex: 0, mode: 'tab' }], DEFAULT_CHORD_DISPLAY, 2000).systems[0]?.rows[0]?.measures[0]?.width;

    // Act / Assert
    expect(crowdedSyllables(sung('Manually Modified to ensure'), 0)).toEqual([]);
    expect(barWidth(sung('a b c d'))).toBe(barWidth(notes));
  });
});
