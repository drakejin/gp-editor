import { EMPTY_SONG_INFO, type FileFormat, type Song, type SongInfo } from '@gp-editor/core';
import { Text } from 'react-native';
import ReactTestRenderer from 'react-test-renderer';
import { SongHeader } from '../src/components/SongHeader';
import { PALETTE } from '../test-support/score-helpers';
import { beat, header, makeSong, note } from '../test-support/songs';

const TWO_BARS = makeSong([[beat(header(1).start, [note(1, 0)])], [beat(header(2).start, [note(1, 2)])]]);
/** Two tracks, two bars. */
const BASE: Song = { ...TWO_BARS, tracks: [...TWO_BARS.tracks, { ...TWO_BARS.tracks[0]!, number: 2, name: 'Bass' }] };

function song(info: Partial<SongInfo>, format: FileFormat = 'gp5', version = 'FICHIER GUITAR PRO v5.10'): Song {
  return { ...BASE, source: { format, version }, info: { ...EMPTY_SONG_INFO, ...info } };
}

/** Every visible text of the header, in order. */
function renderTexts(shown: Song, fileName = 'nemo.gp5'): string[] {
  let renderer!: ReactTestRenderer.ReactTestRenderer;
  ReactTestRenderer.act(() => {
    renderer = ReactTestRenderer.create(<SongHeader song={shown} fileName={fileName} palette={PALETTE} />);
  });
  return renderer.root.findAllByType(Text).map((text) => [text.props.children].flat().join(''));
}

describe('SongHeader', () => {
  it('shows the title, the format badge and every credit with the track and bar counts', () => {
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
      'Guitar Pro 5',
      'Nightwish  ·  Once  ·  Music: Nightwish  ·  Words: Tuomas Holopainen  ·  Tab: Jin  ·  2 tracks  ·  2 bars  ·  FICHIER GUITAR PRO v5.10',
    ]);
  });

  it('counts one track and one bar in the singular', () => {
    const single: Song = { ...TWO_BARS, measureHeaders: TWO_BARS.measureHeaders.slice(0, 1), info: { ...EMPTY_SONG_INFO, title: 'Solo' } };
    expect(renderTexts(single).at(-1)).toBe('1 track  ·  1 bar  ·  FICHIER GUITAR PRO v5.10');
  });

  it('credits words and music once when the same person wrote both', () => {
    const texts = renderTexts(song({ title: 'Op. 241', words: 'Carulli', music: 'Carulli' }, 'gp3', 'FICHIER GUITAR PRO v3.00'));
    expect(texts).toEqual(['Op. 241', 'Guitar Pro 3', 'Words & Music: Carulli  ·  2 tracks  ·  2 bars  ·  FICHIER GUITAR PRO v3.00']);
  });

  it('shows the subtitle under the title when there is one', () => {
    const texts = renderTexts(song({ title: 'Nemo', subtitle: 'Live at Wembley' }));
    expect(texts).toEqual(['Nemo', 'Guitar Pro 5', 'Live at Wembley', '2 tracks  ·  2 bars  ·  FICHIER GUITAR PRO v5.10']);
  });

  it('falls back to the file name when the song has no title, and names the format of a .gpx file', () => {
    // Act
    const texts = renderTexts(song({}, 'gpx', '6.1.0'), 'untitled.gpx');

    // Assert
    expect(texts[0]).toBe('untitled.gpx');
    expect(texts[1]).toBe('Guitar Pro 6');
  });

  it.each<[FileFormat, string]>([
    ['gp1', 'Guitar Pro 1'],
    ['gp2', 'Guitar Pro 2'],
    ['gp4', 'Guitar Pro 4'],
    ['gp7', 'Guitar Pro 7+'],
  ])('labels a %s song “%s”', (format, label) => {
    expect(renderTexts(song({ title: 'Nemo' }, format, ''))[1]).toBe(label);
  });
});
