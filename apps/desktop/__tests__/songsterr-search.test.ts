import ReactTestRenderer from 'react-test-renderer';
import { setLanguage } from '../src/lib/i18n/i18n';
import { type SearchFailure, type SongsterrTransport, SEARCH_TIMEOUT_MS, failureMessage, searchSongsterr } from '../src/songsterr/songsterr-search';

afterEach(() => {
  jest.useRealTimers();
  ReactTestRenderer.act(() => setLanguage('en'));
});

const ONE = [{ songId: 444, artist: 'Metallica', title: 'One', tracks: [] }];

/** A transport answering `status` and `body`, keeping the URLs and signals it was asked with. */
function answering(status: number, body: string) {
  const calls: { url: string; signal: AbortSignal }[] = [];
  const transport: SongsterrTransport = (url, signal) => {
    calls.push({ url, signal });
    return Promise.resolve({ status, body });
  };
  return { transport, calls };
}

/** A transport failing as `error`. */
const failing =
  (error: unknown): SongsterrTransport =>
  () =>
    Promise.reject(error);

describe('searchSongsterr', () => {
  it('asks Songsterr once and reads the songs it found', async () => {
    // Arrange
    const { transport, calls } = answering(200, JSON.stringify(ONE));

    // Act
    const outcome = await searchSongsterr('metallica one', transport);

    // Assert
    expect(calls.map((call) => call.url)).toEqual(['https://www.songsterr.com/api/songs?pattern=metallica%20one&size=20']);
    expect(outcome).toEqual({
      kind: 'found',
      query: 'metallica one',
      songs: [{ songId: 444, title: 'One', artist: 'Metallica', tracks: [] }],
    });
  });

  it('says when nothing was found', async () => {
    expect(await searchSongsterr('zzqx', answering(200, '[]').transport)).toEqual({ kind: 'empty', query: 'zzqx' });
  });

  it('asks nothing for a blank query', async () => {
    // Arrange
    const { transport, calls } = answering(200, '[]');

    // Act / Assert
    expect(await searchSongsterr('   ', transport)).toEqual({ kind: 'blank' });
    expect(calls).toEqual([]);
  });

  it('tells a busy server, an HTTP error and an answer of another shape apart', async () => {
    expect(await searchSongsterr('one', answering(429, 'slow down').transport)).toEqual({ kind: 'failed', query: 'one', failure: { reason: 'busy' } });
    expect(await searchSongsterr('one', answering(503, '').transport)).toEqual({
      kind: 'failed',
      query: 'one',
      failure: { reason: 'http', status: 503 },
    });
    expect(await searchSongsterr('one', answering(200, '{"error":"moved"}').transport)).toEqual({
      kind: 'failed',
      query: 'one',
      failure: { reason: 'unexpected' },
    });
  });

  it('reads a failed request as offline, and the desktop-only and timeout codes as they are', async () => {
    expect(await searchSongsterr('one', failing(new TypeError('Network request failed')))).toEqual({ kind: 'failed', query: 'one', failure: { reason: 'offline' } });
    expect(await searchSongsterr('one', failing(Object.assign(new Error('x'), { code: 'unavailable' })))).toEqual({
      kind: 'failed',
      query: 'one',
      failure: { reason: 'unavailable' },
    });
    expect(await searchSongsterr('one', failing(Object.assign(new Error('x'), { code: 'timeout' })))).toEqual({ kind: 'failed', query: 'one', failure: { reason: 'timeout' } });
  });

  it('gives up after SEARCH_TIMEOUT_MS and cancels the request', async () => {
    // Arrange
    jest.useFakeTimers();
    let signal: AbortSignal | undefined;
    const never: SongsterrTransport = (_url, requestSignal) => {
      signal = requestSignal;
      return new Promise(() => undefined);
    };

    // Act
    const pending = searchSongsterr('one', never);
    jest.advanceTimersByTime(SEARCH_TIMEOUT_MS);
    const outcome = await pending;

    // Assert
    expect(outcome).toEqual({
      kind: 'failed',
      query: 'one',
      failure: { reason: 'timeout' },
    });
    expect(signal?.aborted).toBe(true);
  });

  it('cancels nothing once the answer is in', async () => {
    // Arrange
    const { transport, calls } = answering(200, '[]');

    // Act
    await searchSongsterr('one', transport);

    // Assert
    expect(calls[0]?.signal.aborted).toBe(false);
  });
});

describe('failureMessage', () => {
  const FAILURES: readonly SearchFailure[] = [{ reason: 'offline' }, { reason: 'timeout' }, { reason: 'busy' }, { reason: 'http', status: 503 }, { reason: 'unexpected' }, { reason: 'unavailable' }];

  it('says what went wrong in its own words for each failure, in English and Korean', () => {
    for (const language of ['en', 'ko'] as const) {
      // Arrange
      ReactTestRenderer.act(() => setLanguage(language));

      // Act
      const messages = FAILURES.map(failureMessage);

      // Assert
      expect(new Set(messages).size).toBe(FAILURES.length);
      expect(messages.every((message) => message.trim().length > 0)).toBe(true);
    }
    expect(failureMessage({ reason: 'http', status: 503 })).toContain('503');
  });
});
