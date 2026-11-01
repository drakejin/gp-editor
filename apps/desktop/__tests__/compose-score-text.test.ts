import {
  type Song,
  type TranscribedBeat,
  type TranscribedMeasure,
  type TranscribedTrack,
  buildSongFromTranscription,
  readSong,
} from '@gp-editor/core';
import { NOTATION_LEGEND } from '../src/compose/score-notation';
import { SCORE_TEXT_BUDGET, describeScore } from '../src/compose/score-text';
import { readFixture } from '../test-support/fixtures';

const GUITAR: TranscribedTrack = {
  name: 'Lead',
  instrument: 'guitar',
  tuning: [],
  capo: 0,
};
const DRUMS: TranscribedTrack = {
  name: 'Kit',
  instrument: 'drums',
  tuning: [],
  capo: 0,
};
const PIANO: TranscribedTrack = {
  name: 'Piano',
  instrument: 'keys',
  tuning: [],
  capo: 0,
};

const hit = (
  duration: TranscribedBeat['duration'],
  ...drums: string[]
): TranscribedBeat => ({ duration, notes: drums.map(drum => ({ drum })) });
const fret = (
  duration: TranscribedBeat['duration'],
  string: number,
  value: number,
  extra: Partial<TranscribedBeat> = {},
): TranscribedBeat => ({
  duration,
  notes: [{ string, fret: value }],
  ...extra,
});

function songOf(
  tracks: readonly TranscribedTrack[],
  measures: readonly TranscribedMeasure[],
): Song {
  return buildSongFromTranscription([{ tracks, measures }]).song;
}

/** The lines of the score text after the legend. */
function body(song: Song, startIndex = 0, budget?: number): readonly string[] {
  return describeScore(song, startIndex, budget)
    .text.split('\n')
    .slice(NOTATION_LEGEND.split('\n').length);
}

describe('describeScore', () => {
  it('writes every bar: a heading with its meter, tempo and key, then a line per track that plays, tab with written pitch, drum keys', () => {
    // Arrange
    const song = songOf(
      [GUITAR, DRUMS],
      [
        {
          tempo: 96,
          keySignature: 1,
          parts: [
            { track: 0, beats: [fret('half', 6, 0), fret('half', 5, 2)] },
            {
              track: 1,
              beats: [hit('whole', 'Bass Drum 1', 'Crash Cymbal 1')],
            },
          ],
        },
        { parts: [{ track: 1, beats: [hit('whole', 'Acoustic Snare')] }] },
        { parts: [] },
      ],
    );

    // Act
    const lines = body(song);

    // Assert
    expect(lines).toEqual([
      'Bar 1 4/4 ♩=96 key 1#',
      '0: h:E3@6/0 h:B3@5/2',
      '1: w:36+49',
      'Bar 2',
      '1: w:38',
      'Bar 3 (all rest)',
    ]);
  });

  it('writes runs, repeated notes, ties, effects, dots and tuplets as the legend says', () => {
    // Arrange
    const beats: TranscribedBeat[] = [
      {
        duration: 'eighth',
        notes: [{ string: 6, fret: 0, effects: ['palmMute'] }],
      },
      {
        duration: 'eighth',
        notes: [{ string: 6, fret: 0, effects: ['palmMute'] }],
      },
      {
        duration: 'quarter',
        notes: [{ string: 6, fret: 0, effects: ['palmMute'] }],
      },
      {
        duration: 'eighth',
        tuplet: 3,
        notes: [{ string: 3, fret: 5, effects: ['hammer', 'vibrato'] }],
      },
      {
        duration: 'eighth',
        tuplet: 3,
        notes: [{ string: 3, fret: 5, tied: true }],
      },
      { duration: 'eighth', tuplet: 3, rest: true },
      { duration: 'eighth', dots: 1, rest: true },
      { duration: '16th', rest: true },
    ];

    // Act
    const lines = body(songOf([GUITAR], [{ parts: [{ track: 0, beats }] }]));

    // Assert
    expect(lines[1]).toBe(
      '0: 2*e:E3@6/0[pm] q:= e/3:C5@3/5[h,v] e/3:~C5@3/5 e/3:r e.:r s:r',
    );
  });

  it('writes a keyboard’s sounding pitches, flats in a key with flats, and a second voice', () => {
    // Arrange
    const measure: TranscribedMeasure = {
      keySignature: -2,
      parts: [
        {
          track: 0,
          beats: [
            { duration: 'whole', notes: [{ pitch: 'Bb4' }, { pitch: 'D5' }] },
          ],
        },
        { track: 0, beats: [{ duration: 'whole', notes: [{ pitch: 'Bb2' }] }] },
      ],
    };

    // Act
    const lines = body(songOf([PIANO], [measure]));

    // Assert
    expect(lines[1]).toBe('0: v1: w:Bb4+D5 | v2: w:Bb2');
  });

  it('writes a track playing what it played in an earlier bar as a reference to that bar', () => {
    // Arrange
    const groove = {
      track: 0,
      beats: [
        hit('quarter', 'Bass Drum 1'),
        hit('quarter', 'Acoustic Snare'),
        hit('half', 'Bass Drum 1'),
      ],
    };
    const song = songOf(
      [DRUMS],
      [
        { parts: [groove] },
        { parts: [{ track: 0, beats: [hit('whole', 'Crash Cymbal 1')] }] },
        { parts: [groove] },
      ],
    );

    // Act / Assert
    expect(body(song)).toEqual([
      'Bar 1 4/4 ♩=120 key 0',
      '0: q:36 q:38 h:36',
      'Bar 2',
      '0: w:49',
      'Bar 3',
      '0: =1',
    ]);
  });

  it('heads a bar with what changes there: meter, tempo, key, its section, repeats and endings', () => {
    // Arrange
    const song = songOf(
      [GUITAR],
      [
        { repeatOpen: true, parts: [] },
        {
          timeSignature: { numerator: 3, denominator: 4 },
          tempo: 140,
          repeatClose: 2,
          alternateEnding: 1,
          parts: [],
        },
      ],
    );
    const marked: Song = {
      ...song,
      measureHeaders: song.measureHeaders.map((header, index) =>
        index === 1
          ? {
              ...header,
              marker: { title: 'Chorus', color: { r: 0, g: 0, b: 0 } },
            }
          : header,
      ),
    };

    // Act / Assert
    expect(body(marked)).toEqual([
      'Bar 1 4/4 ♩=120 key 0 |: (all rest)',
      'Bar 2 3/4 ♩=140 [Chorus] :|x2 ending 1 (all rest)',
    ]);
  });

  it('adds the syllables sung in a bar and a beat’s chord name', () => {
    // Arrange
    const song = songOf(
      [{ ...PIANO, name: 'Voice', instrument: 'vocals' }],
      [
        {
          lyrics: ['Hel-', 'lo'],
          parts: [
            {
              track: 0,
              beats: [
                { duration: 'half', notes: [{ pitch: 'C4' }] },
                { duration: 'half', notes: [{ pitch: 'D4' }] },
              ],
            },
          ],
        },
      ],
    );
    const track = song.tracks[0];
    const chorded: Song =
      track === undefined
        ? song
        : {
            ...song,
            tracks: [
              {
                ...track,
                measures: track.measures.map(measure => ({
                  ...measure,
                  beats: measure.beats.map((beat, index) =>
                    index === 0
                      ? {
                          ...beat,
                          chord: { name: 'C', firstFret: 0, frets: [] },
                        }
                      : beat,
                  ),
                })),
              },
            ],
          };

    // Act / Assert
    expect(body(chorded)[1]).toBe('0: {C}h:C4 h:D4 / lyrics: Hel- lo');
  });
});

/** The song's bars `times` over, its tracks `copies` over (bars shared: the score text reads only the beats). */
function repeated(song: Song, times: number, copies: number): Song {
  const count = song.measureHeaders.length * times;
  const headers = Array.from({ length: count }, (_, index) => ({ ...(song.measureHeaders[index % song.measureHeaders.length] as Song['measureHeaders'][number]), number: index + 1 }));
  const tracks = Array.from({ length: copies }, () => song.tracks)
    .flat()
    .map((track, index) => ({ ...track, number: index + 1, measures: Array.from({ length: count }, (_, bar) => track.measures[bar % track.measures.length] as Song['tracks'][number]['measures'][number]) }));
  return { ...song, measureHeaders: headers, tracks };
}

describe('describeScore on real scores', () => {
  const canon = readSong(readFixture('guitarpro8', 'canon-audio-track.gp'));

  it('writes the 224-bar, 9-track GP8 score whole within the budget', () => {
    // Act
    const score = describeScore(canon, 112);

    // Assert
    expect(score.isSummarized).toBe(false);
    expect(score.text.length).toBeLessThanOrEqual(SCORE_TEXT_BUDGET);
    expect(
      score.text.split('\n').filter(line => line.startsWith('Bar ')),
    ).toHaveLength(224);
  });

  it('over budget, writes out the bars around the start bar — two before for each one after — and summarises the rest', () => {
    // Act
    const score = describeScore(canon, 112, 12000);
    const lines = score.text.split('\n');
    const summaries = lines.filter(line => line.startsWith('Bars '));
    const summarised = summaries.flatMap(line => {
      const [first, last] = (/^Bars (\d+)-(\d+)/.exec(line) ?? [])
        .slice(1)
        .map(Number);
      return first === undefined || last === undefined
        ? []
        : Array.from(
            { length: last - first + 1 },
            (_, offset) => first + offset,
          );
    });

    // Assert
    expect(score.isSummarized).toBe(true);
    expect(score.text.length).toBeLessThanOrEqual(12000);
    expect(score.detailFirst).toBeLessThan(112);
    expect(score.detailLast).toBeGreaterThan(112);
    expect(112 - score.detailFirst).toBeGreaterThanOrEqual(
      score.detailLast - 112,
    );
    expect(lines.filter(line => /^Bar \d+/.test(line))).toHaveLength(
      score.detailLast - score.detailFirst + 1,
    );
    expect(
      [
        ...summarised,
        ...Array.from(
          { length: score.detailLast - score.detailFirst + 1 },
          (_, offset) => score.detailFirst + offset + 1,
        ),
      ].sort((a, b) => a - b),
    ).toEqual(Array.from({ length: 224 }, (_, index) => index + 1));
    expect(summaries[0]).toMatch(
      /^Bars 1-8 4\/4 ♩=90 key 0: 1: \d+\.\d notes\/bar, mostly h, D2-D3; 2: /,
    );
  });

  it('keeps to the budget on a long, wide score, writing out at least the start bar and the two bars before it', () => {
    // Arrange: 1,120 bars of 18 tracks.
    const wide = repeated(canon, 5, 2);

    // Act
    const score = describeScore(wide, 600);

    // Assert
    expect(score.isSummarized).toBe(true);
    expect(score.text.length).toBeLessThanOrEqual(SCORE_TEXT_BUDGET);
    expect(score.detailFirst).toBeLessThanOrEqual(598);
    expect(score.detailLast).toBeGreaterThanOrEqual(600);
  });

  it('writes a long score in time (a few hundred milliseconds, not seconds)', () => {
    // Arrange: 2,464 bars of one track.
    const long = repeated({ ...canon, tracks: canon.tracks.slice(3, 4) }, 11, 1);
    const started = Date.now();

    // Act
    const score = describeScore(long, 1200);

    // Assert
    expect(Date.now() - started).toBeLessThan(3000);
    expect(score.text.length).toBeLessThanOrEqual(SCORE_TEXT_BUDGET);
  });

  it('writes out a whole range of bars it is asked to, however few bars before them fit', () => {
    // Act: bars 100–130 (0-based 99–129) on a budget that would write out far fewer after bar 100.
    const score = describeScore(canon, 99, 12000, 129);

    // Assert
    expect(score.detailFirst).toBeLessThanOrEqual(97);
    expect(score.detailLast).toBeGreaterThanOrEqual(129);
    expect(score.text.length).toBeLessThanOrEqual(12000);
  });

  it('starting past the end, writes out the last bars', () => {
    const score = describeScore(canon, 224, 6000);
    expect(score.detailLast).toBe(223);
    expect(score.isSummarized).toBe(true);
  });
});
