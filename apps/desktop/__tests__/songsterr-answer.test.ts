import { MAX_ANSWER_LENGTH, MAX_SONGS, MAX_TEXT_LENGTH, MAX_TRACKS, parseSongsterrBody, parseSongsterrSongs } from '../src/songsterr/songsterr-answer';

/** Two songs as Songsterr's search answered on 2026-10-30 (fields cut down; drums have no tuning). */
const ANSWER = [
  {
    songId: 444,
    artistId: 20,
    artist: 'Metallica',
    title: 'One',
    hasChords: true,
    hasPlayer: true,
    defaultTrack: 5,
    tracks: [
      {
        instrumentId: 66,
        instrument: 'Tenor Sax',
        views: 4991,
        name: 'James Hetfield | Lead Vocals',
        tuning: [64, 59, 55, 50, 45, 40],
        hash: 'vocals_ms0nkTF8',
      },
      {
        instrumentId: 30,
        instrument: 'Distortion Guitar',
        views: 1109462,
        name: 'Kirk Hammett | Lead Guitar',
        tuning: [64, 59, 55, 50, 45, 40],
        difficulty: 4,
        hash: 'guitar_3zcYro2q',
      },
      {
        instrumentId: 34,
        instrument: 'Electric Bass (pick)',
        views: 167289,
        name: 'Jason Newsted | Bass',
        tuning: [43, 38, 33, 28],
        difficulty: 3,
        hash: 'bass_x',
      },
      {
        instrumentId: 1024,
        instrument: 'Drums',
        views: 117871,
        name: 'Lars Ulrich | Drums',
        difficulty: 3,
        hash: 'drums_x',
      },
    ],
  },
  {
    songId: 508886,
    artistId: 20,
    artist: 'Metallica',
    title: 'One (Solo Bass Arrangement)',
    tracks: [
      {
        instrumentId: 34,
        instrument: 'Electric Bass (pick)',
        views: 8633,
        name: '',
        tuning: [43, 38, 33, 28],
      },
    ],
  },
];

describe('parseSongsterrSongs', () => {
  it('reads each song’s id, title, artist and tracks', () => {
    // Act
    const answer = parseSongsterrSongs(ANSWER);

    // Assert
    expect(answer).toEqual({
      kind: 'songs',
      songs: [
        {
          songId: 444,
          title: 'One',
          artist: 'Metallica',
          tracks: [
            {
              instrumentId: 66,
              instrument: 'Tenor Sax',
              name: 'James Hetfield | Lead Vocals',
              views: 4991,
              tuning: [64, 59, 55, 50, 45, 40],
            },
            {
              instrumentId: 30,
              instrument: 'Distortion Guitar',
              name: 'Kirk Hammett | Lead Guitar',
              views: 1109462,
              tuning: [64, 59, 55, 50, 45, 40],
            },
            {
              instrumentId: 34,
              instrument: 'Electric Bass (pick)',
              name: 'Jason Newsted | Bass',
              views: 167289,
              tuning: [43, 38, 33, 28],
            },
            {
              instrumentId: 1024,
              instrument: 'Drums',
              name: 'Lars Ulrich | Drums',
              views: 117871,
              tuning: undefined,
            },
          ],
        },
        {
          songId: 508886,
          title: 'One (Solo Bass Arrangement)',
          artist: 'Metallica',
          tracks: [
            {
              instrumentId: 34,
              instrument: 'Electric Bass (pick)',
              name: '',
              views: 8633,
              tuning: [43, 38, 33, 28],
            },
          ],
        },
      ],
    });
  });

  it('reads an empty list as no songs found', () => {
    expect(parseSongsterrSongs([])).toEqual({ kind: 'songs', songs: [] });
  });

  it('calls anything but a list of songs unexpected', () => {
    for (const value of [undefined, null, 42, 'songs', { songs: ANSWER }, [null, 1, 'x', []], [{ title: 'No id' }]]) {
      expect(parseSongsterrSongs(value)).toEqual({ kind: 'unexpected' });
    }
  });

  it('drops the songs it cannot read and keeps the others', () => {
    // Arrange
    const odd = [
      { songId: -1, title: 'Negative id' },
      { songId: 1.5, title: 'Fractional id' },
      { songId: '445', title: 'Id as text' },
      { songId: 2 ** 40, title: 'Id too large' },
      { songId: 7, title: '   ' },
      { songId: 8, title: 42 },
      { songId: 9, title: 'Kept', artist: ['not', 'text'], tracks: 'none' },
    ];

    // Act
    const answer = parseSongsterrSongs(odd);

    // Assert
    expect(answer).toEqual({
      kind: 'songs',
      songs: [{ songId: 9, title: 'Kept', artist: '', tracks: [] }],
    });
  });

  it('reads only a song’s own properties, never its prototype’s', () => {
    // Arrange
    const inherited = Object.create({
      songId: 1,
      title: 'From the prototype',
    }) as object;
    const polluted = JSON.parse('[{"songId": 3, "title": "Own", "__proto__": {"artist": "Injected", "tracks": [{"name": "x"}]}}]') as unknown;

    // Act / Assert
    expect(parseSongsterrSongs([inherited])).toEqual({ kind: 'unexpected' });
    expect(parseSongsterrSongs(polluted)).toEqual({
      kind: 'songs',
      songs: [{ songId: 3, title: 'Own', artist: '', tracks: [] }],
    });
    expect(({} as { artist?: unknown }).artist).toBeUndefined();
  });

  it('keeps a track’s odd fields out: views, instrument and tuning only when they are what they should be', () => {
    // Arrange
    const tracks = [
      {
        instrumentId: -3,
        instrument: 7,
        views: -10,
        name: null,
        tuning: [64, 'x'],
      },
      { instrumentId: 2.5, views: Number.POSITIVE_INFINITY, tuning: [] },
      {
        instrumentId: 25,
        views: 12.9,
        tuning: [64, 59, 55, 50, 45, 40, 35, 30, 25, 20, 15, 10, 5],
      },
      { instrumentId: 25, views: 3, tuning: [128, 59] },
      'not a track',
      null,
    ];

    // Act
    const answer = parseSongsterrSongs([{ songId: 1, title: 'Odd tracks', tracks }]);

    // Assert
    expect(answer).toEqual({
      kind: 'songs',
      songs: [
        {
          songId: 1,
          title: 'Odd tracks',
          artist: '',
          tracks: [
            {
              instrumentId: undefined,
              instrument: '',
              name: '',
              views: 0,
              tuning: undefined,
            },
            {
              instrumentId: undefined,
              instrument: '',
              name: '',
              views: 0,
              tuning: undefined,
            },
            {
              instrumentId: 25,
              instrument: '',
              name: '',
              views: 12,
              tuning: undefined,
            },
            {
              instrumentId: 25,
              instrument: '',
              name: '',
              views: 3,
              tuning: undefined,
            },
          ],
        },
      ],
    });
  });

  it('cleans the texts it shows: no control or direction characters, one space, cut short', () => {
    // Arrange
    const song = {
      songId: 5,
      title: 'Evil\u202E\u0000 title\n\n  two',
      artist: 'A'.repeat(MAX_TEXT_LENGTH + 50),
      tracks: [{ name: '\u0007Lead\tGuitar ', instrument: ' Guitar\u2067' }],
    };

    // Act
    const answer = parseSongsterrSongs([song]);

    // Assert
    expect(answer.kind === 'songs' ? answer.songs[0] : undefined).toEqual({
      songId: 5,
      title: 'Evil title two',
      artist: `${'A'.repeat(MAX_TEXT_LENGTH - 1)}…`,
      tracks: [
        {
          instrumentId: undefined,
          instrument: 'Guitar',
          name: 'Lead Guitar',
          views: 0,
          tuning: undefined,
        },
      ],
    });
  });

  it('reads at most MAX_SONGS songs and MAX_TRACKS tracks a song', () => {
    // Arrange
    const tracks = Array.from({ length: MAX_TRACKS + 30 }, (_, index) => ({
      name: `T${index}`,
      views: index,
    }));
    const songs = Array.from({ length: MAX_SONGS + 1000 }, (_, index) => ({
      songId: index + 1,
      title: `Song ${index + 1}`,
      tracks,
    }));

    // Act
    const answer = parseSongsterrSongs(songs);

    // Assert
    expect(answer.kind).toBe('songs');
    const read = answer.kind === 'songs' ? answer.songs : [];
    expect(read).toHaveLength(MAX_SONGS);
    expect(read[0]?.tracks).toHaveLength(MAX_TRACKS);
  });

  it('reads each song once when an id comes twice', () => {
    expect(parseSongsterrSongs([ANSWER[1], ANSWER[1]])).toEqual(parseSongsterrSongs([ANSWER[1]]));
  });
});

describe('parseSongsterrBody', () => {
  it('reads the answer’s JSON text', () => {
    expect(parseSongsterrBody(JSON.stringify(ANSWER))).toEqual(parseSongsterrSongs(ANSWER));
  });

  it('calls text that is not JSON, or is too long, unexpected without reading it', () => {
    // Arrange
    const huge = `[${'{"songId":1,"title":"x"},'.repeat(MAX_ANSWER_LENGTH / 20)}{"songId":2,"title":"y"}]`;

    // Act / Assert
    expect(parseSongsterrBody('<html>Too many requests</html>')).toEqual({
      kind: 'unexpected',
    });
    expect(parseSongsterrBody('')).toEqual({ kind: 'unexpected' });
    expect(huge.length).toBeGreaterThan(MAX_ANSWER_LENGTH);
    expect(parseSongsterrBody(huge)).toEqual({ kind: 'unexpected' });
  });
});
