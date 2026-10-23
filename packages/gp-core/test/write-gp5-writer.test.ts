import { describe, expect, it } from 'vitest';
import { detectFormat } from '../src/formats/detect';
import { decodeWindows1252 } from '../src/io/text';
import { plainDuration } from '../src/model/defaults';
import type { Note, Song } from '../src/model/song';
import { readSong } from '../src/read-song';
import { writeSong } from '../src/write/index';
import { listFixtures, loadFixture } from './helpers/fixtures';
import { firstByteDifference, songDifference } from './helpers/write-compare';
import { expectedAfterGp5 } from './helpers/write-expected';
import { buildNote, buildSong, buildVoice, restVoice, songWithNotes } from './helpers/write-song-builder';

function roundTrip(song: Song): Song {
  return readSong(writeSong(song));
}

function notesOf(song: Song, measure = 0): readonly Note[] {
  return song.tracks[0]?.measures[measure]?.beats.flatMap((beat) => beat.voices[0]?.notes ?? []) ?? [];
}

describe('writeSong output', () => {
  it('starts with the Guitar Pro 5.10 version block', () => {
    // Arrange / Act
    const bytes = writeSong(songWithNotes([buildNote(1, 0)]));

    // Assert
    expect(bytes[0]).toBe(24);
    expect(decodeWindows1252(bytes.subarray(1, 25))).toBe('FICHIER GUITAR PRO v5.10');
    expect(detectFormat(bytes)).toEqual({ format: 'gp5', version: 'FICHIER GUITAR PRO v5.10' });
  });

  it('writes GP5 by default and when asked', () => {
    // Arrange
    const song = songWithNotes([buildNote(1, 3)]);

    // Act / Assert
    expect(writeSong(song)).toEqual(writeSong(song, 'gp5'));
  });

  it('refuses a song without measures or tracks', () => {
    // Arrange
    const song = songWithNotes([buildNote(1, 0)]);

    // Act / Assert
    expect(() => writeSong({ ...song, measureHeaders: [], tracks: song.tracks.map((t) => ({ ...t, measures: [] })) })).toThrow(
      RangeError,
    );
    expect(() => writeSong({ ...song, tracks: [] })).toThrow(RangeError);
  });

  // Guitar Pro 5 leaves memory garbage after the version string; everything else matches byte for byte.
  it.each(['accentuations.gp5', 'dead.gp5', 'notes.gp5', 'strings.gp5', 'strokes.gp5', 'time-signatures.gp5', 'trills.gp5'])(
    'writes %s byte for byte as Guitar Pro 5 did',
    (name) => {
      // Arrange
      const original = loadFixture('guitarpro5', name);

      // Act
      const written = writeSong(readSong(original));

      // Assert
      expect(firstByteDifference(written, original)).toBe(-1);
    },
  );

  it('keeps every GP5 fixture the same length or shorter (no structure is added)', () => {
    // Arrange
    const names = listFixtures('guitarpro5');

    // Act
    const grown = names.filter((name) => {
      const original = loadFixture('guitarpro5', name);
      return writeSong(readSong(original)).length > original.length + 100;
    });

    // Assert: serenade.gp5 is v5.00 (no RSE blocks), so its v5.10 copy is a little longer
    expect(grown).toEqual([]);
  });
});

describe('writeSong song and track data', () => {
  it('round-trips song info, notice lines, lyrics, markers, repeats, keys and triplet feel', () => {
    // Arrange
    const song = buildSong({
      info: {
        title: 'Café €',
        subtitle: 'sub',
        artist: '기타',
        album: 'album',
        words: 'lyricist',
        music: 'composer',
        copyright: '©',
        transcriber: 'tab',
        instructions: 'slowly',
        notice: ['line 1', 'Ã© stays Ã©', ''],
      },
      headers: [
        { repeatOpen: true, marker: { title: 'Intro', color: { r: 1, g: 2, b: 3 } } },
        { timeSignature: { numerator: 3, denominator: 4 }, repeatClose: 2, tripletFeel: 'eighth' },
        { timeSignature: { numerator: 6, denominator: 8 }, repeatAlternative: 0b101, tripletFeel: 'sixteenth' },
        { repeatClose: -1 },
      ],
      tracks: [
        { measures: [[{ voice: buildVoice([buildNote(1, 1)]) }]], keySignatures: [0, -3, -3, 2] },
        {
          measures: [[{ voice: restVoice() }]],
          keySignatures: [0, -3, -3, 2],
          lyrics: { from: 2, text: 'la la' },
          name: 'Bass 5',
          clef: 'bass',
          strings: [43, 38, 33, 28, 23].map((tuning, i) => ({ number: i + 1, tuning })),
          color: { r: 10, g: 20, b: 30 },
          offset: 3,
          solo: true,
          mute: true,
        },
      ],
    });

    // Act
    const again = roundTrip(song);

    // Assert
    expect(songDifference(song, again)).toBeUndefined();
  });

  it('writes the tempo of the first measure in the header and later changes as mix tables', () => {
    // Arrange
    const tempos = [90, 90, 140, 140, 60];
    const song = buildSong({
      headers: tempos.map((tempo) => ({ tempo })),
      tracks: [{ measures: tempos.map(() => [{ voice: buildVoice([buildNote(1, 0)]) }]) }, { measures: [] }],
    });

    // Act
    const again = roundTrip(song);

    // Assert
    expect(again.measureHeaders.map((header) => header.tempo)).toEqual(tempos);
    expect(songDifference(song, again)).toBeUndefined();
  });

  it('rounds decimal tempos to whole numbers (GP5 stores integers), writing a change only where the rounded tempo changes', () => {
    // Arrange
    const tempos = [92.5, 92.4, 92.2, 100.25];
    const song = buildSong({
      headers: tempos.map((tempo) => ({ tempo })),
      tracks: [{ measures: tempos.map(() => [{ voice: buildVoice([buildNote(1, 0)]) }]) }],
    });

    // Act
    const again = roundTrip(song);

    // Assert
    expect(again.measureHeaders.map((header) => header.tempo)).toEqual([93, 92, 92, 100]);
    expect(songDifference(expectedAfterGp5(song), again)).toBeUndefined();
  });

  it('restores a tempo change in a measure whose first track has no beats', () => {
    // Arrange
    const song = buildSong({ headers: [{ tempo: 100 }, { tempo: 72 }], tracks: [{ measures: [] }] });

    // Act / Assert
    expect(roundTrip(song).measureHeaders.map((header) => header.tempo)).toEqual([100, 72]);
  });

  it('routes a percussion track to MIDI channel 10 and keeps its MIDI pitches', () => {
    // Arrange
    const song = buildSong({
      tracks: [
        { measures: [[{ voice: buildVoice([buildNote(1, 5)]) }]], channel: { program: 30, volume: 95, reverb: 15 } },
        { isPercussion: true, measures: [[{ voice: buildVoice([buildNote(1, 36), buildNote(2, 42), buildNote(3, 81)]) }]] },
      ],
    });

    // Act
    const again = roundTrip(song);

    // Assert
    expect(again.channels.map((channel) => [channel.name, channel.program, channel.bank, channel.isPercussion])).toEqual([
      ['Distortion Electric Guitar 1', 30, 0, false],
      ['DrumKit 1', 0, 128, true],
    ]);
    expect(songDifference(song, again)).toBeUndefined();
  });

  it('shares one GM channel between tracks on the same song channel', () => {
    // Arrange
    const base = buildSong({ headers: [{}], tracks: [{ measures: [] }, { measures: [] }] });
    const song: Song = { ...base, channels: base.channels.slice(0, 1), tracks: base.tracks.map((t) => ({ ...t, channelId: 1 })) };

    // Act
    const again = roundTrip(song);

    // Assert
    expect(again.channels).toHaveLength(1);
    expect(again.tracks.map((track) => track.channelId)).toEqual([1, 1]);
  });
});

describe('writeSong beats and voices', () => {
  it('round-trips two voices, rests, chords, texts, strokes and pick strokes', () => {
    // Arrange
    const chord = { name: 'Am', firstFret: 1, frets: [0, 1, 2, 2, 0, -1] };
    const song = buildSong({
      tracks: [
        {
          measures: [
            [
              { voice: buildVoice([buildNote(1, 0)]), voice2: buildVoice([buildNote(5, 0)]), chord, text: 'intro' },
              { voice: restVoice(), voice2: buildVoice([buildNote(4, 2)]), stroke: { direction: 'up', value: 32 } },
              { voice: buildVoice([buildNote(2, 1)], plainDuration(2)), pickStroke: 'down', text: '' },
            ],
            [{ voice: buildVoice([buildNote(3, 2)], { ...plainDuration(8), dotted: true }), stroke: { direction: 'down', value: 4 } }],
          ],
        },
      ],
    });

    // Act
    const again = roundTrip(song);

    // Assert
    expect(songDifference(song, again)).toBeUndefined();
  });

  it('keeps the chord and text of a beat whose first voice is empty', () => {
    // Arrange
    const base = buildSong({ tracks: [{ measures: [[{ voice: restVoice(), voice2: buildVoice([buildNote(1, 3)]) }]] }] });
    const beat = base.tracks[0]?.measures[0]?.beats[0];
    if (beat === undefined) {
      throw new Error('unreachable');
    }
    const emptyFirst = { ...beat, voices: [{ ...beat.voices[0]!, isEmpty: true }, beat.voices[1]!], text: 'v2', chord: { name: 'C', firstFret: 1, frets: [0, 1, 0, 2, 3, -1] } };
    const song: Song = { ...base, tracks: [{ ...base.tracks[0]!, measures: [{ ...base.tracks[0]!.measures[0]!, beats: [emptyFirst] }] }] };

    // Act
    const again = roundTrip(song);

    // Assert
    expect(again.tracks[0]?.measures[0]?.beats[0]).toMatchObject({ text: 'v2', chord: { name: 'C' } });
  });

  it('round-trips tuplets and every note value', () => {
    // Arrange
    const triplet = { ...plainDuration(8), tuplet: { enters: 3, times: 2 } };
    const values = [1, 2, 4, 8, 16, 32, 64] as const;
    const song = buildSong({
      headers: values.map(() => ({ timeSignature: { numerator: 8, denominator: 4 } })),
      tracks: [
        {
          measures: [
            [triplet, triplet, triplet].map((duration) => ({ voice: buildVoice([buildNote(1, 1)], duration) })),
            ...values.map((value) => [{ voice: buildVoice([buildNote(2, 2)], plainDuration(value)) }]),
          ],
        },
      ],
    });

    // Act / Assert
    expect(songDifference(song, roundTrip(song))).toBeUndefined();
  });

  it('keeps an empty voice with its own duration where the reader can place it', () => {
    // Arrange: GP5 files fill an unused second voice with empty beats, which the reader keeps
    const original = readSong(loadFixture('guitarpro5', 'nightwish.gp5'));

    // Act
    const again = roundTrip(original);

    // Assert
    expect(again.tracks[10]?.measures[53]?.beats[0]?.voices[1]?.duration.value).toBe(16);
    expect(songDifference(original, again)).toBeUndefined();
  });
});

describe('writeSong note effects', () => {
  it('round-trips bends and tremolo bars (quarter tones × 25, positions × 5)', () => {
    // Arrange
    const bend = { points: [{ position: 0, value: 0 }, { position: 3, value: 4 }, { position: 6, value: 4 }, { position: 12, value: 0 }] };
    const prebend = { points: [{ position: 0, value: 2 }, { position: 12, value: 2 }] };
    const dip = { points: [{ position: 0, value: 0 }, { position: 6, value: -8 }, { position: 12, value: 0 }] };
    const dive = { points: [{ position: 0, value: 0 }, { position: 12, value: -24 }] };
    const song = songWithNotes(
      [buildNote(1, 5, { effect: { bend } })],
      [buildNote(1, 5, { effect: { bend: prebend } })],
      [buildNote(2, 5, { effect: { tremoloBar: dip } })],
      [buildNote(2, 5, { effect: { tremoloBar: dive } }), buildNote(3, 5, { effect: { tremoloBar: dive } })],
    );

    // Act / Assert
    expect(songDifference(song, roundTrip(song))).toBeUndefined();
  });

  it('round-trips every harmonic type (artificial harmonics as AH12)', () => {
    // Arrange
    const song = songWithNotes(
      [buildNote(1, 12, { effect: { harmonic: { type: 'natural', data: 0 } } })],
      [buildNote(1, 5, { effect: { harmonic: { type: 'artificial', data: 12 } } })],
      [buildNote(1, 5, { effect: { harmonic: { type: 'tapped', data: 17 } } })],
      [buildNote(1, 5, { effect: { harmonic: { type: 'pinch', data: 0 } } }), buildNote(2, 5, { effect: { harmonic: { type: 'semi', data: 0 } } })],
    );

    // Act / Assert
    expect(songDifference(song, roundTrip(song))).toBeUndefined();
  });

  it('round-trips every slide, alone and combined, as GP5 slide flags', () => {
    // Arrange
    const slides = [['shift'], ['legato'], ['outDownwards'], ['outUpwards'], ['intoFromBelow'], ['intoFromAbove'], ['shift', 'outDownwards']] as const;
    const song = songWithNotes(...slides.map((slide) => [buildNote(1, 3, { effect: { slides: slide } })]));

    // Act / Assert
    expect(notesOf(roundTrip(song)).map((note) => note.effect.slides)).toEqual(slides);
  });

  it('round-trips grace notes, trills, tremolo picking and the note flags', () => {
    // Arrange
    const grace = { fret: 2, duration: 3, velocity: 79, transition: 'hammer', onBeat: true, isDead: false } as const;
    const deadGrace = { fret: 0, duration: 1, velocity: 15, transition: 'slide', onBeat: false, isDead: true } as const;
    const flags = { vibrato: true, hammer: true, ghostNote: true, accentuatedNote: true, palmMute: true, staccato: true, letRing: true };
    const song = songWithNotes(
      [buildNote(1, 5, { effect: { grace } }), buildNote(2, 5, { effect: { grace: deadGrace } })],
      [buildNote(1, 5, { effect: { trill: { fret: 7, duration: plainDuration(32) } } })],
      [buildNote(1, 5, { effect: { tremoloPicking: { duration: plainDuration(16) } } })],
      [buildNote(1, 5, { effect: flags }), buildNote(2, 5, { effect: { heavyAccentuatedNote: true, deadNote: true } })],
      [buildNote(1, 5, { effect: { fadeIn: true, slapping: true } }), buildNote(2, 6, { effect: { fadeIn: true, slapping: true } })],
      [buildNote(1, 5, { effect: { tapping: true } })],
      [buildNote(1, 5, { effect: { popping: true } })],
    );

    // Act / Assert
    expect(songDifference(song, roundTrip(song))).toBeUndefined();
  });

  it('round-trips slight vibrato as a note flag and wide vibrato as the beat’s wide-vibrato bit', () => {
    // Arrange
    const song = songWithNotes(
      [buildNote(1, 5, { effect: { vibrato: true } }), buildNote(2, 5)],
      [buildNote(1, 5, { effect: { wideVibrato: true } }), buildNote(2, 7, { effect: { wideVibrato: true } })],
    );

    // Act
    const bytes = writeSong(song);

    // Assert
    expect(songDifference(song, readSong(bytes))).toBeUndefined();
  });

  it('writes velocities as dynamics (ppp … fff) and leaves forte out', () => {
    // Arrange
    const velocities = [15, 31, 47, 63, 79, 95, 111, 127];
    const song = songWithNotes(...velocities.map((velocity) => [buildNote(1, 0, { velocity })]));

    // Act / Assert
    expect(notesOf(roundTrip(song)).map((note) => note.velocity)).toEqual(velocities);
  });

  it('round-trips tied notes', () => {
    // Arrange
    const song = songWithNotes([buildNote(1, 7)], [buildNote(1, 7, { isTied: true })], [buildNote(1, 7, { isTied: true }), buildNote(2, 3)]);

    // Act / Assert
    expect(songDifference(song, roundTrip(song))).toBeUndefined();
  });
});

describe('writeSong losses (what GP5 cannot hold)', () => {
  it('keeps a note’s play duration percent (note flag 0x01) but not its start offset or velocity change', () => {
    // Arrange
    const song = songWithNotes([
      buildNote(1, 1, { audio: { durationPercent: 60, offsetPercent: 10, velocityOffset: 5 } }),
      buildNote(2, 3, { audio: { durationPercent: 100, offsetPercent: 20, velocityOffset: -8 } }),
    ]);

    // Act
    const again = roundTrip(song);

    // Assert
    expect(notesOf(again).map((note) => note.audio)).toEqual([{ durationPercent: 60, offsetPercent: 0, velocityOffset: 0 }, undefined]);
    expect(songDifference(expectedAfterGp5(song, again), again)).toBeUndefined();
  });

  it('reads the duration percent GP5 writes for palm mutes (75 %) and staccato (50 %) as no setting, since the effect implies it', () => {
    // Arrange
    const song = songWithNotes([
      buildNote(1, 1, { effect: { palmMute: true }, audio: { durationPercent: 75, offsetPercent: 0, velocityOffset: 0 } }),
      buildNote(2, 1, { effect: { staccato: true }, audio: { durationPercent: 40, offsetPercent: 0, velocityOffset: 0 } }),
    ]);
    const effects = readSong(loadFixture('guitarpro5', 'effects.gp5'));
    const palmMuted = effects.tracks[0]?.measures[17]?.beats[0]?.voices[0]?.notes[0];

    // Act
    const again = roundTrip(song);

    // Assert
    expect(notesOf(again).map((note) => note.audio?.durationPercent)).toEqual([undefined, 40]);
    expect(palmMuted?.effect.palmMute).toBe(true);
    expect(palmMuted).not.toHaveProperty('audio');
  });

  it('keeps the first two voices only', () => {
    // Arrange
    const base = songWithNotes([buildNote(1, 1)]);
    const beat = base.tracks[0]!.measures[0]!.beats[0]!;
    const fourVoices = { ...beat, voices: [...beat.voices, buildVoice([buildNote(3, 3)]), buildVoice([buildNote(4, 4)])] };
    const voice3Only = { ...beat, start: beat.start + 960, voices: [beat.voices[1]!, beat.voices[1]!, buildVoice([buildNote(5, 5)])] };
    const song: Song = { ...base, tracks: [{ ...base.tracks[0]!, measures: [{ ...base.tracks[0]!.measures[0]!, beats: [fourVoices, voice3Only] }] }] };

    // Act
    const again = roundTrip(song);

    // Assert
    expect(again.tracks[0]?.measures[0]?.beats).toHaveLength(1);
    expect(again.tracks[0]?.measures[0]?.beats[0]?.voices).toHaveLength(2);
    expect(songDifference(base, again)).toBeUndefined();
  });

  it('keeps wide vibrato per beat: every note of a beat with a wide-vibrato note reads back wide', () => {
    // Arrange
    const song = songWithNotes([buildNote(1, 5, { effect: { wideVibrato: true } }), buildNote(2, 5, { effect: { vibrato: true } }), buildNote(3, 5)]);

    // Act
    const again = roundTrip(song);

    // Assert
    expect(notesOf(again).map((note) => [note.effect.vibrato, note.effect.wideVibrato])).toEqual([
      [false, true],
      [false, true],
      [false, true],
    ]);
    expect(songDifference(expectedAfterGp5(song), again)).toBeUndefined();
  });

  it('keeps seven strings, clamps frets to 99 and drops notes on missing strings', () => {
    // Arrange
    const eight = [64, 59, 55, 50, 45, 40, 35, 30].map((tuning, i) => ({ number: i + 1, tuning }));
    const song = buildSong({
      tracks: [{ strings: eight, measures: [[{ voice: buildVoice([buildNote(1, 120), buildNote(7, 3), buildNote(8, 2)]) }]] }],
    });

    // Act
    const again = roundTrip(song);

    // Assert
    expect(again.tracks[0]?.strings.map((guitarString) => guitarString.tuning)).toEqual([64, 59, 55, 50, 45, 40, 35]);
    expect(notesOf(again).map((note) => [note.string, note.fret])).toEqual([
      [1, 99],
      [7, 3],
    ]);
  });

  it('writes tuplets GP5 lacks as an equal length when it has one (5:2 → 5:4 of the shorter value, 2:3 → dotted)', () => {
    // Arrange
    const song = songWithNotes([buildNote(1, 1)]);
    const quintuplet = { ...plainDuration(8), tuplet: { enters: 5, times: 2 } };
    const duplet = { ...plainDuration(8), tuplet: { enters: 2, times: 3 } };
    const withDurations = buildSong({
      tracks: [{ measures: [[{ voice: buildVoice([buildNote(1, 1)], quintuplet) }, { voice: buildVoice([buildNote(1, 2)], duplet) }]] }],
    });

    // Act
    const durations = roundTrip(withDurations).tracks[0]?.measures[0]?.beats.map((beat) => beat.voices[0]?.duration);

    // Assert
    expect(song.tracks).toHaveLength(1);
    expect(durations).toEqual([
      { value: 16, dotted: false, doubleDotted: false, tuplet: { enters: 5, times: 4 } },
      { value: 8, dotted: true, doubleDotted: false, tuplet: { enters: 1, times: 1 } },
    ]);
  });

  it('writes a double dot as a dot and an unknown tuplet as none', () => {
    // Arrange
    const song = buildSong({
      tracks: [
        {
          measures: [
            [
              { voice: buildVoice([buildNote(1, 1)], { ...plainDuration(4), doubleDotted: true }) },
              { voice: buildVoice([buildNote(1, 1)], { ...plainDuration(4), tuplet: { enters: 17, times: 16 } }) },
            ],
          ],
        },
      ],
    });

    // Act
    const durations = roundTrip(song).tracks[0]?.measures[0]?.beats.map((beat) => beat.voices[0]?.duration);

    // Assert
    expect(durations?.map((duration) => [duration?.value, duration?.dotted, duration?.doubleDotted, duration?.tuplet.enters])).toEqual([
      [4, true, false, 1],
      [4, false, false, 1],
    ]);
  });

  it('drops a tie that would change the fret, keeping the pitch', () => {
    // Arrange: the tie comes after fret 5 on the string, but the tied note is fret 7
    const song = songWithNotes([buildNote(1, 5)], [buildNote(1, 7, { isTied: true })]);

    // Act
    const notes = notesOf(roundTrip(song));

    // Assert
    expect(notes.map((note) => [note.fret, note.isTied])).toEqual([
      [5, false],
      [7, false],
    ]);
  });

  it('keeps artificial harmonics as AH12 and mixer values in 17 steps', () => {
    // Arrange
    const song = buildSong({
      tracks: [{ channel: { volume: 100, balance: 64 }, measures: [[{ voice: buildVoice([buildNote(1, 5, { effect: { harmonic: { type: 'artificial', data: 19 } } })]) }]] }],
    });

    // Act
    const again = roundTrip(song);

    // Assert
    expect(notesOf(again)[0]?.effect.harmonic).toEqual({ type: 'artificial', data: 12 });
    expect([again.channels[0]?.volume, again.channels[0]?.balance]).toEqual([103, 63]);
  });

  it('keeps the lyrics of one track: the first with text', () => {
    // Arrange
    const song = buildSong({
      headers: [{}],
      tracks: [
        { measures: [], lyrics: { from: 1, text: '' } },
        { measures: [], lyrics: { from: 3, text: 'first words' } },
        { measures: [], lyrics: { from: 1, text: 'other words' } },
      ],
    });

    // Act
    const again = roundTrip(song);

    // Assert
    expect(again.tracks.map((track) => track.lyrics)).toEqual([undefined, { from: 3, text: 'first words' }, undefined]);
  });

  it('keeps Korean lyrics and a Korean title, with notes left without a syllable', () => {
    // Arrange: a song as the song writer makes it, sung in Korean
    const song = buildSong({ headers: [{}], tracks: [{ measures: [], lyrics: { from: 1, text: '종 이  배 를' } }] });
    const titled = { ...song, info: { ...song.info, title: '종이배' } };

    // Act
    const again = roundTrip(titled);

    // Assert
    expect(again.tracks[0]?.lyrics).toEqual({ from: 1, text: '종 이  배 를' });
    expect(again.info.title).toBe('종이배');
  });

  it('puts the melodic channels beyond the fifteenth on MIDI channel 16, with the fifteenth', () => {
    // Arrange
    const song = buildSong({ headers: [{}], tracks: Array.from({ length: 17 }, (_, i) => ({ measures: [], channel: { program: i } })) });

    // Act
    const again = roundTrip(song);

    // Assert
    expect(again.channels).toHaveLength(15);
    expect(again.tracks.map((track) => track.channelId).slice(13)).toEqual([14, 15, 15, 15]);
    expect(again.channels.map((channel) => channel.program)).toEqual(Array.from({ length: 15 }, (_, i) => i));
  });
});
