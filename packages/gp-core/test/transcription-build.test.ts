import { describe, expect, it } from 'vitest';
import { GP5_VERSION } from '../src/write/gp5-writer';
import {
  QUARTER_TIME,
  STANDARD_BASS_TUNING,
  STANDARD_TUNING,
  type Song,
  TranscriptionError,
  type TranscriptionPage,
  buildSongFromTranscription,
  measureTicks,
  parseTranscriptionPage,
  readSong,
  writeSong,
} from '../src/index';
import type { TranscribedBeat, TranscribedInstrument, TranscribedTrack } from '../src/transcription/types';
import { assertEditInvariants, deepFreeze, voiceLayout } from './helpers/edit-songs';
import { assertSongInvariants } from './helpers/invariants';
import { fromTux } from './helpers/ticks';
import { BASS, GUITAR, bar, page, play, rest, run, tab, written } from './helpers/transcription-pages';
import { songDifference } from './helpers/write-compare';
import { expectedAfterGp5 } from './helpers/write-expected';

function build(pages: readonly TranscriptionPage[], options?: { title?: string }) {
  const result = buildSongFromTranscription(deepFreeze(pages), options);
  assertEditInvariants(result.song);
  return result;
}

const ONE_BAR = [bar([rest('whole')])];

function tuningOf(song: Song, trackIndex = 0): number[] {
  return song.tracks[trackIndex]?.strings.map((guitarString) => guitarString.tuning) ?? [];
}

function programOf(song: Song, trackIndex = 0): number | undefined {
  return song.channels.find((channel) => channel.id === song.tracks[trackIndex]?.channelId)?.program;
}

function track(name: string, instrument: TranscribedInstrument, tuning: readonly string[] = []): TranscribedTrack {
  return { name, instrument, tuning, capo: 0 };
}

describe('buildSongFromTranscription: tracks', () => {
  it('builds a steel-string guitar track, string 1 = the last (highest) string of the tuning', () => {
    // Act
    const { song, warnings } = build([page(ONE_BAR)]);

    // Assert
    expect(song.tracks).toHaveLength(1);
    expect(song.tracks[0]).toEqual(expect.objectContaining({ number: 1, name: 'Guitar', offset: 0, isPercussion: false }));
    expect(song.tracks[0]?.strings).toEqual(STANDARD_TUNING.map((tuning, i) => ({ number: i + 1, tuning })));
    expect(programOf(song)).toBe(25);
    expect(song.tracks[0]?.measures[0]?.clef).toBe('treble');
    expect(warnings).toEqual([]);
  });

  it('builds a four-string fingered bass in the bass clef', () => {
    // Act
    const { song } = build([page(ONE_BAR, { tracks: [BASS] })]);

    // Assert
    expect(tuningOf(song)).toEqual(STANDARD_BASS_TUNING);
    expect(programOf(song)).toBe(33);
    expect(song.tracks[0]?.measures[0]?.clef).toBe('bass');
  });

  it.each([
    ['Distortion Guitar', 'guitar', 30],
    ['Distorted Electric Guitar', 'guitar', 30],
    ['Overdrive Gtr', 'guitar', 29],
    ['Crunch', 'guitar', 29],
    ['Clean Electric Guitar', 'guitar', 27],
    ['Electric Guitar', 'guitar', 27],
    ['Jazz Guitar', 'guitar', 26],
    ['Nylon String Guitar', 'guitar', 24],
    ['Classical Guitar', 'guitar', 24],
    ['Muted Guitar', 'guitar', 28],
    ['Acoustic Guitar', 'guitar', 25],
    ['Lead', 'guitar', 25],
    ['Fretless Bass', 'bass', 35],
    ['Slap Bass', 'bass', 36],
    ['Picked Bass', 'bass', 34],
    ['Acoustic Bass', 'bass', 32],
    ['Synth Bass', 'bass', 38],
    ['Bass', 'bass', 33],
  ] as const)('gives "%s" (%s) General MIDI program %i', (name, instrument, program) => {
    // Act
    const { song } = build([page(ONE_BAR, { tracks: [track(name, instrument)] })]);

    // Assert
    expect(programOf(song)).toBe(program);
  });

  it('gives every track its own channel, named after its instrument', () => {
    // Act
    const { song } = build([page(ONE_BAR, { tracks: [GUITAR, GUITAR, BASS] })]);

    // Assert
    expect(song.tracks.map((current) => current.channelId)).toEqual([1, 2, 3]);
    expect(song.channels.map((channel) => channel.name)).toEqual([
      'Steel String Acoustic Guitar 1',
      'Steel String Acoustic Guitar 2',
      'Fingered Electric Bass 1',
    ]);
  });

  it('reads the capo as the track offset', () => {
    // Act
    const { song } = build([page(ONE_BAR, { tracks: [{ ...GUITAR, capo: 3 }] })]);

    // Assert
    expect(song.tracks[0]?.offset).toBe(3);
  });

  it.each([
    ['drop D', ['D2', 'A2', 'D3', 'G3', 'B3', 'E4'], [64, 59, 55, 50, 45, 38]],
    ['7-string', ['B1', 'E2', 'A2', 'D3', 'G3', 'B3', 'E4'], [64, 59, 55, 50, 45, 40, 35]],
    ['highest string first', ['E4', 'B3', 'G3', 'D3', 'A2', 'E2'], [64, 59, 55, 50, 45, 40]],
    ['E-flat with flats', ['Eb2', 'Ab2', 'Db3', 'Gb3', 'Bb3', 'Eb4'], [63, 58, 54, 49, 44, 39]],
  ])('reads a %s tuning', (_case, tuning, strings) => {
    // Act
    const { song, warnings } = build([page(ONE_BAR, { tracks: [{ ...GUITAR, tuning }] })]);

    // Assert
    expect(tuningOf(song)).toEqual(strings);
    expect(warnings).toEqual([]);
  });

  it('uses standard tuning, without a warning, when no tuning is given', () => {
    // Act
    const { song, warnings } = build([page(ONE_BAR, { tracks: [{ ...GUITAR, tuning: [] }, { ...BASS, tuning: [] }] })]);

    // Assert
    expect(tuningOf(song, 0)).toEqual(STANDARD_TUNING);
    expect(tuningOf(song, 1)).toEqual(STANDARD_BASS_TUNING);
    expect(warnings).toEqual([]);
  });

  it('falls back to standard tuning when the tuning cannot be read or has too many strings, and says so', () => {
    // Arrange
    const tracks = [
      { ...GUITAR, tuning: ['E2', 'X'] },
      { ...BASS, tuning: ['?'] },
      { ...GUITAR, name: 'Eight', tuning: ['F#1', 'B1', 'E2', 'A2', 'D3', 'G3', 'B3', 'E4'] },
    ];

    // Act
    const { song, warnings } = build([page(ONE_BAR, { tracks })]);

    // Assert
    expect([tuningOf(song, 0), tuningOf(song, 1), tuningOf(song, 2)]).toEqual([STANDARD_TUNING, STANDARD_BASS_TUNING, STANDARD_TUNING]);
    expect(warnings).toEqual([
      'Guitar: tuning E2 X could not be read; standard tuning used',
      'Bass: tuning ? could not be read; standard tuning used',
      'Eight: tuning F#1 B1 E2 A2 D3 G3 B3 E4 could not be read; standard tuning used',
    ]);
  });

  it('takes the tracks from the first page that lists them; later pages only add tracks', () => {
    // Arrange
    const pages = [page(ONE_BAR, {}), page(ONE_BAR), page(ONE_BAR, { tracks: [{ ...GUITAR, name: 'Renamed' }, BASS] })];

    // Act
    const { song } = build(pages);

    // Assert
    expect(song.tracks.map((current) => current.name)).toEqual(['Guitar', 'Bass']);
  });

  it('names a track without a name after its number', () => {
    // Act
    const { song } = build([page(ONE_BAR, { tracks: [{ ...GUITAR, name: '' }, { ...BASS, name: '' }] })]);

    // Assert
    expect(song.tracks.map((current) => current.name)).toEqual(['Track 1', 'Track 2']);
  });

  it('assumes guitar tracks in standard tuning when no page lists tracks, and says so', () => {
    // Arrange
    const measure = { parts: [{ track: 1, beats: [play('whole', written('E4'))] }] };

    // Act
    const { song, warnings } = build([page([measure], {})]);

    // Assert
    expect(song.tracks.map((current) => current.name)).toEqual(['Track 1', 'Track 2']);
    expect(tuningOf(song, 1)).toEqual(STANDARD_TUNING);
    expect(voiceLayout(song, 1, 0, 0)).toEqual(['0:1:4/2']);
    expect(warnings).toEqual(['No track list was read: 2 guitar tracks in standard tuning assumed']);
  });

  it('assumes one guitar track for a page without tracks or parts', () => {
    // Act
    const { song, warnings } = build([page([{ parts: [] }], {})]);

    // Assert
    expect(song.tracks).toHaveLength(1);
    expect(warnings).toEqual(['No track list was read: 1 guitar track in standard tuning assumed']);
  });

  it('leaves out a part for a track no page lists, and says so', () => {
    // Arrange
    const pages = [page(ONE_BAR), page([{ parts: [{ track: 0, beats: [rest('whole')] }, { track: 2, beats: [rest('whole')] }] }], {})];

    // Act
    const { warnings } = build(pages);

    // Assert
    expect(warnings).toEqual(['Bar 2: a part for track 3 left out (no such track)']);
  });

  it('names the track in a bar warning when the song has several tracks', () => {
    // Act
    const { warnings } = build([page([{ parts: [{ track: 1, beats: run('whole', 2) }] }], { tracks: [GUITAR, BASS] })]);

    // Assert
    expect(warnings).toEqual(['Bar 1, Bass: the beats run past the end of the bar']);
  });
});

describe('buildSongFromTranscription: measure headers', () => {
  it('starts at one quarter in 4/4 at 120 bpm in C when nothing is marked', () => {
    // Act
    const { song } = build([page([bar([rest('whole')]), bar([rest('whole')])])]);

    // Assert
    expect(song.measureHeaders).toEqual([
      { number: 1, start: QUARTER_TIME, timeSignature: { numerator: 4, denominator: 4 }, tempo: 120, repeatOpen: false, repeatClose: 0, repeatAlternative: 0, tripletFeel: 'none' },
      { number: 2, start: QUARTER_TIME + fromTux(3840), timeSignature: { numerator: 4, denominator: 4 }, tempo: 120, repeatOpen: false, repeatClose: 0, repeatAlternative: 0, tripletFeel: 'none' },
    ]);
    expect(song.tracks[0]?.measures.map((measure) => measure.keySignature)).toEqual([0, 0]);
  });

  it('carries the time signature, tempo and key forward, across pages, until they change', () => {
    // Arrange
    const pages = [
      page([bar([], { timeSignature: { numerator: 3, denominator: 4 }, tempo: 90, keySignature: 2 }), bar([])], { tracks: [GUITAR, BASS] }),
      page([bar([]), bar([], { timeSignature: { numerator: 6, denominator: 8 }, keySignature: -1 }), bar([], { tempo: 140 })], {}),
    ];

    // Act
    const { song } = build(pages);

    // Assert
    const headers = song.measureHeaders;
    expect(headers.map((header) => `${header.timeSignature.numerator}/${header.timeSignature.denominator}`)).toEqual(['3/4', '3/4', '3/4', '6/8', '6/8']);
    expect(headers.map((header) => header.tempo)).toEqual([90, 90, 90, 90, 140]);
    expect(headers.map((header) => header.start)).toEqual([960, 960 + 2880, 960 + 2 * 2880, 960 + 3 * 2880].map(fromTux).concat(fromTux(960 + 3 * 2880) + measureTicks(6, 8)));
    expect(song.tracks.map((current) => current.measures.map((measure) => measure.keySignature))).toEqual([
      [2, 2, 2, -1, -1],
      [2, 2, 2, -1, -1],
    ]);
  });

  it('starts at the song tempo unless the first bar marks its own', () => {
    // Act
    const songTempo = build([page(ONE_BAR, { tracks: [GUITAR], song: { tempo: 100 } })]).song;
    const barTempo = build([page([bar([], { tempo: 80 })], { tracks: [GUITAR], song: { tempo: 100 } })]).song;

    // Assert
    expect(songTempo.measureHeaders[0]?.tempo).toBe(100);
    expect(barTempo.measureHeaders[0]?.tempo).toBe(80);
  });

  it('turns repeat signs and endings into repeat counts and ending bits', () => {
    // Arrange
    const measures = [
      bar([], { repeatOpen: true }),
      bar([], { alternateEnding: 1, repeatClose: 2 }),
      bar([], { alternateEnding: 2 }),
      bar([], { repeatOpen: true }),
      bar([], { repeatClose: 3 }),
      bar([], { repeatOpen: true }),
      bar([], { repeatClose: 1 }),
    ];

    // Act
    const { song } = build([page(measures)]);

    // Assert
    expect(song.measureHeaders.map(({ repeatOpen, repeatClose, repeatAlternative }) => [repeatOpen, repeatClose, repeatAlternative])).toEqual([
      [true, 0, 0],
      [false, 1, 1],
      [false, 0, 2],
      [true, 0, 0],
      [false, 2, 0],
      [true, 0, 0],
      [false, 1, 0],
    ]);
  });

  it('keeps the previous time signature and tempo when a page that skipped parsing has invalid ones', () => {
    // Arrange
    const measures = [bar([], { timeSignature: { numerator: 3, denominator: 4 } }), bar([], { timeSignature: { numerator: 4, denominator: 3 }, tempo: -5 })];

    // Act
    const { song } = build([page(measures)]);

    // Assert
    expect(song.measureHeaders[1]?.timeSignature).toEqual({ numerator: 3, denominator: 4 });
    expect(song.measureHeaders[1]?.tempo).toBe(120);
  });
});

describe('buildSongFromTranscription: song', () => {
  it('takes the title and artist from the first page that has them', () => {
    // Arrange
    const pages = [page(ONE_BAR, { tracks: [GUITAR], song: { artist: 'Band' } }), page(ONE_BAR, { song: { title: 'Song', artist: 'Other' } })];

    // Act
    const { song } = build(pages, { title: 'file name' });

    // Assert
    expect(song.info).toEqual(expect.objectContaining({ title: 'Song', artist: 'Band', album: '' }));
  });

  it('falls back to the title option, else no title', () => {
    // Act
    const named = build([page(ONE_BAR)], { title: 'Score.pdf' }).song;
    const unnamed = build([page(ONE_BAR)]).song;

    // Assert
    expect(named.info.title).toBe('Score.pdf');
    expect(unnamed.info.title).toBe('');
  });

  it('is a GP5 song, so it can be saved as one', () => {
    // Act
    const { song } = build([page(ONE_BAR)]);

    // Assert
    expect(song.source).toEqual({ format: 'gp5', version: GP5_VERSION });
  });

  it('lists the pages’ warnings, by page, before its own', () => {
    // Arrange
    const pages = [page([bar([play('whole', tab(1, 0), tab(1, 2))])], { tracks: [GUITAR], warnings: ['Bar 1 is smudged'] }), page(ONE_BAR, { warnings: ['Last bar cut off', 'Lyrics left out'] })];

    // Act
    const { warnings } = build(pages);

    // Assert
    expect(warnings).toEqual(['Page 1: Bar 1 is smudged', 'Page 2: Last bar cut off', 'Page 2: Lyrics left out', 'Bar 1: 1 note left out (no free string)']);
  });

  it.each([[[]], [[page([])]]])('throws a TranscriptionError when there are no measures', (pages) => {
    // Act / Assert
    expect(() => buildSongFromTranscription(pages)).toThrow(TranscriptionError);
    expect(() => buildSongFromTranscription(pages)).toThrow('No measures were transcribed');
  });
});

describe('buildSongFromTranscription: saving', () => {
  /** Page 1: tab guitar and a bass from notation, a repeat with two endings; page 2: a tempo, meter and key change. */
  const PAGES: readonly TranscriptionPage[] = [
    page(
      [
        { keySignature: 1, repeatOpen: true, parts: [{ track: 0, beats: run('eighth', 8, 2) }, { track: 1, beats: [play('whole', written('E2'))] }] },
        {
          alternateEnding: 1,
          repeatClose: 2,
          parts: [
            { track: 0, beats: [...[0, 1, 2].map((fret): TranscribedBeat => ({ duration: 'quarter', tuplet: 3, notes: [tab(3, fret, { effects: ['hammer'] })] })), play('half', tab(5, 3), tab(4, 2), tab(3, 0))] },
            { track: 1, beats: [play('half', written('A2')), play('half', written('A2', { tied: true }))] },
          ],
        },
      ],
      { song: { title: 'Round Trip', artist: 'Tester', tempo: 100 }, tracks: [GUITAR, BASS] },
    ),
    page([
      { alternateEnding: 2, tempo: 132, parts: [{ track: 0, beats: [play('whole', tab(2, 7, { effects: ['bend', 'vibrato'] }))] }] },
      {
        timeSignature: { numerator: 3, denominator: 4 },
        keySignature: -2,
        parts: [
          { track: 0, beats: [play('quarter', tab(2, 7, { tied: true })), { duration: 'eighth', dots: 1, notes: [tab(3, 12, { effects: ['harmonic'] })] }, play('16th', written('A4', { effects: ['slide'] })), rest('quarter')] },
          { track: 1, beats: [{ duration: 'half', dots: 1, notes: [written('E2', { effects: ['palmMute', 'letRing'] })] }] },
        ],
      },
    ], {}),
  ];

  it('builds a song that passes the reader invariants', () => {
    // Act
    const { song, warnings } = build(PAGES);

    // Assert
    assertSongInvariants(song);
    expect(song.measureHeaders).toHaveLength(4);
    expect(warnings).toEqual([]);
  });

  it('reads back from GP5 with everything it holds', () => {
    // Arrange
    const { song } = build(PAGES);

    // Act
    const again = readSong(writeSong(song, 'gp5'));

    // Assert
    assertSongInvariants(again);
    expect(songDifference(expectedAfterGp5(song, again), again)).toBeUndefined();
  });

  it('builds the same song from pages read with parseTranscriptionPage', () => {
    // Act
    const parsed = PAGES.map((current) => parseTranscriptionPage(JSON.parse(JSON.stringify(current))));

    // Assert
    expect(buildSongFromTranscription(parsed)).toEqual(buildSongFromTranscription(PAGES));
  });
});
