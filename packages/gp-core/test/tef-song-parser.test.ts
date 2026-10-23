import { describe, expect, it } from 'vitest';
import { GpFormatError, UnexpectedEndOfFileError, readSong } from '../src';
import type { Beat, NoteEffect, Song } from '../src/model/song';
import { assertSongInvariants } from './helpers/invariants';
import {
  type TefNoteSpec,
  type TefSongSpec,
  buildTef,
  tefChord,
  tefEnding,
  tefGraceMetadata,
  tefNote,
  tefRest,
  tefTempo,
  tefText,
} from './helpers/tef-builder';

const AT = { measure: 0, position: 0, string: 0 } as const;

function readTef(spec: TefSongSpec): Song {
  const song = readSong(buildTef(spec));
  assertSongInvariants(song);
  return song;
}

function beatsOf(song: Song, track = 0, measure = 0): readonly Beat[] {
  return song.tracks[track]?.measures[measure]?.beats ?? [];
}

function offsetsOf(song: Song, track = 0, measure = 0): number[] {
  const start = song.measureHeaders[measure]?.start ?? 0;
  return beatsOf(song, track, measure).map((beat) => beat.start - start);
}

function effectOf(note: Partial<TefNoteSpec>): NoteEffect | undefined {
  const song = readTef({ components: [tefNote({ at: AT, fret: 3, ...note })] });
  return beatsOf(song)[0]?.voices[0]?.notes[0]?.effect;
}

describe('TablEdit song texts and header values', () => {
  it('reads the title, author, comments, copyright, text events and lyrics, skipping the URL and the reading list', () => {
    // Act
    const song = readTef({
      title: 'Reel',
      author: 'Trad.',
      comments: 'Line one\r\nLine two',
      notes: 'not kept',
      url: 'https://example.org',
      copyright: 'Public domain',
      textEvents: ['Intro'],
      lyrics: '>A f3 +0 c0 n0\r\nla la\r\nlo>B f3 -2\r\nbass words',
      tracks: [{}, { tuning: [43, 38, 33, 28], program: 33 }],
      readingList: [[1, 1]],
      components: [tefText(AT, 0)],
    });

    // Assert
    expect(song.info).toMatchObject({ title: 'Reel', words: 'Trad.', music: 'Trad.', copyright: 'Public domain', notice: ['Line one', 'Line two'] });
    expect(song.tracks.map((track) => track.lyrics)).toEqual([
      { from: 1, text: 'la la\nlo' },
      { from: 1, text: 'bass words' },
    ]);
    expect(beatsOf(song)[0]?.text).toBe('Intro');
  });

  it('gives lyrics without a track letter to the first track', () => {
    expect(readTef({ lyrics: '>\r\nwords' }).tracks[0]?.lyrics?.text).toBe('words');
  });

  it('plays at 120 when the file says 0, and keeps the tones within MIDI values', () => {
    // Act
    const song = readTef({ header: { bpm: 0, chorus: 1, reverb: 0 } });

    // Assert
    expect(song.measureHeaders[0]?.tempo).toBe(120);
    expect(song.channels[0]).toMatchObject({ chorus: 127, reverb: 0 });
  });

  it('gives a file without measures one 4/4 measure', () => {
    expect(readTef({ measures: [] }).measureHeaders.map((header) => header.timeSignature)).toEqual([{ numerator: 4, denominator: 4 }]);
  });

  it('keeps key signatures from 7 flats to 7 sharps and leaves others at 0', () => {
    expect(readTef({ measures: [{ key: -7 }, { key: 7 }, { key: 9 }] }).tracks[0]?.measures.map((measure) => measure.keySignature)).toEqual([-7, 7, 0]);
  });
});

describe('TablEdit tracks', () => {
  it('reads the track’s sound from TablEdit’s 0–15 pan and volume (volume 0 is the loudest; high bits ignored)', () => {
    // Act
    const song = readTef({ tracks: [{ pan: 0x70, volume: 15, name: 'Quiet left' }, { pan: 15, volume: 0x75 }] });

    // Assert
    expect(song.channels.map((channel) => [channel.balance, channel.volume])).toEqual([
      [0, 0],
      [127, 84],
    ]);
    expect(song.tracks[0]?.name).toBe('Quiet left');
  });

  it.each([
    [1, 'treble'],
    [2, 'bass'],
    [4, 'tenor'],
    [5, 'alto'],
    [0, 'treble'],
    [7, 'treble'],
  ])('maps clef %i to %s', (clef, expected) => {
    expect(readTef({ tracks: [{ clef }] }).tracks[0]?.measures[0]?.clef).toBe(expected);
  });

  it('makes program 96 a drum track: percussion channel, strings at 0, frets moved to drum notes', () => {
    // Act
    const song = readTef({
      tracks: [{ program: 96, tuning: [60, 60, 60, 60, 60, 60] }, { program: 96, tuning: [60, 60] }],
      components: [tefNote({ at: { ...AT, string: 1 }, fret: 0 }), tefNote({ at: { ...AT, track: 1, string: 1 }, fret: 38 })],
    });

    // Assert
    expect(song.channels.map((channel) => [channel.isPercussion, channel.bank, channel.program])).toEqual([
      [true, 128, 0],
      [true, 128, 0],
    ]);
    expect(song.tracks.map((track) => track.isPercussion)).toEqual([true, true]);
    expect(song.tracks[0]?.strings.every((s) => s.tuning === 0)).toBe(true);
    expect([0, 1].map((track) => beatsOf(song, track)[0]?.voices[0]?.notes[0]?.fret)).toEqual([51, 38]);
  });

  it.each<[string, TefSongSpec, string]>([
    ['no track', { tracks: [] }, 'A TablEdit file needs at least one track'],
    ['a track record too small', { trackRecordSize: 20 }, 'A TablEdit file needs at least one track'],
    ['a track without strings', { firstTrackStringCount: 0 }, 'A TablEdit track has 0 strings'],
    ['a track with 13 strings', { firstTrackStringCount: 13 }, 'A TablEdit track has 13 strings'],
    ['a measure record too small', { measureRecordSize: 6 }, 'TablEdit measure records of 6 bytes are too small'],
    ['a chord record too small', { chords: [{ name: 'C', frets: [] }], chordRecordSize: 20 }, 'TablEdit chord records of 20 bytes are too small'],
  ])('rejects %s', (_name, spec, message) => {
    expect(() => readSong(buildTef(spec))).toThrow(message);
  });

  it('rejects records that do not fit in the file, and components without an end marker', () => {
    // Arrange
    const bytes = buildTef({ measures: [{}, {}] });
    const truncated = bytes.subarray(0, 256 + 16);

    // Act and assert
    expect(() => readSong(truncated)).toThrow(GpFormatError);
    expect(() => readSong(buildTef({ hasNoEndMarker: true }))).toThrow(UnexpectedEndOfFileError);
  });
});

describe('TablEdit notes and effects', () => {
  it.each<[number, Partial<NoteEffect>]>([
    [1, { hammer: true }],
    [2, { hammer: true }],
    [3, { slides: ['shift'] }],
    [6, { harmonic: { type: 'natural', data: 0 } }],
    [7, { harmonic: { type: 'artificial', data: 12 } }],
    [8, { palmMute: true }],
    [9, { tapping: true }],
    [10, { vibrato: true }],
    [11, { tremoloPicking: { duration: { value: 4, dotted: false, doubleDotted: false, tuplet: { enters: 1, times: 1 } } } }],
    [15, { deadNote: true }],
  ])('reads effect %i of the first slot', (effect1, expected) => {
    expect(effectOf({ effect1 })).toMatchObject(expected);
  });

  it('reads the bend and bend-release curves', () => {
    expect(effectOf({ effect1: 12 })?.bend?.points.map((point) => point.value)).toEqual([0, 2, 2]);
    expect(effectOf({ effect1: 13 })?.bend?.points.map((point) => point.value)).toEqual([0, 2, 2, 0, 0]);
  });

  it.each<[number, Partial<NoteEffect>]>([
    [1, { letRing: true }],
    [2, { slapping: true }],
    [4, { ghostNote: true }],
    [7, { staccato: true }],
    [8, { fadeIn: true }],
  ])('reads effect %i of the second slot', (effect2, expected) => {
    expect(effectOf({ effect2 })).toMatchObject(expected);
  });

  it.each<[number, Partial<NoteEffect>]>([
    [1, { hammer: true }],
    [2, { hammer: true }],
    [6, { harmonic: { type: 'natural', data: 0 } }],
    [7, { harmonic: { type: 'artificial', data: 12 } }],
    [8, { letRing: true }],
    [9, { ghostNote: true }],
    [10, { deadNote: true }],
  ])('reads effect %i of the third slot', (effect3, expected) => {
    expect(effectOf({ effect3 })).toMatchObject(expected);
  });

  it('leaves effects without a place in the model out', () => {
    // Act
    const effect = effectOf({ effect1: 14, effect2: 3, effect3: 11 });

    // Assert
    expect(effect).toMatchObject({ hammer: false, letRing: false });
    expect(effect?.harmonic).toBeUndefined();
  });

  it('marks a tie by its flag or by the ppp dynamic', () => {
    // Act
    const song = readTef({
      components: [tefNote({ at: AT, fret: 1, isTied: true }), tefNote({ at: { ...AT, position: 16 }, fret: 1, dynamics: 7 })],
    });

    // Assert
    expect(beatsOf(song).map((beat) => beat.voices[0]?.notes[0]?.isTied)).toEqual([true, true]);
  });

  it('reads a grace note and the grace metadata that follows it on its string', () => {
    // Act
    const song = readTef({
      components: [
        tefNote({ at: AT, fret: 3, grace: { fret: 2, effect: 2 }, dynamics: 0 }),
        tefGraceMetadata(AT, 2, 40),
        tefNote({ at: { ...AT, position: 16, string: 1 }, fret: 3 }),
        tefGraceMetadata({ ...AT, position: 16, string: 1 }, 5),
        tefNote({ at: { ...AT, position: 32, string: 2 }, fret: 3, grace: { fret: 1, effect: 4 } }),
        tefGraceMetadata({ ...AT, position: 32, string: 2 }, 1),
        tefGraceMetadata({ ...AT, position: 32, string: 5 }, 2),
        { at: { ...AT, position: 48 }, type: 0x7d, data: [0, 0, 0, 9] },
      ],
    });

    // Assert
    const graces = beatsOf(song).map((beat) => beat.voices[0]?.notes[0]?.effect.grace);
    expect(graces).toEqual([
      { fret: 40, duration: 2, velocity: 127, transition: 'slide', onBeat: false, isDead: false },
      { fret: 0, duration: 3, velocity: 95, transition: 'none', onBeat: false, isDead: false },
      { fret: 1, duration: 1, velocity: 95, transition: 'none', onBeat: false, isDead: false },
    ]);
  });

  it('turns an up or down stroke on a note into a sixteenth stroke on its beat', () => {
    // Act
    const song = readTef({ components: [tefNote({ at: AT, fret: 0, stroke: 3 }), tefNote({ at: { ...AT, position: 16 }, fret: 0, stroke: 4 })] });

    // Assert
    expect(beatsOf(song).map((beat) => beat.stroke)).toEqual([
      { direction: 'up', value: 16 },
      { direction: 'down', value: 16 },
    ]);
  });

  it('reads frets from 31 up from the type’s sixth bit', () => {
    // Act
    const song = readTef({ components: [tefNote({ at: AT, fret: 40 })] });

    // Assert
    expect(beatsOf(song)[0]?.voices[0]?.notes[0]?.fret).toBe(40);
  });
});

describe('TablEdit chords, texts, tempos and endings', () => {
  it('puts a chord on its beat, and moves one without notes under it to the note before', () => {
    // Act
    const song = readTef({
      chords: [{ name: 'G', frets: [3, 0, 0, 0, 2, 3, 0] }, { name: 'C', frets: [0, 1, 0, 2, 3] }],
      components: [tefNote({ at: AT, fret: 3, duration: 3 }), tefChord(AT, 0), tefChord({ ...AT, position: 16 }, 1), tefChord({ ...AT, position: 32 }, 5)],
    });

    // Assert
    expect(beatsOf(song).map((beat) => beat.chord?.name)).toEqual(['G']);
    expect(beatsOf(song)[0]?.chord?.frets).toEqual([3, 0, 0, 0, 2, 3]);
  });

  it('moves a text without notes under it to the note before', () => {
    // Act
    const song = readTef({ textEvents: ['Here'], components: [tefNote({ at: AT, fret: 3, duration: 3 }), tefText({ ...AT, position: 16 }, 0)] });

    // Assert
    expect(beatsOf(song).map((beat) => beat.text)).toEqual(['Here']);
  });

  it('changes the tempo from a measure to the end, ignoring a tempo of 0', () => {
    // Act
    const song = readTef({ measures: [{}, {}, {}], components: [tefTempo({ ...AT, measure: 1 }, 90), tefTempo({ ...AT, measure: 2 }, 0)] });

    // Assert
    expect(song.measureHeaders.map((header) => header.tempo)).toEqual([120, 90, 90]);
  });

  it('reads repeat brackets and alternate endings', () => {
    // Act
    const song = readTef({
      measures: [{}, {}, {}, {}],
      components: [
        tefEnding(AT, 0, true),
        tefEnding({ ...AT, measure: 1 }, 3, false, true),
        tefEnding({ ...AT, measure: 2 }, 2),
        tefEnding({ ...AT, measure: 3 }, 1, false, true),
      ],
    });

    // Assert
    expect(song.measureHeaders.map((header) => [header.repeatOpen, header.repeatClose, header.repeatAlternative])).toEqual([
      [true, 0, 0],
      [false, 2, 0],
      [false, 0, 2],
      [false, 0, 1],
    ]);
  });
});

describe('TablEdit beats in their measure', () => {
  it('shortens a note that runs into the next one or past the measure', () => {
    // Act
    const song = readTef({ components: [tefNote({ at: AT, fret: 0, duration: 0 }), tefNote({ at: { ...AT, position: 32 }, fret: 0, duration: 0 })] });

    // Assert
    expect(beatsOf(song).map((beat) => beat.voices[0]?.duration.value)).toEqual([2, 2]);
  });

  it('drops a rest that overlaps the beat before it or runs past the measure', () => {
    // Act
    const song = readTef({
      components: [tefNote({ at: AT, fret: 0, duration: 3 }), tefRest({ ...AT, position: 16 }, 6), tefRest({ ...AT, position: 48 }, 3)],
    });

    // Assert
    expect(offsetsOf(song)).toEqual([0]);
  });

  it('puts a lower-voice rest and notes in the second voice, and keeps notes where a rest is written', () => {
    // Act
    const song = readTef({
      components: [
        tefNote({ at: AT, fret: 0, duration: 3, attributes: 3 }),
        tefNote({ at: { ...AT, string: 1 }, fret: 2, duration: 3, attributes: 2 }),
        tefRest(AT, 6),
        tefRest({ ...AT, position: 32 }, 3, true),
      ],
    });

    // Assert
    const beats = beatsOf(song);
    expect(beats.map((beat) => beat.voices.map((voice) => (voice.isEmpty ? '-' : `${voice.duration.value}:${voice.notes.length}`)))).toEqual([
      ['2:1', '2:1'],
      ['-', '2:0'],
    ]);
  });

  it('places a run of triplets from where it starts, and a chord in the run at its note', () => {
    // Act
    const song = readTef({
      chords: [{ name: 'Am', frets: [0, 1, 2, 2, 0, 0, 0] }],
      components: [
        tefNote({ at: { ...AT, position: 8 }, fret: 0, duration: 11 }),
        tefNote({ at: { ...AT, position: 8, string: 1 }, fret: 1, duration: 11 }),
        tefNote({ at: { ...AT, position: 12 }, fret: 0, duration: 11 }),
        tefChord({ ...AT, position: 12, string: 3 }, 0),
        tefNote({ at: { ...AT, position: 16 }, fret: 0, duration: 11 }),
        tefNote({ at: { ...AT, position: 24 }, fret: 0, duration: 11 }),
      ],
    });

    // Assert
    expect(offsetsOf(song)).toEqual([0, 480, 800, 1120, 1440]);
    expect(beatsOf(song)[2]?.chord?.name).toBe('Am');
  });

  it('skips components outside the score, unused component types and unknown ones', () => {
    // Act
    const song = readTef({
      components: [
        { at: AT, location: -8, type: 0x01, data: [0x06] },
        { at: AT, location: 64 * 6 * 8, type: 0x01, data: [0x06] },
        { at: AT, type: 0x36, data: [] },
        { at: AT, type: 0x3a, data: [] },
        { at: AT, type: 0x00, data: [] },
        tefNote({ at: { ...AT, position: 16 }, fret: 2 }),
      ],
    });

    // Assert
    expect(offsetsOf(song)).toEqual([0, 960]);
    expect(beatsOf(song).flatMap((beat) => beat.voices[0]?.notes.map((note) => note.fret) ?? [])).toEqual([2]);
  });

  it('reads the dotted, double-dotted and filler durations', () => {
    // Act
    const song = readTef({
      measures: [{ numerator: 12, denominator: 1 }],
      components: [19, 22, 25, 28, 20, 21, 31, 7].map((duration, index) => tefNote({ at: { ...AT, position: index * 96 }, fret: 0, duration })),
    });

    // Assert
    const notes = beatsOf(song).filter((beat) => (beat.voices[0]?.notes.length ?? 0) > 0);
    expect(notes.map((beat) => beat.voices[0]?.duration)).toEqual(
      [
        [2, false, true],
        [4, false, true],
        [8, false, true],
        [16, false, true],
        [16, false, false],
        [64, false, false],
        [1, true, false],
        [8, true, false],
      ].map(([value, dotted, doubleDotted]) => ({ value, dotted, doubleDotted, tuplet: { enters: 1, times: 1 } })),
    );
  });
});
