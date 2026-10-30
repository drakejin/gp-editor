import ReactTestRenderer from 'react-test-renderer';
import type { Song } from '@gp-editor/core';
import { SEARCH_DEBOUNCE_MS, type SongsterrSearch, type SongsterrSearchOptions, useSongsterr } from '../src/hooks/use-songsterr';
import type { SongsterrHttpAnswer, SongsterrTransport } from '../src/songsterr/songsterr-search';
import { makeSong } from '../test-support/songs';

jest.mock('../src/native/songsterr', () => ({
  fetchSongsterr: jest.fn(),
  openSongsterrPage: jest.fn(),
}));

const SONG: Song = (() => {
  const base = makeSong([]);
  return { ...base, info: { ...base.info, title: 'One', artist: 'Metallica' } };
})();

const ANSWER = JSON.stringify([{ songId: 444, title: 'One', artist: 'Metallica', tracks: [] }]);

/** A transport whose requests wait until the test answers them, in order. */
function controlledTransport() {
  const requests: {
    url: string;
    signal: AbortSignal;
    answer: (answer: SongsterrHttpAnswer) => void;
    fail: (error: unknown) => void;
  }[] = [];
  const transport: SongsterrTransport = (url, signal) =>
    new Promise((resolve, reject) => {
      requests.push({ url, signal, answer: resolve, fail: reject });
    });
  return { transport, requests };
}

const patterns = (requests: readonly { url: string }[]) => requests.map((request) => decodeURIComponent(/pattern=([^&]*)/.exec(request.url)?.[1] ?? ''));

function renderHook(options: Partial<SongsterrSearchOptions> & { song?: Song } = {}) {
  const latest: { current?: SongsterrSearch } = {};
  const onClosed = jest.fn();
  // An explicit `song: undefined` is no song open (a default would replace it).
  const song = 'song' in options ? options.song : SONG;
  const rest = options;
  function Probe({ shownSong }: { readonly shownSong?: Song }) {
    latest.current = useSongsterr({
      song: shownSong,
      onClosed,
      transport: rest.transport ?? controlledTransport().transport,
      openPage: rest.openPage ?? jest.fn(() => Promise.resolve()),
    });
    return null;
  }
  let renderer!: ReactTestRenderer.ReactTestRenderer;
  ReactTestRenderer.act(() => {
    renderer = ReactTestRenderer.create(<Probe shownSong={song} />);
  });
  const panel = () => latest.current as SongsterrSearch;
  return {
    panel,
    onClosed,
    rerender: (next?: Song) => ReactTestRenderer.act(() => renderer.update(<Probe shownSong={next} />)),
    unmount: () => ReactTestRenderer.act(() => renderer.unmount()),
  };
}

/** Lets the transport's settled promise reach the hook. */
async function settle() {
  await ReactTestRenderer.act(async () => {
    await Promise.resolve();
  });
}

beforeEach(() => jest.useFakeTimers());
afterEach(() => jest.useRealTimers());

describe('useSongsterr', () => {
  it('opens with the open song’s title and artist and searches for them at once', async () => {
    // Arrange
    const { transport, requests } = controlledTransport();
    const { panel } = renderHook({ transport });

    // Act
    ReactTestRenderer.act(() => panel().open());

    // Assert
    expect(panel().isOpen).toBe(true);
    expect(panel().query).toBe('One Metallica');
    expect(panel().status).toEqual({
      kind: 'searching',
      query: 'One Metallica',
    });
    expect(patterns(requests)).toEqual(['One Metallica']);
    requests[0]?.answer({ status: 200, body: ANSWER });
    await settle();
    expect(panel().status).toEqual({
      kind: 'found',
      query: 'One Metallica',
      songs: [{ songId: 444, title: 'One', artist: 'Metallica', tracks: [] }],
    });
  });

  it('opens with an empty field and asks nothing for a song without a title or artist', () => {
    // Arrange
    const { transport, requests } = controlledTransport();
    const base = makeSong([]);
    const { panel } = renderHook({
      transport,
      song: { ...base, info: { ...base.info, title: '', artist: '' } },
    });

    // Act
    ReactTestRenderer.act(() => panel().open());

    // Assert
    expect(panel().isOpen).toBe(true);
    expect(panel().query).toBe('');
    expect(panel().status).toEqual({ kind: 'idle' });
    expect(requests).toEqual([]);
  });

  it('searches once typing pauses, not for every key', () => {
    // Arrange
    const { transport, requests } = controlledTransport();
    const { panel } = renderHook({ transport, song: undefined });
    ReactTestRenderer.act(() => panel().open());

    // Act
    for (const text of ['a', 'ac', 'ac/', 'ac/d', 'ac/dc']) {
      ReactTestRenderer.act(() => panel().changeQuery(text));
      ReactTestRenderer.act(() => jest.advanceTimersByTime(SEARCH_DEBOUNCE_MS - 100));
    }
    expect(requests).toEqual([]);
    ReactTestRenderer.act(() => jest.advanceTimersByTime(100));

    // Assert
    expect(panel().query).toBe('ac/dc');
    expect(patterns(requests)).toEqual(['ac/dc']);
  });

  it('asks one request at a time: what is typed meanwhile is asked after it, the answer in between not shown', async () => {
    // Arrange
    const { transport, requests } = controlledTransport();
    const { panel } = renderHook({ transport });
    ReactTestRenderer.act(() => panel().open());

    // Act: two more searches while the first is out
    ReactTestRenderer.act(() => panel().changeQuery('metallica'));
    ReactTestRenderer.act(() => jest.advanceTimersByTime(SEARCH_DEBOUNCE_MS));
    ReactTestRenderer.act(() => panel().changeQuery('metallica one'));
    ReactTestRenderer.act(() => jest.advanceTimersByTime(SEARCH_DEBOUNCE_MS));
    expect(patterns(requests)).toEqual(['One Metallica']);
    requests[0]?.answer({ status: 200, body: ANSWER });
    await settle();

    // Assert: only the latest waiting search was asked next, and the first answer was not shown
    expect(patterns(requests)).toEqual(['One Metallica', 'metallica one']);
    expect(panel().status).toEqual({
      kind: 'searching',
      query: 'metallica one',
    });
    requests[1]?.answer({ status: 200, body: '[]' });
    await settle();
    expect(panel().status).toEqual({ kind: 'empty', query: 'metallica one' });
  });

  it('searches now on Enter, and answers a search it already made from what it found', async () => {
    // Arrange
    const { transport, requests } = controlledTransport();
    const { panel } = renderHook({ transport });
    ReactTestRenderer.act(() => panel().open());
    requests[0]?.answer({ status: 200, body: ANSWER });
    await settle();

    // Act
    ReactTestRenderer.act(() => panel().changeQuery('Iron Maiden'));
    ReactTestRenderer.act(() => panel().searchNow());
    requests[1]?.answer({ status: 200, body: '[]' });
    await settle();
    ReactTestRenderer.act(() => panel().changeQuery('one   metallica '));
    ReactTestRenderer.act(() => panel().changeQuery('One Metallica'));
    ReactTestRenderer.act(() => panel().searchNow());

    // Assert
    expect(patterns(requests)).toEqual(['One Metallica', 'Iron Maiden']);
    expect(panel().status.kind).toBe('found');
  });

  it('reports a failure without trying again by itself; searching again asks again', async () => {
    // Arrange
    const { transport, requests } = controlledTransport();
    const { panel } = renderHook({ transport });
    ReactTestRenderer.act(() => panel().open());

    // Act
    requests[0]?.fail(new TypeError('Network request failed'));
    await settle();
    ReactTestRenderer.act(() => jest.advanceTimersByTime(60_000));

    // Assert
    expect(panel().status).toEqual({
      kind: 'failed',
      query: 'One Metallica',
      failure: { reason: 'offline' },
    });
    expect(requests).toHaveLength(1);
    ReactTestRenderer.act(() => panel().searchNow());
    expect(requests).toHaveLength(2);
  });

  it('clears the results for a blank field and asks nothing', () => {
    // Arrange
    const { transport, requests } = controlledTransport();
    const { panel } = renderHook({ transport, song: undefined });
    ReactTestRenderer.act(() => panel().open());

    // Act
    ReactTestRenderer.act(() => panel().changeQuery('   '));
    ReactTestRenderer.act(() => jest.advanceTimersByTime(SEARCH_DEBOUNCE_MS));
    ReactTestRenderer.act(() => panel().searchNow());

    // Assert
    expect(panel().status).toEqual({ kind: 'idle' });
    expect(requests).toEqual([]);
  });

  it('closes by × or Esc: the keyboard goes back to the score, a waiting search is dropped', () => {
    // Arrange
    const { transport, requests } = controlledTransport();
    const { panel, onClosed } = renderHook({ transport, song: undefined });
    ReactTestRenderer.act(() => panel().open());
    ReactTestRenderer.act(() => panel().changeQuery('slayer'));

    // Act
    ReactTestRenderer.act(() => panel().close());
    ReactTestRenderer.act(() => jest.advanceTimersByTime(SEARCH_DEBOUNCE_MS * 2));

    // Assert
    expect(panel().isOpen).toBe(false);
    expect(onClosed).toHaveBeenCalledTimes(1);
    expect(requests).toEqual([]);
  });

  it('prefills again from the song shown when it opens next', () => {
    // Arrange
    const { transport } = controlledTransport();
    const { panel, rerender } = renderHook({ transport });
    ReactTestRenderer.act(() => panel().open());
    ReactTestRenderer.act(() => panel().close());

    // Act
    rerender({ ...SONG, info: { ...SONG.info, title: 'Master of Puppets' } });
    ReactTestRenderer.act(() => panel().open());

    // Assert
    expect(panel().query).toBe('Master of Puppets Metallica');
  });

  it('opens a song’s page and the terms in the browser, and says when that fails', async () => {
    // Arrange
    const openPage = jest.fn((url: string) => (url.endsWith('/terms') ? Promise.reject(new Error('no browser')) : Promise.resolve()));
    const { panel } = renderHook({ openPage });
    ReactTestRenderer.act(() => panel().open());

    // Act
    ReactTestRenderer.act(() => panel().openSong(444));
    await settle();
    const afterSong = panel().notice;
    ReactTestRenderer.act(() => panel().openTerms());
    await settle();

    // Assert
    expect(openPage.mock.calls.map(([url]) => url)).toEqual(['https://www.songsterr.com/a/wa/song?id=444', 'https://www.songsterr.com/terms']);
    expect(afterSong).toBeUndefined();
    expect(panel().notice).toBe('Could not open the page in your browser.');
  });

  it('forgets an answer that comes after it was closed or unmounted', async () => {
    // Arrange
    const { transport, requests } = controlledTransport();
    const { panel, unmount } = renderHook({ transport });
    ReactTestRenderer.act(() => panel().open());
    ReactTestRenderer.act(() => panel().close());

    // Act
    requests[0]?.answer({ status: 200, body: ANSWER });
    await settle();
    unmount();

    // Assert: no state update after unmount (React would warn), the closed panel shows nothing new
    expect(panel().isOpen).toBe(false);
  });
});
