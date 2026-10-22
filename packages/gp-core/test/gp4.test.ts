import { describe, expect, it } from 'vitest';
import { type Beat, type Note, readSong, type Song, vibratoOf } from '../src/index';
import { listFixtures, loadFixture } from './helpers/fixtures';
import { assertSongInvariants } from './helpers/invariants';

// Expected values follow alphaTab's Gp4Importer.test.ts / GpImporterTestHelper.ts, translated to our
// model: alphaTab numbers strings from the lowest, we from the highest; alphaTab keeps grace notes as
// separate beats, we keep them as an effect of the main note (as TuxGuitar does).

function read(name: string): Song {
  return readSong(loadFixture('guitarpro4', name));
}

function beatAt(song: Song, measure: number, index: number, track = 0): Beat {
  const beat = song.tracks[track]?.measures[measure]?.beats[index];
  if (beat === undefined) {
    throw new Error(`no beat ${index} in measure ${measure} of track ${track}`);
  }
  return beat;
}

function firstNote(beat: Beat): Note {
  const note = beat.voices[0]?.notes[0];
  if (note === undefined) {
    throw new Error(`beat at ${beat.start} has no note`);
  }
  return note;
}

function noteOn(beat: Beat, string: number): Note {
  const note = beat.voices[0]?.notes.find((candidate) => candidate.string === string);
  if (note === undefined) {
    throw new Error(`beat at ${beat.start} has no note on string ${string}`);
  }
  return note;
}

describe('readGp4 fixture sweep', () => {
  const fixtures = listFixtures('guitarpro4');

  it('finds the GP4 fixtures', () => {
    expect(fixtures.length).toBe(23);
  });

  it.each(fixtures)('%s parses and passes the song invariants', (name) => {
    // Arrange
    const bytes = loadFixture('guitarpro4', name);

    // Act
    const song = readSong(bytes);

    // Assert
    expect(song.source.format).toBe('gp4');
    assertSongInvariants(song);
  });
});

describe('readGp4 values', () => {
  it('reads every score-info field', () => {
    const song = read('score-info.gp4');

    expect(song.info).toEqual({
      title: 'Title',
      subtitle: 'Subtitle',
      artist: 'Artist',
      album: 'Album',
      words: 'Music',
      music: 'Music',
      copyright: 'Copyright',
      transcriber: 'Tab',
      instructions: 'Instructions',
      notice: ['Notice1', 'Notice2'],
    });
    expect(song.measureHeaders).toHaveLength(5);
    expect(song.tracks.map((track) => track.name)).toEqual(['Track 1']);
  });

  it('reads a real-world song with markers, percussion and a tempo change', () => {
    const song = read('fade-to-black.gp4');
    const drums = song.tracks[9];

    expect(song.info).toMatchObject({ title: 'Fade To Black', artist: 'MetallicA', album: 'Ride The Lightning' });
    expect(song.measureHeaders[73]?.marker).toEqual({ title: '1ère Interlude', color: { r: 255, g: 0, b: 0 } });
    expect(song.measureHeaders.slice(110, 113).map((header) => header.tempo)).toEqual([116, 116, 144]);
    expect(drums).toMatchObject({ name: 'Batterie', isPercussion: true });
    expect(song.channels.find((channel) => channel.id === drums?.channelId)).toMatchObject({
      name: 'DrumKit 1',
      bank: 128,
      program: 0,
    });
  });

  it('gives tied notes the fret of the previous note on the same string', () => {
    const song = read('fade-to-black.gp4');

    song.tracks.forEach((track) => {
      const lastFret = new Map<number, number>();
      track.measures.forEach((measure) =>
        measure.beats.forEach((beat) =>
          beat.voices[0]?.notes.forEach((note) => {
            if (note.isTied) {
              expect(note.fret).toBe(lastFret.get(note.string) ?? 0);
            }
            lastFret.set(note.string, note.fret);
          }),
        ),
      );
    });
  });

  it('gives the lyrics to the lyric track', () => {
    expect(read('score-info.gp4').tracks[0]?.lyrics).toEqual({ from: 1, text: 'Line1' });
  });

  it('reads frets, strings and durations of the notes fixture', () => {
    const song = read('notes.gp4');
    const values = [1, 2, 4, 8, 16, 32, 64];

    values.forEach((value, group) => {
      for (let fret = 1; fret <= 4; fret++) {
        const beat = beatAt(song, 0, group * 5 + fret - 1);
        expect(firstNote(beat)).toMatchObject({ fret, string: 6 });
        expect(beat.voices[0]?.duration.value).toBe(value);
      }
      expect(beatAt(song, 0, group * 5 + 4).voices[0]?.notes).toHaveLength(0);
    });
  });

  it('carries time signatures over from measure to measure', () => {
    const song = read('time-signatures.gp4');

    expect(song.measureHeaders.slice(0, 5).map((header) => header.timeSignature)).toEqual([
      { numerator: 4, denominator: 4 },
      { numerator: 3, denominator: 4 },
      { numerator: 2, denominator: 4 },
      { numerator: 1, denominator: 4 },
      { numerator: 20, denominator: 32 },
    ]);
    expect(song.measureHeaders.slice(0, 5).map((header) => header.start)).toEqual([960, 4800, 7680, 9600, 10560]);
  });

  it('marks dead notes', () => {
    const song = read('dead.gp4');

    [6, 5, 4, 3].forEach((string, index) => {
      expect(firstNote(beatAt(song, 0, index))).toMatchObject({ string, effect: { deadNote: true } });
    });
  });

  it('keeps grace notes as an effect of the following note', () => {
    const song = read('grace.gp4');
    const [first, second] = [firstNote(beatAt(song, 0, 0)), firstNote(beatAt(song, 0, 1))];

    expect(first.fret).toBe(2);
    expect(first.effect.grace).toEqual({
      fret: 3,
      duration: 2,
      velocity: 95,
      transition: 'none',
      onBeat: false,
      isDead: false,
    });
    expect(beatAt(song, 0, 0).voices[0]?.duration.value).toBe(4);
    expect(second.fret).toBe(2);
    expect(second.effect.grace).toMatchObject({ fret: 2, duration: 3, transition: 'slide' });
  });

  it('reads ghost notes, accents and let ring', () => {
    const song = read('accentuations.gp4');

    expect(firstNote(beatAt(song, 0, 0)).effect.ghostNote).toBe(true);
    expect(firstNote(beatAt(song, 0, 1)).effect.accentuatedNote).toBe(true);
    expect(firstNote(beatAt(song, 0, 3)).effect.letRing).toBe(true);
  });

  it('reads the harmonic kinds', () => {
    const song = read('harmonics.gp4');
    const types = [0, 1, 2, 3, 4].map((index) => firstNote(beatAt(song, 0, index)).effect.harmonic?.type);

    expect(types).toEqual(['natural', 'artificial', 'tapped', 'semi', 'pinch']);
  });

  it('converts harmonic data to semitone offsets and tapped frets', () => {
    const song = read('harmonic-types.gp4');
    const harmonic = (measure: number, index: number) => firstNote(beatAt(song, measure, index)).effect.harmonic;
    const tappedNote = firstNote(beatAt(song, 1, 0));

    expect(harmonic(0, 0)).toEqual({ type: 'natural', data: 0 });
    expect(harmonic(0, 1)).toEqual({ type: 'artificial', data: 24 });
    expect(harmonic(0, 2)).toEqual({ type: 'artificial', data: 19 });
    expect(harmonic(0, 3)).toEqual({ type: 'artificial', data: 12 });
    expect(tappedNote.effect.harmonic).toEqual({ type: 'tapped', data: tappedNote.fret + 12 });
    expect(harmonic(1, 1)).toEqual({ type: 'pinch', data: 0 });
    expect(harmonic(1, 2)).toEqual({ type: 'semi', data: 0 });
  });

  it('reads hammer-ons and pull-offs', () => {
    const song = read('hammer.gp4');

    expect(beatAt(song, 0, 0).voices[0]?.notes.map((note) => note.effect.hammer)).toEqual([false, true, true, true]);
    expect(firstNote(beatAt(song, 1, 0)).effect.hammer).toBe(true);
    expect(firstNote(beatAt(song, 1, 1)).effect.hammer).toBe(true);
  });

  it('converts bend points to positions 0-12 and quarter tones', () => {
    // alphaTab simplifies the first bend to two points; the file holds three (GP position 15 → 3).
    const song = read('bends.gp4');

    expect(firstNote(beatAt(song, 0, 0)).effect.bend?.points).toEqual([
      { position: 0, value: 0 },
      { position: 3, value: 4 },
      { position: 12, value: 4 },
    ]);
    expect(firstNote(beatAt(song, 0, 1)).effect.bend?.points.map((point) => point.position)).toEqual([
      0, 2, 4, 6, 8, 10, 12,
    ]);
    expect(firstNote(beatAt(song, 0, 1)).effect.bend?.points.map((point) => point.value)).toEqual([
      0, 4, 4, 0, 0, 4, 4,
    ]);
  });

  it('reads tremolo bar points in quarter tones', () => {
    const song = read('tremolo.gp4');
    const points = (measure: number) => firstNote(beatAt(song, measure, 0)).effect.tremoloBar?.points;

    expect(points(0)).toEqual([
      { position: 0, value: 0 },
      { position: 6, value: -4 },
      { position: 12, value: 0 },
    ]);
    expect(points(1)).toEqual([
      { position: 0, value: -4 },
      { position: 9, value: -4 },
      { position: 12, value: 0 },
    ]);
    expect(points(2)).toEqual([
      { position: 0, value: 0 },
      { position: 9, value: -4 },
      { position: 12, value: -4 },
    ]);
  });

  it('reads the slide type', () => {
    const song = read('slides.gp4');

    expect(noteOn(beatAt(song, 0, 0), 2).effect.slides).toEqual(['legato']);
    expect(noteOn(beatAt(song, 0, 2), 5).effect.slides).toEqual(['shift']);
    expect(noteOn(beatAt(song, 1, 0), 2).effect.slides).toEqual(['intoFromBelow']);
    expect(noteOn(beatAt(song, 1, 1), 2).effect.slides).toEqual(['intoFromAbove']);
    expect(noteOn(beatAt(song, 1, 2), 2).effect.slides).toEqual(['outDownwards']);
    expect(noteOn(beatAt(song, 1, 3), 2).effect.slides).toEqual(['outUpwards']);
  });

  it('reads note vibrato as slight and beat vibrato as wide', () => {
    const song = read('vibrato.gp4');

    expect([0, 1, 2, 3].map((index) => vibratoOf(firstNote(beatAt(song, 0, index)).effect))).toEqual(['slight', 'slight', 'wide', 'wide']);
  });

  it('reads trills and tremolo picking', () => {
    const song = read('trills.gp4');

    expect(firstNote(beatAt(song, 0, 0)).effect.trill).toMatchObject({ fret: 2, duration: { value: 16 } });
    expect(firstNote(beatAt(song, 0, 1)).effect.tremoloPicking?.duration.value).toBe(32);
    expect(firstNote(beatAt(song, 0, 2)).effect.tremoloPicking?.duration.value).toBe(16);
    expect(firstNote(beatAt(song, 0, 3)).effect.tremoloPicking?.duration.value).toBe(8);
  });

  it('reads palm mute, staccato, tapping, slapping, popping, fade in, chords, texts and tempo', () => {
    const song = read('other-effects.gp4');

    expect(firstNote(beatAt(song, 0, 0)).effect.palmMute).toBe(true);
    expect(firstNote(beatAt(song, 0, 1)).effect.staccato).toBe(true);
    expect(firstNote(beatAt(song, 0, 2)).effect.tapping).toBe(true);
    expect(firstNote(beatAt(song, 0, 3)).effect.slapping).toBe(true);
    expect(firstNote(beatAt(song, 1, 0)).effect.popping).toBe(true);
    expect(firstNote(beatAt(song, 1, 1)).effect.fadeIn).toBe(true);
    expect(beatAt(song, 3, 0).chord?.name).toBe('C');
    expect(beatAt(song, 3, 1).text).toBe('Text');
    expect(song.measureHeaders[4]?.tempo).toBe(120);
  });

  it('reads strokes and pick strokes', () => {
    const song = read('strokes.gp4');

    expect(beatAt(song, 0, 0).stroke).toEqual({ direction: 'down', value: 32 });
    expect(beatAt(song, 0, 1).stroke).toEqual({ direction: 'up', value: 32 });
    expect(beatAt(song, 0, 2).pickStroke).toBe('up');
    expect(beatAt(song, 0, 3).pickStroke).toBe('down');
  });

  it('reads triplets and quintuplets', () => {
    const song = read('tuplets.gp4');

    for (let index = 0; index < 3; index++) {
      expect(beatAt(song, 0, index).voices[0]?.duration.tuplet).toEqual({ enters: 3, times: 2 });
    }
    for (let index = 0; index < 5; index++) {
      expect(beatAt(song, 1, index).voices[0]?.duration.tuplet).toEqual({ enters: 5, times: 4 });
    }
  });

  it('reads palm mute and let ring ranges', () => {
    const song = read('ranges.gp4');

    [0, 1, 2, 3].forEach((index) => expect(firstNote(beatAt(song, 0, index)).effect.palmMute).toBe(true));
    expect(firstNote(beatAt(song, 1, 0)).effect.palmMute).toBe(true);
    [1, 2, 3].forEach((index) => expect(firstNote(beatAt(song, 1, index)).effect.letRing).toBe(true));
    expect(firstNote(beatAt(song, 2, 0)).effect.letRing).toBe(true);
  });

  it('numbers strings from the highest', () => {
    const song = read('strings.gp4');
    const beat = beatAt(song, 0, 0);

    expect(beat.voices[0]?.notes).toHaveLength(6);
    for (let string = 1; string <= 6; string++) {
      expect(noteOn(beat, string).fret).toBe(string);
    }
  });

  it('reads track colors', () => {
    const song = read('colors.gp4');

    expect(song.tracks.map((track) => [track.name, track.color])).toEqual([
      ['Red', { r: 255, g: 0, b: 0 }],
      ['Green', { r: 0, g: 255, b: 0 }],
      ['Yellow', { r: 255, g: 255, b: 0 }],
      ['Blue', { r: 0, g: 0, b: 255 }],
    ]);
  });
});
