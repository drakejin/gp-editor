import { describe, expect, it } from 'vitest';
import { GpFormatError } from '../src/errors';
import { readSong } from '../src/read-song';
import { writeSong } from '../src/write';
import { readMidiSong } from '../src/formats/midi/midi-song-reader';
import { STANDARD_BASS_TUNING, STANDARD_TUNING } from '../src/model/defaults';
import type { Song } from '../src/model/song';
import { loadFixture } from './helpers/fixtures';
import { assertSongInvariants } from './helpers/invariants';
import {
  buildSmf,
  controlChange,
  keySignature,
  note,
  noteOn,
  programChange,
  tempo,
  timeSignature,
  trackName,
} from './helpers/smf-builder';
import { beatsOf, pitchOf, struckNotes } from './helpers/song-notes';

/** Synthetic files use 480 ticks per quarter; the song has 960, from tick 960. */
const Q = 480;
const SONG_Q = 960;

function tunings(song: Song): number[][] {
  return song.tracks.map((track) => track.strings.map((guitarString) => guitarString.tuning));
}

function programOf(song: Song, trackIndex: number): number | undefined {
  const track = song.tracks[trackIndex];
  return song.channels.find((channel) => channel.id === track?.channelId)?.program;
}

describe('readMidiSong: a format 1 file', () => {
  const bytes = buildSmf([
    [trackName(0, 'My Song'), tempo(0, 100), timeSignature(0, 3, 2)],
    [trackName(0, 'Lead'), programChange(0, 0, 27), ...note(0, Q, 0, 64), ...note(Q, Q, 0, 67), ...note(2 * Q, Q, 0, 71, 80)],
    [trackName(0, 'Bass'), programChange(0, 1, 33), ...note(0, 3 * Q, 1, 40)],
  ]);

  it('reads the song name, tempo, meter, track names and programs', () => {
    // Act
    const song = readMidiSong(bytes);

    // Assert
    assertSongInvariants(song);
    expect(song.source).toEqual({ format: 'midi', version: 'SMF 1' });
    expect(song.info.title).toBe('My Song');
    expect(song.measureHeaders).toHaveLength(1);
    expect(song.measureHeaders[0]).toMatchObject({ number: 1, start: SONG_Q, tempo: 100, timeSignature: { numerator: 3, denominator: 4 } });
    expect(song.tracks.map((track) => track.name)).toEqual(['Lead', 'Bass']);
    expect([programOf(song, 0), programOf(song, 1)]).toEqual([27, 33]);
  });

  it('puts each note on a beat of its length, at the lowest fret of a standard tuning', () => {
    // Act
    const song = readMidiSong(bytes);

    // Assert
    expect(beatsOf(song, 0, 0)).toEqual([
      { at: 0, ticks: SONG_Q, pitches: [64] },
      { at: SONG_Q, ticks: SONG_Q, pitches: [67] },
      { at: 2 * SONG_Q, ticks: SONG_Q, pitches: [71] },
    ]);
    const lead = song.tracks[0]?.measures[0]?.beats.map((beat) => beat.voices[0]?.notes[0]);
    expect(lead?.map((n) => [n?.string, n?.fret, n?.velocity])).toEqual([
      [1, 0, 100],
      [1, 3, 100],
      [1, 7, 80],
    ]);
  });

  it('gives a bass program a 4-string bass in bass clef, and a guitar a 6-string guitar', () => {
    // Act
    const song = readMidiSong(bytes);

    // Assert
    expect(tunings(song)).toEqual([[...STANDARD_TUNING], [...STANDARD_BASS_TUNING]]);
    expect(song.tracks[1]?.measures[0]?.clef).toBe('bass');
    expect(song.tracks[0]?.measures[0]?.clef).toBe('treble');
    expect(beatsOf(song, 1, 0)).toEqual([{ at: 0, ticks: 3 * SONG_Q, pitches: [40] }]);
  });

  it('reads running status like full status bytes', () => {
    // Arrange
    const tracks = [[tempo(0, 90)], [...note(0, Q, 0, 60), ...note(Q, Q, 0, 62), ...note(Q, 2 * Q, 0, 66)]];

    // Act
    const plain = readMidiSong(buildSmf(tracks));
    const running = readMidiSong(buildSmf(tracks, { runningStatus: true }));

    // Assert
    expect(running).toEqual(plain);
  });
});

describe('readMidiSong: a format 0 file', () => {
  const bytes = buildSmf(
    [
      [
        trackName(0, 'Groove'),
        programChange(0, 0, 30),
        programChange(0, 9, 0),
        ...note(0, Q, 0, 52),
        ...note(0, Q / 2, 9, 36),
        ...note(0, Q / 2, 9, 42),
        ...note(Q, Q / 2, 9, 38),
      ],
    ],
    { format: 0 },
  );

  it('splits the track by channel, drums on channel 10 as a percussion track', () => {
    // Act
    const song = readMidiSong(bytes);

    // Assert
    assertSongInvariants(song);
    expect(song.source.version).toBe('SMF 0');
    expect(song.info.title).toBe('Groove');
    expect(song.tracks.map((track) => [track.name, track.isPercussion])).toEqual([
      ['Distortion Electric Guitar', false],
      ['Drums', true],
    ]);
    expect(song.channels.map((channel) => [channel.program, channel.bank, channel.isPercussion])).toEqual([
      [30, 0, false],
      [0, 128, true],
    ]);
  });

  it('puts drum notes on their drum strings, the pitch as the fret', () => {
    // Act
    const song = readMidiSong(bytes);
    const drums = song.tracks[1];

    // Assert
    expect(drums?.strings.map((guitarString) => guitarString.tuning)).toEqual([0, 0, 0, 0, 0, 0]);
    const notes = drums?.measures[0]?.beats.map((beat) => beat.voices[0]?.notes.map((n) => [n.string, n.fret]));
    expect(notes?.slice(0, 3)).toEqual([[[2, 42], [6, 36]], [], [[4, 38]]]);
    expect(song.tracks[1]?.measures[0]?.keySignature).toBe(0);
  });
});

describe('readMidiSong: measure headers', () => {
  it('turns tempo, time signature and key signature changes into measure headers', () => {
    // Arrange: 4/4, then 6/8 from bar 2 (4 quarters in), 90 bpm from bar 3, keys C, D, E flat.
    const bar2 = 4 * Q;
    const bar3 = bar2 + 3 * Q;
    const bytes = buildSmf([
      [timeSignature(0, 4, 2), tempo(0, 120), keySignature(0, 0), timeSignature(bar2, 6, 3), keySignature(bar2, 2), tempo(bar3, 90), keySignature(bar3, -3)],
      [...note(0, Q, 0, 60), ...note(bar2, Q, 0, 62), ...note(bar3, Q, 0, 63), ...note(bar3 + 3 * Q, Q, 0, 65)],
    ]);

    // Act
    const song = readMidiSong(bytes);

    // Assert
    assertSongInvariants(song);
    expect(song.measureHeaders.map((header) => [header.timeSignature.numerator, header.timeSignature.denominator, header.tempo])).toEqual([
      [4, 4, 120],
      [6, 8, 120],
      [6, 8, 90],
      [6, 8, 90],
    ]);
    expect(song.tracks[0]?.measures.map((measure) => measure.keySignature)).toEqual([0, 2, -3, -3]);
  });

  it('ends the song at the measure that holds the end of the longest track', () => {
    // Arrange: one note in bar 1, the track ends at the end of bar 3.
    const bytes = buildSmf([[...note(0, Q, 0, 60), noteOn(12 * Q, 0, 60, 0)]]);

    // Act
    const song = readMidiSong(bytes);

    // Assert
    expect(song.measureHeaders).toHaveLength(3);
    expect(beatsOf(song, 0, 2)).toEqual([{ at: 0, ticks: 4 * SONG_Q, pitches: [] }]);
  });
});

describe('readMidiSong: notes', () => {
  it('splits a sounding note where another starts, and ties the rest of it', () => {
    // Arrange
    const bytes = buildSmf([[...note(0, 2 * Q, 0, 60), ...note(Q, Q, 0, 64)]]);

    // Act
    const song = readMidiSong(bytes);

    // Assert
    expect(beatsOf(song, 0, 0)).toEqual([
      { at: 0, ticks: SONG_Q, pitches: [60] },
      { at: SONG_Q, ticks: SONG_Q, pitches: [60, 64] },
      { at: 2 * SONG_Q, ticks: 2 * SONG_Q, pitches: [] },
    ]);
    const second = song.tracks[0]?.measures[0]?.beats[1]?.voices[0]?.notes ?? [];
    const first = song.tracks[0]?.measures[0]?.beats[0]?.voices[0]?.notes[0];
    const tied = second.find((n) => n.isTied);
    expect(tied).toMatchObject({ string: first?.string, fret: first?.fret });
    expect(second.filter((n) => !n.isTied)).toHaveLength(1);
  });

  it('ties a note across the bar line', () => {
    // Arrange: a half note from the last beat of bar 1.
    const bytes = buildSmf([[...note(3 * Q, 2 * Q, 0, 69)]]);

    // Act
    const song = readMidiSong(bytes);

    // Assert
    expect(beatsOf(song, 0, 0)).toEqual([
      { at: 0, ticks: 3 * SONG_Q, pitches: [] },
      { at: 3 * SONG_Q, ticks: SONG_Q, pitches: [69] },
    ]);
    expect(beatsOf(song, 0, 1)).toEqual([
      { at: 0, ticks: SONG_Q, pitches: [69] },
      { at: SONG_Q, ticks: 3 * SONG_Q, pitches: [] },
    ]);
    expect(song.tracks[0]?.measures[1]?.beats[0]?.voices[0]?.notes[0]?.isTied).toBe(true);
  });

  it('keeps triplets when the settings allow them', () => {
    // Arrange: three triplet eighths, then a quarter.
    const third = Q / 3;
    const bytes = buildSmf([[...note(0, third, 0, 60), ...note(third, third, 0, 62), ...note(2 * third, third, 0, 64), ...note(Q, Q, 0, 67)]]);

    // Act
    const song = readMidiSong(bytes, { maxDivision: 3 });

    // Assert
    const triplets = song.tracks[0]?.measures[0]?.beats.slice(0, 3).map((beat) => beat.voices[0]?.duration);
    expect(triplets).toEqual(Array.from({ length: 3 }, () => ({ value: 8, dotted: false, doubleDotted: false, tuplet: { enters: 3, times: 2 } })));
    expect(struckNotes(song, 0).map(([tick]) => tick - SONG_Q)).toEqual([0, 320, 640, 960]);
  });

  it("puts triplets on TuxGuitar's default sixteenth grid", () => {
    // Arrange
    const third = Q / 3;
    const bytes = buildSmf([[...note(0, third, 0, 60), ...note(third, third, 0, 62), ...note(2 * third, third, 0, 64), ...note(Q, Q, 0, 67)]]);

    // Act
    const song = readMidiSong(bytes);

    // Assert
    expect(beatsOf(song, 0, 0).slice(0, 4)).toEqual([
      { at: 0, ticks: 240, pitches: [60] },
      { at: 240, ticks: 480, pitches: [62] },
      { at: 720, ticks: 240, pitches: [64] },
      { at: 960, ticks: 960, pitches: [67] },
    ]);
  });

  it('writes the longest plain duration that fits when quantisation is off', () => {
    // Arrange: seven sixteenths.
    const bytes = buildSmf([[...note(0, (7 * Q) / 4, 0, 60)]]);

    // Act
    const quantised = readMidiSong(bytes);
    const plain = readMidiSong(bytes, { quantization: false });

    // Assert
    expect(beatsOf(quantised, 0, 0)[0]).toEqual({ at: 0, ticks: 1440, pitches: [60] });
    expect(beatsOf(plain, 0, 0)[0]).toEqual({ at: 0, ticks: 960, pitches: [60] });
  });

  it('transposes every note by the setting', () => {
    // Arrange
    const bytes = buildSmf([[...note(0, Q, 0, 60)]]);

    // Act
    const song = readMidiSong(bytes, { transpose: -12 });

    // Assert
    expect(struckNotes(song, 0)).toEqual([[SONG_Q, 48]]);
  });

  it('ends a note left sounding at the end of its track', () => {
    // Arrange: a note-on without a note-off, the track ends two quarters later.
    const bytes = buildSmf([[noteOn(0, 0, 60), { tick: 2 * Q, bytes: [0xff, 0x01, 0x00] }]]);

    // Act
    const song = readMidiSong(bytes);

    // Assert
    expect(beatsOf(song, 0, 0)[0]).toEqual({ at: 0, ticks: 2 * SONG_Q, pitches: [60] });
  });

  it('keeps as many notes of a chord as the strings hold', () => {
    // Arrange: seven notes at once on a guitar.
    const chord = [40, 45, 50, 55, 59, 64, 69].flatMap((key) => note(0, Q, 0, key));
    const bytes = buildSmf([[programChange(0, 0, 25), ...chord]]);

    // Act
    const song = readMidiSong(bytes);

    // Assert
    const notes = song.tracks[0]?.measures[0]?.beats[0]?.voices[0]?.notes ?? [];
    expect(notes).toHaveLength(6);
    expect(new Set(notes.map((n) => n.string)).size).toBe(6);
    const track = song.tracks[0];
    expect(notes.every((n) => track !== undefined && [40, 45, 50, 55, 59, 64, 69].includes(pitchOf(track, n)))).toBe(true);
  });
});

describe('readMidiSong: tunings', () => {
  it("takes TuxGuitar's next tuning when the notes do not fit a standard guitar", () => {
    // Arrange: a low C on a guitar.
    const bytes = buildSmf([[programChange(0, 0, 25), ...note(0, Q, 0, 36), ...note(Q, Q, 0, 64)]]);

    // Act
    const song = readMidiSong(bytes);

    // Assert
    expect(tunings(song)).toEqual([[64, 59, 55, 50, 45, 40, 35]]);
    expect(struckNotes(song, 0).map(([, pitch]) => pitch)).toEqual([36, 64]);
  });

  it('spreads strings over the range when no preset tuning holds it', () => {
    // Arrange: a piano's lowest A and a C three octaves up: 6 strings 2 semitones apart, the top one 29 frets below C.
    const bytes = buildSmf([[programChange(0, 0, 0), ...note(0, Q, 0, 21), ...note(Q, Q, 0, 60)]]);

    // Act
    const song = readMidiSong(bytes);

    // Assert
    expect(tunings(song)).toEqual([[31, 29, 27, 25, 23, 21]]);
    expect(struckNotes(song, 0).map(([, pitch]) => pitch)).toEqual([21, 60]);
  });
});

describe('readMidiSong: TuxGuitar details', () => {
  it('keeps a format 0 file with one channel as one track named after its instrument', () => {
    // Arrange
    const bytes = buildSmf([[trackName(0, 'Solo'), programChange(0, 3, 24), ...note(0, Q, 3, 60)]], { format: 0 });

    // Act
    const song = readMidiSong(bytes);

    // Assert
    expect(song.info.title).toBe('Solo');
    expect(song.tracks.map((track) => track.name)).toEqual(['Nylon String Acoustic Guitar']);
  });

  it('makes one channel of the MIDI channels a track plays together, as TuxGuitar writes a channel and its bend channel', () => {
    // Arrange: one track playing on MIDI channels 0, 1 and 2.
    const bytes = buildSmf([[programChange(0, 0, 29), ...note(0, Q, 0, 60), ...note(Q, Q, 1, 62), ...note(2 * Q, Q, 2, 64)]]);

    // Act
    const song = readMidiSong(bytes);

    // Assert
    expect(song.channels.map((channel) => channel.program)).toEqual([29]);
    expect(struckNotes(song, 0).map(([, pitch]) => pitch)).toEqual([60, 62, 64]);
  });

  it('ignores time signatures, tempos and keys it cannot hold', () => {
    // Arrange: numerator 0, a tempo of 0 µs per quarter, nine sharps.
    const bytes = buildSmf([
      [timeSignature(0, 0, 2), { tick: 0, bytes: [0xff, 0x51, 0x03, 0, 0, 0] }, keySignature(0, 9), tempo(0, 1_000_000)],
      [...note(0, Q, 0, 60)],
    ]);

    // Act
    const song = readMidiSong(bytes);

    // Assert
    expect(song.measureHeaders[0]).toMatchObject({ timeSignature: { numerator: 4, denominator: 4 }, tempo: 999 });
    expect(song.tracks[0]?.measures[0]?.keySignature).toBe(0);
  });

  it('fills with a rest what the grid cannot fill at the end of a 7/32 bar', () => {
    // Arrange: a note held over two 7/32 bars (7/8 of a quarter each).
    const bytes = buildSmf([[timeSignature(0, 7, 5)], [...note(0, (7 * Q) / 4, 0, 60)]]);

    // Act
    const song = readMidiSong(bytes);

    // Assert
    assertSongInvariants(song);
    expect(beatsOf(song, 0, 0)).toEqual([
      { at: 0, ticks: 720, pitches: [60] },
      { at: 720, ticks: 120, pitches: [] },
    ]);
    expect(beatsOf(song, 0, 1)[0]).toEqual({ at: 0, ticks: 720, pitches: [60] });
  });
});

describe('readSong: a real MIDI file (Bach, Menuet in G, Mutopia, public domain)', () => {
  const bytes = loadFixture('midi', 'anna-magdalena-04-guitar.mid');

  it('reads the meter, tempo, key and the two voices of the first bar', () => {
    // Act
    const song = readSong(bytes);

    // Assert
    assertSongInvariants(song);
    expect(song.source).toEqual({ format: 'midi', version: 'SMF 1' });
    expect(song.measureHeaders).toHaveLength(32);
    expect(song.measureHeaders[0]).toMatchObject({ timeSignature: { numerator: 3, denominator: 4 }, tempo: 136 });
    expect(song.tracks).toHaveLength(1);
    expect(song.tracks[0]?.measures.every((measure) => measure.keySignature === 1)).toBe(true);
    expect(beatsOf(song, 0, 0).map((beat) => beat.pitches)).toEqual([[55, 74], [55, 67], [55, 69], [57, 71], [57, 72]]);
  });

  it('saves as a GP5 file that reads back with the same measures and notes', () => {
    // Arrange
    const song = readSong(bytes);

    // Act
    const saved = readSong(writeSong(song, 'gp5'));

    // Assert
    assertSongInvariants(saved);
    expect(saved.measureHeaders).toHaveLength(song.measureHeaders.length);
    expect(struckNotes(saved, 0)).toEqual(struckNotes(song, 0));
  });
});

describe('readSong: MIDI files', () => {
  it('detects a Standard MIDI File and reads it with the default settings', () => {
    // Arrange
    const bytes = buildSmf([[trackName(0, 'Ünïcode'), ...note(0, Q, 0, 60)]]);

    // Act
    const song = readSong(bytes);

    // Assert
    expect(song.source.format).toBe('midi');
    expect(song.info.title).toBe('Ünïcode');
    expect(struckNotes(song, 0)).toEqual([[SONG_Q, 60]]);
  });

  it('reports a corrupt MIDI file as a GpFormatError', () => {
    // Arrange
    const bytes = buildSmf([[...note(0, Q, 0, 60)]]).subarray(0, 30);

    // Act / Assert
    expect(() => readSong(bytes)).toThrow(GpFormatError);
  });
});

describe('readMidiSong: tracks without notes and bad files', () => {
  it('keeps a named track without notes, with rests and a channel of its own', () => {
    // Arrange
    const bytes = buildSmf([[tempo(0, 120)], [trackName(0, 'Empty')], [trackName(0, 'Guitar'), ...note(0, Q, 0, 60)]]);

    // Act
    const song = readMidiSong(bytes);

    // Assert
    assertSongInvariants(song);
    expect(song.tracks.map((track) => track.name)).toEqual(['Empty', 'Guitar']);
    expect(beatsOf(song, 0, 0)).toEqual([{ at: 0, ticks: 4 * SONG_Q, pitches: [] }]);
    expect(song.tracks[0]?.channelId).not.toBe(song.tracks[1]?.channelId);
  });

  it('keeps velocities, programs and volumes in the MIDI range when a data byte is out of it', () => {
    // Arrange: data bytes with the high bit set, which a MIDI file should not hold.
    const bytes = buildSmf([[programChange(0, 0, 200), controlChange(0, 0, 7, 255), noteOn(0, 0, 60, 200), noteOn(Q, 0, 60, 0)]]);

    // Act
    const song = readMidiSong(bytes);

    // Assert
    assertSongInvariants(song);
    expect(song.channels[0]).toMatchObject({ program: 0, volume: 127 });
    expect(song.tracks[0]?.measures[0]?.beats[0]?.voices[0]?.notes[0]?.velocity).toBe(127);
  });

  it('rejects a file without notes', () => {
    // Arrange
    const bytes = buildSmf([[tempo(0, 120), trackName(0, 'Nothing')]]);

    // Act / Assert
    expect(() => readMidiSong(bytes)).toThrow(GpFormatError);
    expect(() => readMidiSong(bytes)).toThrow(/no notes/);
  });

  it('rejects a song longer than the measure limit', () => {
    // Arrange: a note held for 5000 bars.
    const bytes = buildSmf([[...note(0, 5000 * 4 * Q, 0, 60)]]);

    // Act / Assert
    expect(() => readMidiSong(bytes)).toThrow(/measures/);
  });

  it('rejects settings outside the import dialog choices', () => {
    // Arrange
    const bytes = buildSmf([[...note(0, Q, 0, 60)]]);

    // Act / Assert
    expect(() => readMidiSong(bytes, { maxDivision: 7 })).toThrow(RangeError);
    expect(() => readMidiSong(bytes, { maxDurationValue: 2 })).toThrow(RangeError);
    expect(() => readMidiSong(bytes, { transpose: 30 })).toThrow(RangeError);
  });
});
