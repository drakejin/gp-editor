import { describe, expect, it } from 'vitest';
import { type Beat, GpFormatError, type Note, readSong, type Song, type Voice } from '../src/index';
import { listFixtures, loadFixture } from './helpers/fixtures';
import { assertSongInvariants } from './helpers/invariants';

// Expected values follow alphaTab's Gp5Importer.test.ts / GpImporterTestHelper.ts, translated to our
// model: alphaTab numbers strings from the lowest, we from the highest; alphaTab keeps grace notes as
// separate beats, we keep them as an effect of the main note (as TuxGuitar does).

function read(name: string): Song {
  return readSong(loadFixture('guitarpro5', name));
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

function describeVoice(voice: Voice | undefined): string {
  if (voice === undefined || voice.isEmpty) {
    return '-';
  }
  return `${voice.duration.value}:${voice.notes.map((note) => `${note.string}/${note.fret}`).join(',')}`;
}

function noteOn(beat: Beat, string: number): Note {
  const note = beat.voices[0]?.notes.find((candidate) => candidate.string === string);
  if (note === undefined) {
    throw new Error(`beat at ${beat.start} has no note on string ${string}`);
  }
  return note;
}

describe('readGp5 fixture sweep', () => {
  const fixtures = listFixtures('guitarpro5');

  it('finds the GP5 fixtures', () => {
    expect(fixtures.length).toBe(49);
  });

  it.each(fixtures)('%s parses and passes the song invariants', (name) => {
    // Arrange
    const bytes = loadFixture('guitarpro5', name);

    // Act
    const song = readSong(bytes);

    // Assert
    expect(song.source.format).toBe('gp5');
    assertSongInvariants(song);
  });
});

describe('readGp5 song and track values', () => {
  it('reads every score-info field', () => {
    const song = read('score-info.gp5');

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
    expect(song.tracks.map((track) => track.name)).toEqual(['Track 1', 'Track 2']);
  });

  it('reads a large real-world song', () => {
    const song = read('canon.gp5');

    expect(song.info).toMatchObject({ title: 'Canon Rock', artist: 'JerryC', music: 'JerryC', words: '' });
    expect(song.measureHeaders).toHaveLength(224);
    expect(song.tracks.map((track) => track.name)).toEqual([
      'Guitar Player',
      'Low Bassy Sound',
      'High Soundy Thing',
      'Second Guitar',
      'Drums',
      'Harmonizer',
      'The clean guitar',
      'Track 8',
      'Percussion',
    ]);
  });

  it('caps an overlong chord name at its 21-byte field', () => {
    const song = read('chord-name-overflow.gp5');

    expect(song.tracks).toHaveLength(1);
    expect(song.measureHeaders).toHaveLength(193);
  });

  it('reads track colors', () => {
    const song = read('colors.gp5');

    expect(song.tracks.map((track) => [track.name, track.color])).toEqual([
      ['Red', { r: 255, g: 0, b: 0 }],
      ['Green', { r: 0, g: 255, b: 0 }],
      ['Yellow', { r: 255, g: 255, b: 0 }],
      ['Blue', { r: 0, g: 0, b: 255 }],
    ]);
  });

  it('takes the clef from the track settings', () => {
    const song = read('bass-tuning.gp5');

    expect(song.tracks.map((track) => track.measures[0]?.clef)).toEqual(['treble', 'bass', 'bass', 'bass']);
  });

  it('turns tracks on MIDI channel 10 into percussion tracks', () => {
    const song = read('percussion-all.gp5');
    const track = song.tracks[0];
    const channel = song.channels.find((candidate) => candidate.id === track?.channelId);

    expect(track?.isPercussion).toBe(true);
    expect(channel).toMatchObject({ isPercussion: true, bank: 128, program: 0 });
    expect(channel?.name).toBe('DrumKit 1');
    expect(track?.measures.every((measure) => measure.keySignature === 0)).toBe(true);
  });

  it('reads a Guitar Pro 5.00 file', () => {
    const song = read('serenade.gp5');

    expect(song.source.version).toBe('FICHIER GUITAR PRO v5.00');
    expect(song.info).toMatchObject({ title: 'Serenade to a Dream', artist: 'Suidakra', transcriber: 'Chris Ninman' });
    expect(song.measureHeaders).toHaveLength(78);
    expect(song.tracks.map((track) => track.name)).toEqual(['Lead', 'Rhythm', 'Bass', 'Keyboard']);
    expect(song.tracks[2]?.strings.map((guitarString) => guitarString.tuning)).toEqual([41, 36, 31, 26]);
    expect(song.measureHeaders.slice(75).map((header) => header.tempo)).toEqual([94, 88, 88]);
  });

  it('gives the lyrics to the lyric track only', () => {
    const song = read('score-info.gp5');

    expect(song.tracks[0]?.lyrics).toEqual({ from: 1, text: 'Line1' });
    expect(song.tracks[1]?.lyrics).toBeUndefined();
  });

  it('lets tracks on the same MIDI channel share one song channel', () => {
    const song = read('canon.gp5');
    const drums = song.tracks.filter((track) => track.isPercussion);

    expect(song.channels).toHaveLength(8);
    expect(drums.map((track) => [track.name, track.channelId])).toEqual([
      ['Drums', 5],
      ['Percussion', 5],
    ]);
    expect(song.channels[4]).toMatchObject({ id: 5, name: 'DrumKit 1', bank: 128, program: 0, volume: 111 });
    expect(song.channels.map((channel) => channel.id)).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
  });

  it('reads the capo offset', () => {
    expect(read('chord-name-overflow.gp5').tracks[0]?.offset).toBe(2);
  });

  it('reads key signatures as signed sharps/flats counts', () => {
    const song = read('key-signatures.gp5');
    const ascending = [0, -1, -2, -3, -4, -5, -6, -7, 0, 1, 2, 3, 4, 5, 6, 7];

    expect(song.tracks[0]?.measures.slice(0, 32).map((measure) => measure.keySignature)).toEqual([
      ...ascending,
      ...ascending,
    ]);
  });
});

describe('readGp5 measure headers', () => {
  it('carries time signatures over from measure to measure', () => {
    const song = read('time-signatures.gp5');

    expect(song.measureHeaders.slice(0, 5).map((header) => header.timeSignature)).toEqual([
      { numerator: 4, denominator: 4 },
      { numerator: 3, denominator: 4 },
      { numerator: 2, denominator: 4 },
      { numerator: 1, denominator: 4 },
      { numerator: 20, denominator: 32 },
    ]);
  });

  it('reads alternate endings and markers', () => {
    const song = read('alternate-endings-section-error.gp5');

    expect(song.measureHeaders).toHaveLength(2);
    expect(song.measureHeaders[1]?.repeatAlternative).toBe(4);
    expect(song.measureHeaders[1]?.marker?.title).toBe('Outro');
  });

  it('stores the repeat count minus one, as TuxGuitar does', () => {
    expect(read('repeat-close.gp5').measureHeaders[1]?.repeatClose).toBe(1);
    expect(read('repeat-close-multi.gp5').measureHeaders[1]?.repeatClose).toBe(3);
    expect(read('repeat-close-without-start-at-beginning.gp5').measureHeaders[1]?.repeatClose).toBe(1);
  });

  it('updates the measure tempo from mix-table changes', () => {
    const song = read('canon.gp5');

    expect(read('other-effects.gp5').measureHeaders[4]?.tempo).toBe(120);
    expect(song.measureHeaders.slice(14, 18).map((header) => header.tempo)).toEqual([90, 90, 200, 200]);
    expect(song.measureHeaders.slice(138, 142).map((header) => header.tempo)).toEqual([91, 97, 97, 100]);
  });

  it('reads repeat opens, closes and alternate endings', () => {
    const song = read('repeat-close-alternate-endings.gp5');

    expect(
      song.measureHeaders.map((header) => [header.repeatOpen, header.repeatClose, header.repeatAlternative]),
    ).toEqual([
      [true, 0, 0],
      [false, 0, 5],
      [false, 0, 2],
      [false, 3, 0],
      [false, 0, 0],
    ]);
  });
});

describe('readGp5 voices', () => {
  it('merges both voices into beats ordered by start', () => {
    // nightwish.gp5, drums, measure 46: quarter notes in voice 1, a rest then sixteenths in voice 2
    const measure = read('nightwish.gp5').tracks[10]?.measures[45];
    const summary = measure?.beats.map((beat) => [beat.start, describeVoice(beat.voices[0]), describeVoice(beat.voices[1])]);

    expect(summary?.slice(0, 6)).toEqual([
      [173760, '4:1/49,2/57,6/36', '4:'],
      [174720, '4:1/46,5/40', '16:3/54'],
      [174960, '-', '16:3/54'],
      [175200, '-', '16:3/54'],
      [175440, '-', '16:3/54'],
      [175680, '4:1/46,6/36', '16:3/54'],
    ]);
    expect(measure?.beats).toHaveLength(13);
  });

  it('keeps a second-voice note held under first-voice beats', () => {
    const measure = read('nightwish.gp5').tracks[0]?.measures[85];

    expect(measure?.beats.map((beat) => [beat.start, describeVoice(beat.voices[0]), describeVoice(beat.voices[1])])).toEqual([
      [327360, '4:', '1:3/14'],
      [328320, '8:1/1', '-'],
      [328800, '4:1/0', '-'],
      [330240, '8:3/5', '-'],
      [330720, '8:3/2', '-'],
    ]);
  });

  it('drops beats that are empty in both voices', () => {
    const song = read('nightwish.gp5');

    song.tracks.forEach((track) =>
      track.measures.forEach((measure) =>
        measure.beats.forEach((beat) => expect(beat.voices.some((voice) => !voice.isEmpty)).toBe(true)),
      ),
    );
  });
});

describe('readGp5 errors', () => {
  it('reports where a truncated file ends', () => {
    const bytes = loadFixture('guitarpro5', 'canon.gp5');

    expect(() => readSong(bytes.subarray(0, bytes.length / 2))).toThrow(GpFormatError);
    expect(() => readSong(bytes.subarray(0, bytes.length / 2))).toThrow(/measure \d+, track \d+/);
  });
});

describe('readGp5 note values', () => {
  it('reads frets, strings and durations of the notes fixture', () => {
    const song = read('notes.gp5');
    const values = [1, 2, 4, 8, 16, 32, 64];

    values.forEach((value, group) => {
      for (let fret = 1; fret <= 4; fret++) {
        const beat = beatAt(song, 0, group * 5 + fret - 1);
        expect(firstNote(beat)).toMatchObject({ fret, string: 6 });
        expect(beat.voices[0]?.duration.value).toBe(value);
      }
      const rest = beatAt(song, 0, group * 5 + 4);
      expect(rest.voices[0]).toMatchObject({ notes: [], isEmpty: false, duration: { value } });
    });
  });

  it('marks dead notes', () => {
    const song = read('dead.gp5');

    [6, 5, 4, 3].forEach((string, index) => {
      expect(firstNote(beatAt(song, 0, index))).toMatchObject({ string, effect: { deadNote: true } });
    });
  });

  it('keeps grace notes as an effect of the following note', () => {
    const song = read('grace.gp5');

    expect(firstNote(beatAt(song, 0, 0)).fret).toBe(2);
    expect(firstNote(beatAt(song, 0, 0)).effect.grace).toEqual({
      fret: 3,
      duration: 2,
      velocity: 95,
      transition: 'none',
      onBeat: false,
      isDead: false,
    });
    expect(firstNote(beatAt(song, 0, 1)).effect.grace).toMatchObject({ fret: 2, duration: 3, transition: 'slide' });
  });

  it('reads ghost notes, accents, heavy accents and let ring', () => {
    const song = read('accentuations.gp5');

    expect(firstNote(beatAt(song, 0, 0)).effect.ghostNote).toBe(true);
    expect(firstNote(beatAt(song, 0, 1)).effect.accentuatedNote).toBe(true);
    expect(firstNote(beatAt(song, 0, 2)).effect.heavyAccentuatedNote).toBe(true);
    expect(firstNote(beatAt(song, 0, 3)).effect.letRing).toBe(true);
  });

  it('reads the harmonic kinds', () => {
    const song = read('harmonics.gp5');
    const types = [0, 1, 2, 3, 4].map((index) => firstNote(beatAt(song, 0, index)).effect.harmonic?.type);

    expect(types).toEqual(['natural', 'artificial', 'tapped', 'semi', 'pinch']);
  });

  it('converts harmonic data to semitone offsets and tapped frets', () => {
    const song = read('harmonic-types.gp5');
    const harmonic = (measure: number, index: number) => firstNote(beatAt(song, measure, index)).effect.harmonic;

    expect(harmonic(0, 0)).toEqual({ type: 'natural', data: 0 });
    expect(harmonic(0, 1)).toEqual({ type: 'artificial', data: 12 });
    // the tap byte is the right-hand fret: 6 over a note on fret 1 (TuxGuitar: AH5)
    expect(harmonic(0, 2)).toEqual({ type: 'tapped', data: 6 });
    expect(harmonic(0, 3)).toEqual({ type: 'pinch', data: 0 });
    expect(harmonic(1, 0)).toEqual({ type: 'semi', data: 0 });
  });

  it('reads hammer-ons and pull-offs', () => {
    const song = read('hammer.gp5');

    expect(beatAt(song, 0, 0).voices[0]?.notes.map((note) => note.effect.hammer)).toEqual([false, true, true, true]);
    expect(firstNote(beatAt(song, 1, 0)).effect.hammer).toBe(true);
    expect(firstNote(beatAt(song, 1, 1)).effect.hammer).toBe(true);
  });

  it('converts bend points to positions 0-12 and quarter tones', () => {
    // alphaTab simplifies the first bend to two points; the file holds three (GP position 15 → 3).
    const song = read('bends.gp5');

    expect(firstNote(beatAt(song, 0, 0)).effect.bend?.points).toEqual([
      { position: 0, value: 0 },
      { position: 3, value: 4 },
      { position: 12, value: 4 },
    ]);
    expect(firstNote(beatAt(song, 0, 1)).effect.bend?.points).toHaveLength(7);
  });

  it('reads tremolo bar points in quarter tones', () => {
    const song = read('tremolo.gp5');

    expect(firstNote(beatAt(song, 0, 0)).effect.tremoloBar?.points).toEqual([
      { position: 0, value: 0 },
      { position: 6, value: -4 },
      { position: 12, value: 0 },
    ]);
    expect(firstNote(beatAt(song, 2, 0)).effect.tremoloBar?.points).toEqual([
      { position: 0, value: 0 },
      { position: 9, value: -4 },
      { position: 12, value: -4 },
    ]);
  });

  it('reads the slide flags', () => {
    const song = read('slides.gp5');

    expect(noteOn(beatAt(song, 0, 0), 2).effect.slides).toEqual(['legato']);
    expect(noteOn(beatAt(song, 0, 2), 5).effect.slides).toEqual(['shift']);
    expect(noteOn(beatAt(song, 1, 0), 2).effect.slides).toEqual(['intoFromBelow']);
    expect(noteOn(beatAt(song, 1, 1), 2).effect.slides).toEqual(['intoFromAbove']);
    expect(noteOn(beatAt(song, 1, 2), 2).effect.slides).toEqual(['outDownwards']);
    expect(noteOn(beatAt(song, 1, 3), 2).effect.slides).toEqual(['outUpwards']);
  });

  it('reads note and beat vibrato', () => {
    const song = read('vibrato.gp5');

    [0, 1, 2, 3].forEach((index) => expect(firstNote(beatAt(song, 0, index)).effect.vibrato).toBe(true));
  });

  it('reads trills and tremolo picking', () => {
    const song = read('trills.gp5');

    expect(firstNote(beatAt(song, 0, 0)).effect.trill).toMatchObject({ fret: 2, duration: { value: 16 } });
    expect(firstNote(beatAt(song, 0, 1)).effect.tremoloPicking?.duration.value).toBe(32);
    expect(firstNote(beatAt(song, 0, 2)).effect.tremoloPicking?.duration.value).toBe(16);
    expect(firstNote(beatAt(song, 0, 3)).effect.tremoloPicking?.duration.value).toBe(8);
  });

  it('reads palm mute, staccato, tapping, slapping, popping, fade in, chords and texts', () => {
    const song = read('other-effects.gp5');

    expect(firstNote(beatAt(song, 0, 0)).effect.palmMute).toBe(true);
    expect(firstNote(beatAt(song, 0, 1)).effect.staccato).toBe(true);
    expect(firstNote(beatAt(song, 0, 2)).effect.tapping).toBe(true);
    expect(firstNote(beatAt(song, 0, 3)).effect.slapping).toBe(true);
    expect(firstNote(beatAt(song, 1, 0)).effect.popping).toBe(true);
    expect(firstNote(beatAt(song, 1, 1)).effect.fadeIn).toBe(true);
    expect(beatAt(song, 3, 0).chord?.name).toBe('C');
    expect(beatAt(song, 3, 1).text).toBe('Text');
  });

  it('reads strokes and pick strokes', () => {
    const song = read('strokes.gp5');

    expect(beatAt(song, 0, 0).stroke).toEqual({ direction: 'down', value: 32 });
    expect(beatAt(song, 0, 1).stroke).toEqual({ direction: 'up', value: 32 });
    expect(beatAt(song, 0, 2).pickStroke).toBe('up');
    expect(beatAt(song, 0, 3).pickStroke).toBe('down');
  });

  it('reads triplets and quintuplets', () => {
    const song = read('tuplets.gp5');

    for (let index = 0; index < 3; index++) {
      expect(beatAt(song, 0, index).voices[0]?.duration.tuplet).toEqual({ enters: 3, times: 2 });
    }
    for (let index = 0; index < 5; index++) {
      expect(beatAt(song, 1, index).voices[0]?.duration.tuplet).toEqual({ enters: 5, times: 4 });
    }
  });

  it('reads palm mute and let ring ranges', () => {
    const song = read('ranges.gp5');

    [0, 1, 2, 3].forEach((index) => expect(firstNote(beatAt(song, 0, index)).effect.palmMute).toBe(true));
    [1, 2, 3].forEach((index) => expect(firstNote(beatAt(song, 1, index)).effect.letRing).toBe(true));
    expect(firstNote(beatAt(song, 2, 0)).effect.letRing).toBe(true);
  });

  it('numbers strings from the highest', () => {
    const song = read('strings.gp5');
    const beat = beatAt(song, 0, 0);

    for (let string = 1; string <= 6; string++) {
      expect(noteOn(beat, string).fret).toBe(string);
    }
  });

  it('reads chord diagrams', () => {
    const song = read('chords.gp5');
    const chord = (measure: number, index: number) => beatAt(song, measure, index).chord;

    expect(chord(0, 0)).toEqual({ name: 'C', firstFret: 1, frets: [0, 1, 0, 2, 3, -1] });
    expect(chord(0, 1)).toEqual({ name: 'Cm', firstFret: 1, frets: [-1, -1, 0, 1, 3, -1] });
    expect(chord(0, 2)).toEqual({ name: 'C', firstFret: 1, frets: [3, 5, 5, 5, 3, -1] });
    expect(chord(0, 3)).toEqual({ name: 'Cm', firstFret: 1, frets: [3, 4, 5, 5, 3, -1] });
    expect(chord(1, 0)).toEqual({ name: 'D', firstFret: 1, frets: [2, 3, 2, 0, -1, -1] });
    expect(chord(1, 1)).toEqual({ name: 'Dm', firstFret: 1, frets: [1, 3, 2, 0, -1, -1] });
    expect(chord(1, 2)).toEqual({ name: 'D', firstFret: 5, frets: [5, 7, 7, 7, 5, -1] });
    expect(chord(1, 3)).toEqual({ name: 'Dm', firstFret: 5, frets: [5, 6, 7, 7, 5, -1] });
  });
});
