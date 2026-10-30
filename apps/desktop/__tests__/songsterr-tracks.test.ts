import ReactTestRenderer from 'react-test-renderer';
import { setLanguage } from '../src/lib/i18n/i18n';
import type { SongsterrSong, SongsterrTrack } from '../src/songsterr/songsterr-answer';
import { SHOWN_TRACKS, shownTracks, songLabel, trackSummary } from '../src/songsterr/songsterr-tracks';

afterEach(() => ReactTestRenderer.act(() => setLanguage('en')));

const track = (overrides: Partial<SongsterrTrack>): SongsterrTrack => ({
  instrumentId: 30,
  instrument: 'Distortion Guitar',
  name: '',
  views: 0,
  tuning: undefined,
  ...overrides,
});

describe('shownTracks', () => {
  it('lists the most viewed tracks first, at most SHOWN_TRACKS, and counts the others', () => {
    // Arrange
    const tracks = Array.from({ length: SHOWN_TRACKS + 3 }, (_, index) => track({ name: `T${index}`, views: index * 10 }));
    const song: SongsterrSong = {
      songId: 1,
      title: 'One',
      artist: 'Metallica',
      tracks,
    };

    // Act
    const shown = shownTracks(song);

    // Assert
    expect(shown.tracks.map((shownTrack) => shownTrack.name)).toEqual(['T8', 'T7', 'T6', 'T5', 'T4', 'T3']);
    expect(shown.hiddenCount).toBe(3);
  });

  it('keeps Songsterr’s order between tracks viewed as often', () => {
    const song: SongsterrSong = {
      songId: 1,
      title: 'One',
      artist: '',
      tracks: [track({ name: 'A', views: 5 }), track({ name: 'B', views: 9 }), track({ name: 'C', views: 5 })],
    };

    expect(shownTracks(song).tracks.map((shownTrack) => shownTrack.name)).toEqual(['B', 'A', 'C']);
  });
});

describe('trackSummary', () => {
  it('names a guitar’s instrument, its name and its tuning in note names, lowest string first', () => {
    expect(
      trackSummary(
        track({
          name: 'Kirk Hammett | Lead Guitar',
          tuning: [64, 59, 55, 50, 45, 40],
        }),
      ),
    ).toBe('Distortion Electric Guitar · Kirk Hammett | Lead Guitar · E A D G B E');
  });

  it('writes a bass’s and a drop tuning’s notes as they are', () => {
    expect(
      trackSummary(
        track({
          instrumentId: 33,
          instrument: 'Electric Bass (finger)',
          tuning: [43, 38, 33, 28, 23],
        }),
      ),
    ).toBe('Fingered Electric Bass · B E A D G');
    expect(trackSummary(track({ tuning: [64, 59, 55, 50, 45, 38] }))).toBe('Distortion Electric Guitar · D A D G B E');
  });

  it('leaves out the tuning of an instrument without frets (Songsterr gives vocals and horns a guitar’s)', () => {
    expect(
      trackSummary(
        track({
          instrumentId: 66,
          instrument: 'Tenor Sax',
          name: 'Lead Vocals',
          tuning: [64, 59, 55, 50, 45, 40],
        }),
      ),
    ).toBe('Tenor Sax · Lead Vocals');
  });

  it('names the instrument as the app names General MIDI programs, a drum track drums, and Songsterr’s word for anything else', () => {
    expect(trackSummary(track({ instrumentId: 1024, instrument: 'Drums', name: 'Lars Ulrich' }))).toBe('Drums · Lars Ulrich');
    expect(trackSummary(track({ instrumentId: 0, instrument: 'Piano', name: 'Keys' }))).toBe('Acoustic Grand Piano · Keys');
    expect(trackSummary(track({ instrumentId: 2000, instrument: 'Theremin', name: '' }))).toBe('Theremin');
    expect(trackSummary(track({ instrumentId: undefined, instrument: '', name: '' }))).toBe('Unknown instrument');
  });

  it('names instruments in Korean in the Korean interface, the notes as written', () => {
    // Arrange
    ReactTestRenderer.act(() => setLanguage('ko'));

    // Act / Assert
    expect(trackSummary(track({ instrumentId: 1024, instrument: 'Drums', name: 'Lars Ulrich' }))).toBe('드럼 · Lars Ulrich');
    expect(trackSummary(track({ instrumentId: 30, name: 'Lead' }))).toBe('디스토션 기타 · Lead');
    expect(trackSummary(track({ instrumentId: undefined, instrument: '', name: '' }))).toBe('알 수 없는 악기');
    expect(trackSummary(track({ tuning: [64, 59, 55, 50, 45, 40] })).endsWith(' · E A D G B E')).toBe(true);
  });
});

describe('songLabel', () => {
  it('writes the title, then the artist', () => {
    expect(songLabel({ songId: 1, title: 'One', artist: 'Metallica', tracks: [] })).toBe('One — Metallica');
    expect(songLabel({ songId: 1, title: 'One', artist: '', tracks: [] })).toBe('One');
  });
});
