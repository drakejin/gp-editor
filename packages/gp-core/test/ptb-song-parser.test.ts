import { describe, expect, it } from 'vitest';
import { readSong } from '../src';
import type { Beat, Note, Song } from '../src/model/song';
import { assertSongInvariants } from './helpers/invariants';
import { type PtbBarSpec, type PtbBeatSpec, type PtbScoreSpec, type PtbSectionSpec, buildPtb } from './helpers/ptb-builder';

const NOTE = { string: 1, fret: 5 } as const;
const GUITAR_IN = { section: 0, staff: 0, position: 0, guitars: 1 } as const;

/** A guitar score with one guitar named "Lead" and a Guitar In for its first staff. */
function guitarScore(sections: readonly PtbSectionSpec[], extra: Partial<PtbScoreSpec> = {}): PtbScoreSpec {
  return { guitars: [{ number: 0, name: 'Lead' }], guitarIns: [GUITAR_IN], sections, ...extra };
}

/** One section, one staff, the given beats in its first voice. */
function readBeats(beats: readonly PtbBeatSpec[], bars: readonly PtbBarSpec[] = [], startBar?: PtbBarSpec): Song {
  const song = readSong(buildPtb({ guitarScore: guitarScore([{ bars, staffs: [{ voices: [beats] }], ...(startBar ? { startBar } : {}) }]) }));
  assertSongInvariants(song);
  return song;
}

function beatsOf(song: Song, track = 0, measure = 0): readonly Beat[] {
  return song.tracks[track]?.measures[measure]?.beats ?? [];
}

function notesOf(song: Song, beat = 0, track = 0, measure = 0): readonly Note[] {
  return beatsOf(song, track, measure)[beat]?.voices[0]?.notes ?? [];
}

describe('Power Tab beats', () => {
  it('lays a voice’s beats end to end from the first measure', () => {
    // Act
    const song = readBeats([
      { position: 0, duration: 8, notes: [NOTE] },
      { position: 1, duration: 4, isDotted: true, notes: [NOTE] },
      { position: 2, duration: 8, tuplet: [3, 2], hasBeamingFlag: true, notes: [NOTE] },
      { position: 3, duration: 2, isDoubleDotted: true, notes: [NOTE] },
    ]);

    // Assert
    const beats = beatsOf(song);
    expect(beats.map((beat) => beat.start)).toEqual([960, 1440, 2880, 3200]);
    expect(beats.map((beat) => beat.voices[0]?.duration)).toEqual([
      { value: 8, dotted: false, doubleDotted: false, tuplet: { enters: 1, times: 1 } },
      { value: 4, dotted: true, doubleDotted: false, tuplet: { enters: 1, times: 1 } },
      { value: 8, dotted: false, doubleDotted: false, tuplet: { enters: 3, times: 2 } },
      { value: 2, dotted: false, doubleDotted: true, tuplet: { enters: 1, times: 1 } },
    ]);
    // The last beat runs past the measure, which needs no second measure.
    expect(song.measureHeaders).toHaveLength(1);
  });

  it('reads the notes: string, fret, tie, dead note and slide', () => {
    // Act
    const song = readBeats([
      { position: 0, notes: [{ string: 2, fret: 7, isTied: true }, { string: 6, fret: 0, isDead: true, hasSlide: true }] },
    ]);

    // Assert
    const [tied, dead] = notesOf(song);
    expect(tied).toMatchObject({ string: 2, fret: 7, isTied: true, velocity: 95 });
    expect(dead?.effect).toMatchObject({ deadNote: true, slides: ['shift'] });
  });

  it.each([
    [1, [[0, 0], [6, 4], [12, 4]]],
    [2, [[0, 0], [3, 4], [6, 4], [9, 0], [12, 0]]],
    [3, [[0, 0], [6, 4], [12, 4]]],
    [4, [[0, 4], [12, 4]]],
    [5, [[0, 4], [4, 4], [8, 0], [12, 0]]],
    [6, [[0, 8], [12, 8]]],
    [7, [[0, 4], [4, 4], [8, 0], [12, 0]]],
    [8, [[0, 4], [4, 4], [8, 0], [12, 0]]],
  ])('gives bend type %i its curve', (bend, points) => {
    // Act
    const song = readBeats([{ position: 0, notes: [{ ...NOTE, bend }] }]);

    // Assert
    expect(notesOf(song)[0]?.effect.bend?.points.map((point) => [point.position, point.value])).toEqual(points);
  });

  it('keeps only the last of a note’s symbols, as TuxGuitar does', () => {
    // Act
    const song = readBeats([{ position: 0, notes: [{ ...NOTE, bend: 1, hasSlide: true }] }]);

    // Assert
    expect(notesOf(song)[0]?.effect.bend).toBeUndefined();
    expect(notesOf(song)[0]?.effect.slides).toEqual(['shift']);
  });

  it('drops a note on a string the guitar does not have, leaving a rest', () => {
    // Act
    const song = readBeats([{ position: 0, notes: [{ string: 7, fret: 3 }] }]);

    // Assert
    expect(beatsOf(song)[0]?.voices[0]).toMatchObject({ isEmpty: false, notes: [] });
  });

  it('turns vibrato and wide vibrato into vibrato, and arpeggios into strokes', () => {
    // Act
    const song = readBeats([
      { position: 0, isVibrato: true, isArpeggioUp: true, notes: [NOTE] },
      { position: 1, isWideVibrato: true, isArpeggioDown: true, notes: [NOTE] },
    ]);

    // Assert
    expect([0, 1].map((beat) => notesOf(song, beat)[0]?.effect.vibrato)).toEqual([true, true]);
    expect(beatsOf(song).map((beat) => beat.stroke)).toEqual([
      { direction: 'down', value: 16 },
      { direction: 'up', value: 16 },
    ]);
  });

  it('leaves grace notes out without taking time', () => {
    // Act
    const song = readBeats([
      { position: 0, duration: 16, isGrace: true, notes: [NOTE] },
      { position: 1, notes: [NOTE] },
    ]);

    // Assert
    expect(beatsOf(song).map((beat) => beat.start)).toEqual([960]);
  });

  it('skips the bars of a multi-bar rest', () => {
    // Act
    const song = readBeats([{ position: 0, duration: 1, multiBarRest: 3 }, { position: 2, notes: [NOTE] }], [{ position: 1 }]);

    // Assert
    expect(song.measureHeaders).toHaveLength(4);
    expect(song.tracks[0]?.measures.map((measure) => measure.beats.length)).toEqual([0, 0, 0, 1]);
    expect(beatsOf(song, 0, 3)[0]?.start).toBe(960 + 3 * 3840);
  });

  it('lets a rest that starts a bar last no longer than the bar', () => {
    // Act
    const song = readBeats([{ position: 0, duration: 1 }, { position: 1, notes: [NOTE] }], [], { position: 0, numerator: 3, denominator: 4 });

    // Assert
    expect(beatsOf(song, 0, 1)[0]?.start).toBe(960 + 2880);
  });

  it('puts a staff’s two voices on shared beats', () => {
    // Act
    const song = readSong(
      buildPtb({
        guitarScore: guitarScore([
          { staffs: [{ voices: [[{ position: 0, duration: 2, notes: [NOTE] }], [{ position: 0, notes: [{ string: 6, fret: 0 }] }, { position: 1, notes: [{ string: 6, fret: 2 }] }]] }] },
        ]),
      }),
    );

    // Assert
    const beats = beatsOf(song);
    expect(beats.map((beat) => beat.start)).toEqual([960, 1920]);
    expect(beats[0]?.voices.map((voice) => [voice.isEmpty, voice.duration.value])).toEqual([[false, 2], [false, 4]]);
    expect(beats[1]?.voices.map((voice) => voice.isEmpty)).toEqual([true, false]);
  });
});

describe('Power Tab bars and measures', () => {
  it('gives the measures the time signature of their bars (TuxGuitar keeps 4/4)', () => {
    // Act
    const song = readBeats(
      [{ position: 0, duration: 2, isDotted: true, notes: [NOTE] }, { position: 2, duration: 2, isDotted: true, notes: [NOTE] }, { position: 4, notes: [NOTE] }],
      [{ position: 1, numerator: 3, denominator: 4 }, { position: 3, numerator: 2, denominator: 4 }],
      { position: 0, numerator: 3, denominator: 4 },
    );

    // Assert
    expect(song.measureHeaders.map((header) => [header.timeSignature.numerator, header.timeSignature.denominator, header.start])).toEqual([
      [3, 4, 960],
      [3, 4, 3840],
      [2, 4, 6720],
    ]);
  });

  it('ignores a time signature whose meter byte is negative, and keeps the measure of one in 128ths', () => {
    // Act
    const song = readBeats(
      [{ position: 0, duration: 1, notes: [NOTE] }, { position: 2, notes: [NOTE] }],
      [{ position: 1, meterByte: 7 }],
      { position: 0, meterByte: 0x80 },
    );

    // Assert
    expect(song.measureHeaders.map((header) => `${header.timeSignature.numerator}/${header.timeSignature.denominator}`)).toEqual(['4/4', '4/4']);
    expect(beatsOf(song, 0, 1)[0]?.start).toBe(960 + 3840);
  });

  it('plays a repeat out: the repeated bar is written twice', () => {
    // Act
    const song = readSong(
      buildPtb({
        guitarScore: guitarScore([
          { startBar: { position: 0, isRepeatStart: true }, staffs: [{ voices: [[{ position: 0, duration: 1, notes: [NOTE] }]] }], endRepeatClose: 2 },
        ]),
      }),
    );

    // Assert
    expect(song.measureHeaders).toHaveLength(2);
    expect(song.measureHeaders.every((header) => !header.repeatOpen && header.repeatClose === 0)).toBe(true);
    expect(song.tracks[0]?.measures.map((measure) => measure.beats.length)).toEqual([1, 1]);
  });

  it('starts the bass score on the same timeline as the guitar score, with its own tracks after the guitars', () => {
    // Arrange
    const bass: PtbScoreSpec = {
      guitars: [{ number: 0, name: 'Bass', instrument: 33, tuning: [43, 38, 33, 28] }],
      guitarIns: [GUITAR_IN],
      sections: [{ staffs: [{ voices: [[{ position: 0, duration: 1, notes: [{ string: 4, fret: 3 }] }]] }] }],
    };

    // Act
    const song = readSong(buildPtb({ guitarScore: guitarScore([{ staffs: [{ voices: [[{ position: 0, duration: 1, notes: [NOTE] }]] }] }]), bassScore: bass }));

    // Assert
    expect(song.tracks.map((track) => [track.name, track.measures[0]?.clef, track.measures[0]?.beats[0]?.start])).toEqual([
      ['Lead', 'treble', 960],
      ['Bass', 'bass', 960],
    ]);
  });
});

describe('Power Tab guitars and Guitar Ins', () => {
  it('gives a track the guitar’s name, sound and tuning, kept within MIDI values', () => {
    // Act
    const song = readSong(
      buildPtb({
        guitarScore: guitarScore([{ staffs: [{ voices: [[{ position: 0, notes: [NOTE] }]] }] }], {
          guitars: [{ number: 0, name: 'Loud', instrument: 200, volume: 130, balance: 255, tuning: [200, 60, 55] }],
        }),
      }),
    );

    // Assert
    expect(song.tracks[0]?.name).toBe('Loud');
    expect(song.tracks[0]?.strings.map((s) => s.tuning)).toEqual([127, 60, 55]);
    expect(song.channels[0]).toMatchObject({ program: 127, volume: 127, balance: 127, name: 'Gunshot 1' });
  });

  it('gives a staff no Guitar In names the score’s lowest-numbered guitar', () => {
    // Act
    const song = readSong(
      buildPtb({
        guitarScore: {
          guitars: [{ number: 2, name: 'Second' }, { number: 1, name: 'First' }],
          sections: [{ staffs: [{ voices: [[{ position: 0, notes: [NOTE] }]] }] }],
        },
      }),
    );

    // Assert
    expect(song.tracks.map((track) => track.name)).toEqual(['First']);
  });

  it('gives a second staff without a Guitar In its own track', () => {
    // Act
    const song = readSong(
      buildPtb({
        guitarScore: guitarScore([{ staffs: [{ voices: [[{ position: 0, notes: [NOTE] }]] }, { voices: [[{ position: 0, notes: [NOTE] }]] }] }]),
      }),
    );

    // Assert
    expect(song.tracks.map((track) => track.name)).toEqual(['Lead', 'Lead']);
    expect(song.channels.map((channel) => channel.id)).toEqual([1, 2]);
  });

  it('plays a later section with the guitar a Guitar In names, reusing an idle track with the same settings', () => {
    // Arrange
    const section = (fret: number): PtbSectionSpec => ({ staffs: [{ voices: [[{ position: 0, duration: 1, notes: [{ string: 1, fret }] }]] }] });
    const score = guitarScore([section(1), section(2), section(3)], {
      guitars: [{ number: 0, name: 'Clean' }, { number: 1, name: 'Dirty', instrument: 30 }],
      guitarIns: [GUITAR_IN, { section: 1, staff: 0, position: 0, guitars: 2 }, { section: 2, staff: 0, position: 0, guitars: 1 }],
    });

    // Act
    const song = readSong(buildPtb({ guitarScore: score }));

    // Assert
    expect(song.tracks.map((track) => track.name)).toEqual(['Clean', 'Dirty']);
    expect(song.tracks.map((track) => track.measures.map((measure) => measure.beats.length))).toEqual([
      [1, 0, 1],
      [0, 1, 0],
    ]);
  });

  it('ignores a Guitar In that names no guitar of the score', () => {
    // Act
    const song = readSong(
      buildPtb({ guitarScore: guitarScore([{ staffs: [{ voices: [[{ position: 0, notes: [NOTE] }]] }] }], { guitarIns: [{ ...GUITAR_IN, guitars: 8 }] }) }),
    );

    // Assert
    expect(song.tracks.map((track) => track.name)).toEqual(['Lead']);
  });

  it('gives a file without guitars one track with a standard guitar', () => {
    // Act
    const song = readSong(buildPtb());

    // Assert
    expect(song.tracks).toHaveLength(1);
    expect(song.tracks[0]?.strings.map((s) => s.tuning)).toEqual([64, 59, 55, 50, 45, 40]);
    expect(song.measureHeaders).toHaveLength(1);
  });
});

describe('Power Tab tempo markers', () => {
  it('sets the tempo and triplet feel of the measure the score has reached; later measures keep them', () => {
    // Arrange
    const sections: PtbSectionSpec[] = [0, 1, 2].map(() => ({ staffs: [{ voices: [[{ position: 0, duration: 1, notes: [NOTE] }]] }] }));
    const tempos = [
      { section: 0, position: 0, tempo: 90, tripletFeel: 1 },
      { section: 1, position: 0, tempo: 140, tripletFeel: 2 },
      { section: 2, position: 0, tempo: 0 },
    ];

    // Act
    const song = readSong(buildPtb({ guitarScore: guitarScore(sections, { tempos }) }));

    // Assert
    expect(song.measureHeaders.map((header) => [header.tempo, header.tripletFeel])).toEqual([
      [90, 'eighth'],
      [140, 'sixteenth'],
      [140, 'sixteenth'],
    ]);
  });

  it('creates the first track from the default guitar when a tempo marker comes before any Guitar In', () => {
    // Act
    const song = readSong(
      buildPtb({
        guitarScore: guitarScore([{ staffs: [{ voices: [[{ position: 1, notes: [NOTE] }]] }] }], {
          guitarIns: [{ ...GUITAR_IN, position: 1 }],
          tempos: [{ section: 0, position: 0, tempo: 100 }],
        }),
      }),
    );

    // Assert
    expect(song.measureHeaders[0]?.tempo).toBe(100);
    expect(song.tracks[0]?.name).toBe('Lead');
  });

  it('gives a measure a tempo marker opened just before a bar line the bar’s time signature', () => {
    // Act
    const song = readSong(
      buildPtb({
        guitarScore: guitarScore([{ startBar: { position: 0, numerator: 6, denominator: 8 }, staffs: [{ voices: [[{ position: 0, notes: [NOTE] }]] }] }], {
          tempos: [{ section: 0, position: 0, tempo: 100 }],
        }),
      }),
    );

    // Assert
    expect(song.measureHeaders[0]).toMatchObject({ tempo: 100, timeSignature: { numerator: 6, denominator: 8 } });
  });
});
