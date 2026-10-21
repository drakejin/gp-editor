/**
 * Value checks shared by Guitar Pro 6 (.gpx) and 7 (.gp): the same alphaTab test files exist in both
 * folders, and alphaTab checks them with the same GpImporterTestHelper. Expectations are translated to
 * our model: strings count from the highest string (alphaTab: from the lowest), bend/whammy positions
 * are 0–12 (alphaTab: 0–60), harmonic/trill/tremolo data as TuxGuitar maps them.
 */
import { describe, expect, it } from 'vitest';
import { type Beat, type Note, type Song, readSong } from '../src/index';
import { type FixtureFolder, loadFixture } from './helpers/fixtures';

function at<T>(items: readonly T[], index: number): T {
  const item = items[index];
  if (item === undefined) {
    throw new Error(`no item at index ${index} (length ${items.length})`);
  }
  return item;
}

function beatAt(song: Song, measure: number, beat: number, track = 0): Beat {
  return at(at(at(song.tracks, track).measures, measure).beats, beat);
}

function noteAt(song: Song, measure: number, beat: number, note = 0): Note {
  return at(at(beatAt(song, measure, beat).voices, 0).notes, note);
}

function noteOnString(beat: Beat, string: number): Note {
  const found = at(beat.voices, 0).notes.find((n) => n.string === string);
  if (found === undefined) {
    throw new Error(`no note on string ${string}`);
  }
  return found;
}

const FORMATS: readonly (readonly [FixtureFolder, string])[] = [
  ['guitarpro6', 'gpx'],
  ['guitarpro7', 'gp'],
];

describe.each(FORMATS)('%s shared value checks', (folder, extension) => {
  const read = (name: string): Song => readSong(loadFixture(folder, `${name}.${extension}`));

  it('score-info: reads the score fields and track names', () => {
    // Act
    const song = read('score-info');

    // Assert
    expect(song.info).toEqual({
      title: 'Title',
      subtitle: 'Subtitle',
      artist: 'Artist',
      album: 'Album',
      words: 'Words',
      music: 'Music',
      copyright: 'Copyright',
      transcriber: 'Tab',
      instructions: 'Instructions',
      notice: ['Notice1', 'Notice2'],
    });
    expect(song.measureHeaders).toHaveLength(5);
    expect(song.tracks.map((t) => t.name)).toEqual(['Track 1', 'Track 2']);
  });

  it('notes: frets, durations and rests from whole to 64th notes', () => {
    // Act
    const song = read('notes');

    // Assert
    const values = [1, 2, 4, 8, 16, 32, 64];
    values.forEach((value, group) => {
      for (let i = 0; i < 5; i++) {
        const voice = at(beatAt(song, 0, group * 5 + i).voices, 0);
        expect(voice.duration.value).toBe(value);
        expect(voice.isEmpty).toBe(false);
        if (i < 4) {
          expect(voice.notes.map((n) => [n.fret, n.string])).toEqual([[i + 1, 6]]);
        } else {
          expect(voice.notes).toEqual([]);
        }
      }
    });
  });

  it('time-signatures: reads every master bar time signature', () => {
    const song = read('time-signatures');
    expect(song.measureHeaders.map((h) => [h.timeSignature.numerator, h.timeSignature.denominator])).toEqual([
      [4, 4],
      [3, 4],
      [2, 4],
      [1, 4],
      [20, 32],
      [20, 32],
    ]);
  });

  it('time-signatures: keeps the second voice of a two-voice bar, other voice slots empty', () => {
    // Act
    const measure = at(at(read('time-signatures').tracks, 0).measures, 3);

    // Assert
    expect(measure.beats).toHaveLength(1);
    const voices = at(measure.beats, 0).voices;
    expect(voices).toHaveLength(4);
    expect(voices.map((v) => v.isEmpty)).toEqual([false, false, true, true]);
    expect(voices.map((v) => v.notes.length)).toEqual([0, 0, 0, 0]);
  });

  it('dead: muted notes become dead notes on strings 6 to 3', () => {
    const song = read('dead');
    for (let i = 0; i < 4; i++) {
      const note = noteAt(song, 0, i);
      expect(note.effect.deadNote).toBe(true);
      expect(note.string).toBe(6 - i);
    }
  });

  it('grace: grace beats are folded into the following note', () => {
    // Act
    const song = read('grace');

    // Assert: grace, quarter, grace (legato slide), quarter, half rest -> three beats.
    const measure = at(at(song.tracks, 0).measures, 0);
    expect(measure.beats).toHaveLength(3);
    const first = noteAt(song, 0, 0);
    expect(first.fret).toBe(2);
    expect(at(beatAt(song, 0, 0).voices, 0).duration.value).toBe(4);
    expect(first.effect.grace).toEqual({ fret: 3, duration: 2, velocity: 79, transition: 'none', onBeat: false, isDead: false });
    const second = noteAt(song, 0, 1);
    expect(second.fret).toBe(2);
    expect(second.effect.grace).toEqual({ fret: 2, duration: 2, velocity: 79, transition: 'slide', onBeat: false, isDead: false });
    expect(at(beatAt(song, 0, 2).voices, 0).notes).toEqual([]);
  });

  it('accentuations: ghost, accent, heavy accent and let ring', () => {
    const song = read('accentuations');
    expect(noteAt(song, 0, 0).effect.ghostNote).toBe(true);
    expect(noteAt(song, 0, 1).effect.accentuatedNote).toBe(true);
    expect(noteAt(song, 0, 2).effect.heavyAccentuatedNote).toBe(true);
    expect(noteAt(song, 0, 3).effect.letRing).toBe(true);
  });

  it('harmonics: natural, artificial, tapped, semi and pinch', () => {
    const song = read('harmonics');
    expect([0, 1, 2, 3, 4].map((b) => noteAt(song, 0, b).effect.harmonic)).toEqual([
      { type: 'natural', data: 0 },
      { type: 'artificial', data: 12 },
      { type: 'tapped', data: 14 },
      { type: 'semi', data: 0 },
      { type: 'pinch', data: 0 },
    ]);
  });

  it('hammer: hammer-on/pull-off origins are flagged, destinations are not', () => {
    const song = read('hammer');
    const firstBeat = at(beatAt(song, 0, 0).voices, 0).notes.map((n) => n.effect.hammer);
    const secondBeat = at(beatAt(song, 0, 1).voices, 0).notes.map((n) => n.effect.hammer);
    expect(firstBeat).toEqual([false, true, true, true]);
    expect(secondBeat).toEqual([false, false, false, false]);
    expect(noteAt(song, 1, 0).effect.hammer).toBe(true);
    expect(noteAt(song, 1, 1).effect.hammer).toBe(true);
    expect(noteAt(song, 1, 2).effect.hammer).toBe(false);
  });

  it('slides: every slide flag maps to a slide type', () => {
    const song = read('slides');
    expect(noteOnString(beatAt(song, 0, 0), 2).effect.slides).toEqual(['legato']);
    expect(noteOnString(beatAt(song, 0, 2), 5).effect.slides).toEqual(['shift']);
    expect(noteOnString(beatAt(song, 1, 0), 2).effect.slides).toEqual(['intoFromBelow']);
    expect(noteOnString(beatAt(song, 1, 1), 2).effect.slides).toEqual(['intoFromAbove']);
    expect(noteOnString(beatAt(song, 1, 2), 2).effect.slides).toEqual(['outDownwards']);
    expect(noteOnString(beatAt(song, 1, 3), 2).effect.slides).toEqual(['outUpwards']);
  });

  it('vibrato: note vibrato and whammy-bar vibrato both mark the notes', () => {
    const song = read('vibrato');
    for (let b = 0; b < 4; b++) {
      expect(noteAt(song, 0, b).effect.vibrato).toBe(true);
    }
  });

  it('trills: trill fret and speed, tremolo picking speeds', () => {
    // Act
    const song = read('trills');

    // Assert
    const trill = noteAt(song, 0, 0).effect.trill;
    expect(trill?.fret).toBe(2);
    expect(trill?.duration.value).toBe(16);
    expect([1, 2, 3].map((b) => noteAt(song, 0, b).effect.tremoloPicking?.duration.value)).toEqual([32, 16, 8]);
  });

  it('other-effects: palm mute, staccato, tapping, slap, pop, fade in, chord, text and tempo', () => {
    // Act
    const song = read('other-effects');

    // Assert
    expect(noteAt(song, 0, 0).effect.palmMute).toBe(true);
    expect(noteAt(song, 0, 1).effect.staccato).toBe(true);
    expect(noteAt(song, 0, 2).effect.tapping).toBe(true);
    expect(noteAt(song, 0, 3).effect.slapping).toBe(true);
    expect(noteAt(song, 1, 0).effect.popping).toBe(true);
    expect(noteAt(song, 1, 1).effect.fadeIn).toBe(true);
    expect(beatAt(song, 3, 0).chord?.name).toBe('C');
    expect(beatAt(song, 3, 1).text).toBe('Text');
    expect(at(song.measureHeaders, 4).tempo).toBe(120);
  });

  it('strokes: brush down/up and pick strokes up/down', () => {
    const song = read('strokes');
    expect(beatAt(song, 0, 0).stroke).toEqual({ direction: 'down', value: 32 });
    expect(beatAt(song, 0, 1).stroke).toEqual({ direction: 'up', value: 32 });
    expect(beatAt(song, 0, 2).pickStroke).toBe('up');
    expect(beatAt(song, 0, 3).pickStroke).toBe('down');
    expect(beatAt(song, 0, 0).pickStroke).toBe('none');
    expect(beatAt(song, 0, 2).stroke).toEqual({ direction: 'none', value: 0 });
  });

  it('tuplets: triplets then quintuplets', () => {
    const song = read('tuplets');
    for (let b = 0; b < 3; b++) {
      expect(at(beatAt(song, 0, b).voices, 0).duration.tuplet).toEqual({ enters: 3, times: 2 });
    }
    for (let b = 0; b < 5; b++) {
      expect(at(beatAt(song, 1, b).voices, 0).duration.tuplet.enters).toBe(5);
    }
  });

  it('ranges: palm mute and let ring ranges', () => {
    const song = read('ranges');
    for (let b = 0; b < 4; b++) {
      expect(noteAt(song, 0, b).effect.palmMute).toBe(true);
    }
    expect(noteAt(song, 1, 0).effect.palmMute).toBe(true);
    for (let b = 1; b < 4; b++) {
      expect(noteAt(song, 1, b).effect.letRing).toBe(true);
    }
    expect(noteAt(song, 2, 0).effect.letRing).toBe(true);
  });

  it('strings: one note per string with frets 1 (high e) to 6 (low E)', () => {
    const beat = beatAt(read('strings'), 0, 0);
    expect(at(beat.voices, 0).notes).toHaveLength(6);
    for (let s = 1; s <= 6; s++) {
      expect(noteOnString(beat, s).fret).toBe(s);
    }
  });

  it('key-signatures: flats and sharps in major and minor', () => {
    const measures = at(read('key-signatures').tracks, 0).measures;
    const flats = [0, -1, -2, -3, -4, -5, -6, -7];
    const sharps = [0, 1, 2, 3, 4, 5, 6, 7];
    expect(measures.slice(0, 32).map((m) => m.keySignature)).toEqual([...flats, ...sharps, ...flats, ...sharps]);
  });

  it('chords: diagrams with names, first fret and frets per string', () => {
    // Act
    const song = read('chords');

    // Assert
    const chords = [0, 1, 2, 3].flatMap((b) => [beatAt(song, 0, b).chord, beatAt(song, 1, b).chord]);
    expect(chords).toEqual([
      { name: 'C', firstFret: 1, frets: [0, 1, 0, 2, 3, -1] },
      { name: 'D', firstFret: 1, frets: [2, 3, 2, 0, -1, -1] },
      { name: 'Cm', firstFret: 1, frets: [-1, -1, 0, 1, 3, -1] },
      { name: 'Dm', firstFret: 1, frets: [1, 3, 2, 0, -1, -1] },
      { name: 'C', firstFret: 1, frets: [3, 5, 5, 5, 3, -1] },
      { name: 'D', firstFret: 5, frets: [5, 7, 7, 7, 5, -1] },
      { name: 'Cm', firstFret: 1, frets: [3, 4, 5, 5, 3, -1] },
      { name: 'Dm', firstFret: 5, frets: [5, 6, 7, 7, 5, -1] },
    ]);
  });

  it('colors: track names and colors', () => {
    const song = read('colors');
    expect(song.tracks.map((t) => [t.name, t.color])).toEqual([
      ['Red', { r: 255, g: 0, b: 0 }],
      ['Green', { r: 0, g: 255, b: 0 }],
      ['Yellow', { r: 255, g: 255, b: 0 }],
      ['Blue', { r: 0, g: 0, b: 255 }],
    ]);
  });

  it('repeat-close-alternate-endings: repeat open/close counts and ending bitmasks', () => {
    const headers = read('repeat-close-alternate-endings').measureHeaders;
    expect(headers.map((h) => [h.repeatOpen, h.repeatClose, h.repeatAlternative])).toEqual([
      [true, 0, 0],
      [false, 0, 0b101],
      [false, 0, 0b010],
      [false, 3, 0],
      [false, 0, 0],
    ]);
  });
});
