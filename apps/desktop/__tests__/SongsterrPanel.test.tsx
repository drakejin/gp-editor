import { Text } from 'react-native';
import ReactTestRenderer from 'react-test-renderer';
import { ChromeButton } from '../src/components/chrome/ChromeButton';
import { SongsterrPanel } from '../src/components/songsterr/SongsterrPanel';
import { TextField } from '../src/components/TextField';
import type { SongsterrSearch, SongsterrStatus } from '../src/hooks/use-songsterr';
import { setLanguage } from '../src/lib/i18n/i18n';
import type { SongsterrSong } from '../src/songsterr/songsterr-answer';
import { PALETTE } from '../test-support/score-helpers';

afterEach(() => ReactTestRenderer.act(() => setLanguage('en')));

const ONE: SongsterrSong = {
  songId: 444,
  title: 'One',
  artist: 'Metallica',
  tracks: [
    {
      instrumentId: 66,
      instrument: 'Tenor Sax',
      name: 'Lead Vocals',
      views: 4991,
      tuning: [64, 59, 55, 50, 45, 40],
    },
    {
      instrumentId: 30,
      instrument: 'Distortion Guitar',
      name: 'Lead Guitar',
      views: 1109462,
      tuning: [64, 59, 55, 50, 45, 40],
    },
    {
      instrumentId: 34,
      instrument: 'Electric Bass (pick)',
      name: 'Bass',
      views: 167289,
      tuning: [43, 38, 33, 28],
    },
    { instrumentId: 1024, instrument: 'Drums', name: 'Drums', views: 117871 },
    {
      instrumentId: 30,
      instrument: 'Distortion Guitar',
      name: 'Rhythm Guitar',
      views: 408975,
      tuning: [64, 59, 55, 50, 45, 40],
    },
    {
      instrumentId: 25,
      instrument: 'Acoustic Guitar (steel)',
      name: 'Acoustic I',
      views: 55523,
      tuning: [64, 59, 55, 50, 45, 40],
    },
    {
      instrumentId: 25,
      instrument: 'Acoustic Guitar (steel)',
      name: 'Acoustic II',
      views: 6646,
      tuning: [64, 59, 55, 50, 45, 40],
    },
    { instrumentId: 127, instrument: 'Gunshot', name: 'Gunshots', views: 1081 },
  ],
};

function searchOf(status: SongsterrStatus, overrides: Partial<SongsterrSearch> = {}): SongsterrSearch {
  return {
    isOpen: true,
    query: 'One Metallica',
    status,
    open: jest.fn(),
    close: jest.fn(),
    changeQuery: jest.fn(),
    searchNow: jest.fn(),
    openSong: jest.fn(),
    openTerms: jest.fn(),
    ...overrides,
  };
}

function render(songsterr: SongsterrSearch) {
  let renderer!: ReactTestRenderer.ReactTestRenderer;
  ReactTestRenderer.act(() => {
    renderer = ReactTestRenderer.create(<SongsterrPanel palette={PALETTE} songsterr={songsterr} />);
  });
  const root = renderer.root;
  const texts = () => root.findAllByType(Text).map((text) => [text.props.children].flat().join(''));
  const button = (label: string) => root.findAllByType(ChromeButton).find((candidate) => candidate.props.label === label);
  return { root, texts, button };
}

describe('SongsterrPanel', () => {
  it('shows the field with the search, a Search button, ×, the small print and the terms', () => {
    // Arrange
    const songsterr = searchOf({ kind: 'idle' });

    // Act
    const panel = render(songsterr);
    const field = panel.root.findByType(TextField);
    ReactTestRenderer.act(() => field.props.onChangeText('Slayer'));
    ReactTestRenderer.act(() => field.props.onSubmitEditing());
    ReactTestRenderer.act(() => panel.button('Search')?.props.onPress());
    ReactTestRenderer.act(() => panel.button('✕')?.props.onPress());
    const terms = panel.root.findAll((node) => node.props.accessibilityRole === 'link' && typeof node.props.onPress === 'function')[0];
    ReactTestRenderer.act(() => terms?.props.onPress());

    // Assert
    expect(field.props.value).toBe('One Metallica');
    expect(field.props.autoFocus).toBe(true);
    expect(songsterr.changeQuery).toHaveBeenCalledWith('Slayer');
    expect(songsterr.searchNow).toHaveBeenCalledTimes(2);
    expect(songsterr.close).toHaveBeenCalledTimes(1);
    expect(songsterr.openTerms).toHaveBeenCalledTimes(1);
    expect(panel.texts()).toEqual(
      expect.arrayContaining([
        'Songsterr',
        'Find a song’s tabs on songsterr.com',
        'Type a song title or an artist.',
        'Results from Songsterr’s search. Tabs open on songsterr.com in your browser; GP Editor does not download them.',
        'Songsterr’s terms',
      ]),
    );
  });

  it('says what it is searching for', () => {
    expect(render(searchOf({ kind: 'searching', query: 'One Metallica' })).texts()).toContain('Searching Songsterr for “One Metallica”…');
  });

  it('lists each song found with its most viewed tracks, the others counted, and opens it on Songsterr', () => {
    // Arrange
    const songsterr = searchOf({
      kind: 'found',
      query: 'One Metallica',
      songs: [ONE, { songId: 7, title: 'Seven', artist: '', tracks: [] }],
    });

    // Act
    const panel = render(songsterr);
    const opens = panel.root.findAllByType(ChromeButton).filter((candidate) => candidate.props.label === 'Open on Songsterr');
    ReactTestRenderer.act(() => opens[0]?.props.onPress());

    // Assert
    const texts = panel.texts();
    expect(texts).toEqual(expect.arrayContaining(['2 songs for “One Metallica”, their most viewed tracks first', 'One — Metallica', 'Seven', '+ 2 more tracks', 'No tracks listed']));
    const trackLines = texts.filter((text) => text.includes(' · '));
    expect(trackLines).toEqual([
      'Distortion Electric Guitar · Lead Guitar · E A D G B E',
      'Distortion Electric Guitar · Rhythm Guitar · E A D G B E',
      'Picked Electric Bass · Bass · E A D G',
      'Drums · Drums',
      'Steel String Acoustic Guitar · Acoustic I · E A D G B E',
      'Steel String Acoustic Guitar · Acoustic II · E A D G B E',
    ]);
    expect(opens).toHaveLength(2);
    expect(opens[0]?.props.tooltip).toBe('Open “One — Metallica” on songsterr.com in your browser');
    expect(songsterr.openSong).toHaveBeenCalledWith(444);
  });

  it('says when nothing was found, and why a search failed', () => {
    expect(render(searchOf({ kind: 'empty', query: 'zzqx' })).texts()).toContain('Songsterr has no song for “zzqx”.');
    expect(
      render(
        searchOf({
          kind: 'failed',
          query: 'one',
          failure: { reason: 'offline' },
        }),
      ).texts(),
    ).toContain('Could not reach Songsterr. Check the internet connection, then search again.');
    expect(
      render(
        searchOf({
          kind: 'failed',
          query: 'one',
          failure: { reason: 'http', status: 503 },
        }),
      ).texts(),
    ).toContain('Songsterr answered with an error (HTTP 503). Search again later.');
  });

  it('says when a page could not be opened in the browser', () => {
    expect(render(searchOf({ kind: 'idle' }, { notice: 'Could not open the page in your browser.' })).texts()).toContain('Could not open the page in your browser.');
  });

  it('speaks Korean in the Korean interface, the songs’ and tracks’ names as Songsterr writes them', () => {
    // Arrange
    ReactTestRenderer.act(() => setLanguage('ko'));

    // Act
    const panel = render(searchOf({ kind: 'found', query: 'One Metallica', songs: [ONE] }));

    // Assert
    expect(panel.texts()).toEqual(
      expect.arrayContaining([
        'songsterr.com에서 곡의 타브 악보 찾기',
        '“One Metallica” 검색 결과 1곡, 많이 본 트랙부터',
        'One — Metallica',
        '디스토션 기타 · Lead Guitar · E A D G B E',
        '+ 트랙 2개 더',
        'Songsterr 이용 약관',
      ]),
    );
    expect(panel.button('검색')).toBeDefined();
    expect(panel.button('Songsterr에서 열기')).toBeDefined();
  });
});
