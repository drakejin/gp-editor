import { MAX_QUERY_LENGTH, SEARCH_RESULT_COUNT, SONGSTERR_TERMS_URL, normalizeQuery, searchUrl, songPageUrl, songQueryOf } from '../src/songsterr/songsterr-urls';
import { makeSong } from '../test-support/songs';

describe('normalizeQuery', () => {
  it('trims the text and keeps one space between words', () => {
    expect(normalizeQuery('  metallica \n\t one  ')).toBe('metallica one');
  });

  it('drops control characters and direction overrides', () => {
    expect(normalizeQuery('one\u0000\u0007 two\u202E\u2066three')).toBe('one twothree');
  });

  it('drops zero-width characters and writes a lone surrogate as U+FFFD, which a URL can carry', () => {
    expect(normalizeQuery('a\u200B\u200D\u2060\uFEFF\u061Cb')).toBe('ab');
    expect(normalizeQuery('a\uD800b')).toBe('a\uFFFDb');
    expect(searchUrl('a\uDC00')).toBe('https://www.songsterr.com/api/songs?pattern=a%EF%BF%BD&size=20');
  });

  it('keeps at most MAX_QUERY_LENGTH characters, counting a character outside the BMP once', () => {
    // Arrange
    const long = '🎸'.repeat(MAX_QUERY_LENGTH + 20);

    // Act
    const query = normalizeQuery(long);

    // Assert
    expect(Array.from(query)).toHaveLength(MAX_QUERY_LENGTH);
    expect(query.startsWith('🎸')).toBe(true);
  });
});

describe('searchUrl', () => {
  it('asks Songsterr’s site search for the text, its words encoded, SEARCH_RESULT_COUNT songs', () => {
    expect(searchUrl('AC/DC Back in Black')).toBe(`https://www.songsterr.com/api/songs?pattern=AC%2FDC%20Back%20in%20Black&size=${SEARCH_RESULT_COUNT}`);
  });

  it('encodes what would end the query or start another parameter', () => {
    expect(searchUrl('a&size=999#x?y=1 한글')).toBe('https://www.songsterr.com/api/songs?pattern=a%26size%3D999%23x%3Fy%3D1%20%ED%95%9C%EA%B8%80&size=20');
  });

  it('asks for nothing when the text is blank', () => {
    expect(searchUrl('  \n ')).toBeUndefined();
  });

  it('caps the text it sends', () => {
    // Act
    const url = searchUrl('x'.repeat(500)) ?? '';

    // Assert
    expect(url).toBe(`https://www.songsterr.com/api/songs?pattern=${'x'.repeat(MAX_QUERY_LENGTH)}&size=20`);
  });

  it('asks for a whole number of songs between 1 and 50', () => {
    expect(searchUrl('one', 0)).toMatch(/&size=1$/);
    expect(searchUrl('one', 7.6)).toMatch(/&size=7$/);
    expect(searchUrl('one', 1000)).toMatch(/&size=50$/);
    expect(searchUrl('one', Number.NaN)).toMatch(/&size=20$/);
  });
});

describe('songPageUrl', () => {
  it('opens the song by its id, which Songsterr redirects to the song’s tab page', () => {
    expect(songPageUrl(444)).toBe('https://www.songsterr.com/a/wa/song?id=444');
  });

  it('refuses an id that is not a positive whole number', () => {
    expect(() => songPageUrl(0)).toThrow();
    expect(() => songPageUrl(1.5)).toThrow();
    expect(() => songPageUrl(Number.NaN)).toThrow();
  });

  it('links the terms on Songsterr’s own site', () => {
    expect(SONGSTERR_TERMS_URL).toBe('https://www.songsterr.com/terms');
  });
});

describe('songQueryOf', () => {
  it('searches for the open song by its title and artist', () => {
    // Arrange
    const base = makeSong([]);
    const song = {
      ...base,
      info: { ...base.info, title: ' One ', artist: 'Metallica' },
    };

    // Act / Assert
    expect(songQueryOf(song)).toBe('One Metallica');
  });

  it('leaves out a missing title or artist (a new song has neither), and has nothing without a song', () => {
    const base = makeSong([]);

    expect(
      songQueryOf({
        ...base,
        info: { ...base.info, title: '', artist: 'Metallica' },
      }),
    ).toBe('Metallica');
    expect(
      songQueryOf({
        ...base,
        info: { ...base.info, title: 'One', artist: '' },
      }),
    ).toBe('One');
    expect(songQueryOf(undefined)).toBe('');
  });
});
