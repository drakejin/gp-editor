import { EMPTY_SONG_INFO, type Song, type SongInfo } from '@gp-editor/core';
import { Text } from 'react-native';
import ReactTestRenderer from 'react-test-renderer';
import { SongHeader } from '../src/components/SongHeader';
import { PALETTE } from '../test-support/score-helpers';
import { beat, header, makeSong, note } from '../test-support/songs';

const BASE = makeSong([
  [beat(header(1).start, [note(1, 0)])],
  [beat(header(2).start, [note(1, 2)])],
]);

function song(info: Partial<SongInfo>): Song {
  return { ...BASE, info: { ...EMPTY_SONG_INFO, ...info } };
}

/** Every visible text of the page title, in order. */
function renderTexts(shown: Song, fileName = 'nemo.gp5'): string[] {
  let renderer!: ReactTestRenderer.ReactTestRenderer;
  ReactTestRenderer.act(() => {
    renderer = ReactTestRenderer.create(
      <SongHeader
        song={shown}
        trackIndex={0}
        fileName={fileName}
        palette={PALETTE}
      />,
    );
  });
  return renderer.root
    .findAllByType(Text)
    .map(text => [text.props.children].flat().join(''));
}

describe('SongHeader (the page title)', () => {
  it('shows the title, artist, album and credits, then the shown track with its tuning, as the PDF does', () => {
    // Arrange
    const credited = song({
      title: 'Nemo',
      artist: 'Nightwish',
      album: 'Once',
      words: 'Tuomas Holopainen',
      music: 'Nightwish',
      transcriber: 'Jin',
    });

    // Act
    const texts = renderTexts(credited);

    // Assert
    expect(texts).toEqual([
      'Nemo',
      'Nightwish',
      'Once',
      'Music: Nightwish  ·  Words: Tuomas Holopainen  ·  Tab: Jin',
      'Guitar — Guitar · 6 strings · Standard (E A D G B E)',
    ]);
  });

  it('credits words and music once when the same person wrote both', () => {
    expect(
      renderTexts(
        song({ title: 'Op. 241', words: 'Carulli', music: 'Carulli' }),
      ),
    ).toContain('Words & Music: Carulli');
  });

  it('shows the subtitle under the title when there is one', () => {
    expect(
      renderTexts(song({ title: 'Nemo', subtitle: 'Live at Wembley' })).slice(
        0,
        2,
      ),
    ).toEqual(['Nemo', 'Live at Wembley']);
  });

  it('falls back to the file name when the song has no title', () => {
    expect(renderTexts(song({}), 'untitled.gpx')[0]).toBe('untitled.gpx');
  });
});
