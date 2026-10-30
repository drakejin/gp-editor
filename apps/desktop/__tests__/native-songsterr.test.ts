// A module of its own (no imports): its mocks stay out of the other bridge tests' scope.
export {};

const mockOpenURL = jest.fn((_url: string) => Promise.resolve(true));
jest.mock('react-native', () => ({
  Linking: { openURL: (url: string) => mockOpenURL(url) },
}));

const { fetchSongsterr, openSongsterrPage } = require('../src/native/songsterr') as typeof import('../src/native/songsterr');

const SEARCH = 'https://www.songsterr.com/api/songs?pattern=one&size=20';

afterEach(() => {
  mockOpenURL.mockClear();
  delete (globalThis as { fetch?: unknown }).fetch;
});

describe('fetchSongsterr (macOS)', () => {
  it('GETs the search as JSON without cookies, with the caller’s signal, and hands back the status and text', async () => {
    // Arrange
    const fetch = jest.fn((_url: string, _init: unknown) => Promise.resolve({ status: 200, text: () => Promise.resolve('[]') }));
    (globalThis as { fetch?: unknown }).fetch = fetch;
    const signal = new AbortController().signal;

    // Act
    const answer = await fetchSongsterr(SEARCH, signal);

    // Assert
    expect(answer).toEqual({ status: 200, body: '[]' });
    expect(fetch).toHaveBeenCalledWith(SEARCH, {
      headers: { Accept: 'application/json' },
      credentials: 'omit',
      signal,
    });
  });

  it('asks nothing outside Songsterr’s site', async () => {
    // Arrange
    const fetch = jest.fn();
    (globalThis as { fetch?: unknown }).fetch = fetch;

    // Act / Assert
    await expect(fetchSongsterr('https://www.songsterr.com.evil.example/api/songs', new AbortController().signal)).rejects.toThrow();
    await expect(fetchSongsterr('http://www.songsterr.com/api/songs', new AbortController().signal)).rejects.toThrow();
    expect(fetch).not.toHaveBeenCalled();
  });
});

describe('openSongsterrPage (macOS)', () => {
  it('opens a page of Songsterr’s site in the default browser, and nothing else', async () => {
    // Act
    await openSongsterrPage('https://www.songsterr.com/a/wa/song?id=444');

    // Assert
    expect(mockOpenURL.mock.calls).toEqual([['https://www.songsterr.com/a/wa/song?id=444']]);
    await expect(openSongsterrPage('file:///etc/passwd')).rejects.toThrow();
    expect(mockOpenURL).toHaveBeenCalledTimes(1);
  });
});
