import type { Song } from '@gp-editor/core';
import { PRINT_PALETTE } from '../src/export/paper';
import { AVERAGE_CHAR_WIDTH, engraveTitleBlock, titleBlockLines } from '../src/export/title-block';
import { texts } from '../test-support/score-helpers';
import { makeSong, onStrings } from '../test-support/songs';

const WIDTH = 523;
const DROP_D = [64, 59, 55, 50, 45, 38];

function withInfo(song: Song, info: Partial<Song['info']>): Song {
  return { ...song, info: { ...song.info, ...info } };
}

describe('titleBlockLines', () => {
  it('lists the title, subtitle, artist, album, the author and tab credits, then the track and its tuning', () => {
    // Arrange
    const song = withInfo(onStrings(makeSong([]), DROP_D, { offset: 2 }), {
      title: 'Etude', subtitle: 'No. 3', artist: 'Carulli', album: 'Studies', words: 'Anon', music: 'Carulli', transcriber: 'Jin',
    });

    // Act
    const lines = titleBlockLines(song, 0, 'Etude').map((line) => line.text);

    // Assert
    expect(lines).toEqual([
      'Etude',
      'No. 3',
      'Carulli',
      'Studies',
      'Music: Carulli  ·  Words: Anon  ·  Tab: Jin',
      'Guitar — Guitar · 6 strings · Drop D (D A D G B E) · capo 2',
    ]);
  });

  it('leaves out the fields the song does not fill', () => {
    const lines = titleBlockLines(makeSong([]), 0, 'Test').map((line) => line.text);
    expect(lines).toEqual(['Test', 'Guitar — Guitar · 6 strings · Standard (E A D G B E)']);
  });

  it('names a drum track without a tuning, and an unnamed track by its number', () => {
    const drums = onStrings(makeSong([]), [0, 0, 0, 0, 0, 0], { isPercussion: true });
    const unnamed: Song = { ...drums, tracks: drums.tracks.map((track) => ({ ...track, name: '' })) };
    expect(titleBlockLines(drums, 0, 'Test').map((line) => line.text)).toEqual(['Test', 'Guitar']);
    expect(titleBlockLines(unnamed, 0, 'Test').map((line) => line.text)).toEqual(['Test', 'Track 1']);
  });

  it('has only the title when the track does not exist', () => {
    expect(titleBlockLines(makeSong([]), 3, 'Test').map((line) => line.text)).toEqual(['Test']);
  });
});

describe('engraveTitleBlock', () => {
  it('centres the headings on the page width and puts the track line on the left', () => {
    // Act
    const block = engraveTitleBlock(makeSong([]), 0, 'Test', WIDTH, PRINT_PALETTE);

    // Assert
    const [title, trackLine] = texts(block.commands);
    expect(title).toMatchObject({ text: 'Test', x: WIDTH / 2, align: 'center', bold: true, color: PRINT_PALETTE.text });
    expect(trackLine).toMatchObject({ x: 0, align: 'left' });
    expect(block.commands.every((command) => command.kind === 'text' && command.y > 0 && command.y < block.height)).toBe(true);
  });

  it('grows with every line it shows', () => {
    const short = engraveTitleBlock(makeSong([]), 0, 'Test', WIDTH, PRINT_PALETTE);
    const long = engraveTitleBlock(withInfo(makeSong([]), { subtitle: 'Live', artist: 'Band' }), 0, 'Test', WIDTH, PRINT_PALETTE);
    expect(long.height).toBeGreaterThan(short.height);
  });

  it('shrinks a long title so it fits the page width', () => {
    // Arrange
    const title = 'A very long title '.repeat(8);

    // Act
    const [line] = texts(engraveTitleBlock(makeSong([]), 0, title, WIDTH, PRINT_PALETTE).commands);

    // Assert
    expect(line).toBeDefined();
    expect(title.length * (line?.size ?? 0) * AVERAGE_CHAR_WIDTH).toBeLessThanOrEqual(WIDTH);
  });
});
