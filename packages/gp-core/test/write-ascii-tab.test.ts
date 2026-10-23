import { describe, expect, it } from 'vitest';
import { writeAsciiTab } from '../src/index';
import { plainDuration } from '../src/model/defaults';
import { buildNote, buildSong, buildVoice, restVoice } from './helpers/write-song-builder';

const HEADER = 'Title:\nArtist:\nAlbum:\nAuthor:\n';
const WHOLE = plainDuration(1);

/** `bars` whole-note bars of one track, fret 0 on string 6. */
function wholeNoteBars(bars: number) {
  const bar = [{ voice: buildVoice([buildNote(6, 0)], WHOLE) }];
  return buildSong({ tracks: [{ measures: Array.from({ length: bars }, () => bar) }] });
}

/** The string rows of a track's systems: each system is the lines between blank lines after "Track …". */
function systemsOf(text: string): string[][] {
  const body = text.split('\n\n').slice(2);
  return body.map((block) => block.split('\n').filter((line) => line !== ''));
}

describe('writeAsciiTab', () => {
  it('writes the song information, the track and a bar of quarter notes on the six strings', () => {
    // Arrange
    const song = buildSong({
      info: { title: 'Riff', artist: 'Band', album: 'LP', words: 'Writer', music: 'Composer' },
      tracks: [
        {
          name: 'Guitar',
          measures: [
            [
              { voice: buildVoice([buildNote(6, 0)]) },
              { voice: buildVoice([buildNote(5, 2)]) },
              { voice: buildVoice([buildNote(4, 2)]) },
              { voice: restVoice() },
            ],
          ],
        },
      ],
    });

    // Act
    const text = writeAsciiTab(song);

    // Assert
    expect(text).toBe(
      [
        'Title: Riff',
        'Artist: Band',
        'Album: LP',
        'Author: Writer',
        '',
        'Track 1: Guitar',
        '',
        'E|-----------------|',
        'B|-----------------|',
        'G|-----------------|',
        'D|---------2-------|',
        'A|-----2-----------|',
        'E|-0---------------|',
        '',
      ].join('\n'),
    );
  });

  it('writes hammer-ons, pull-offs, slides, bends, releases, held bends, dead notes and chord names', () => {
    // Arrange
    const bend = { points: [{ position: 0, value: 0 }, { position: 6, value: 4 }] };
    const release = { points: [{ position: 0, value: 4 }, { position: 12, value: 0 }] };
    const hold = { points: [{ position: 0, value: 4 }, { position: 12, value: 4 }] };
    const song = buildSong({
      tracks: [
        {
          measures: [
            [
              { voice: buildVoice([buildNote(3, 5, { effect: { hammer: true } })]) },
              { voice: buildVoice([buildNote(3, 7, { effect: { hammer: true } })]) },
              { voice: buildVoice([buildNote(3, 5, { effect: { slides: ['shift'] } })]) },
              { voice: buildVoice([buildNote(3, 7, { effect: { slides: ['legato'] } })]) },
            ],
            [
              { voice: buildVoice([buildNote(2, 5, { effect: { bend } })]), chord: { name: 'Am', firstFret: 1, frets: [] } },
              { voice: buildVoice([buildNote(2, 5, { effect: { bend: release } })]) },
              { voice: buildVoice([buildNote(2, 7, { effect: { bend: hold } })]) },
              { voice: buildVoice([buildNote(1, 3, { effect: { deadNote: true } })]) },
            ],
          ],
        },
      ],
    });

    // Act
    const text = writeAsciiTab(song);

    // Assert
    expect(text).toBe(
      [
        `${HEADER}`,
        'Track 1: Track 1',
        '',
        `${' '.repeat(21)}Am`,
        'E|-----------------|-------------X---|',
        'B|-----------------|-5b7-7r5-H-------|',
        'G|-5h--7p--5/--7---|-----------------|',
        'D|-----------------|-----------------|',
        'A|-----------------|-----------------|',
        'E|-----------------|-----------------|',
        '',
      ].join('\n'),
    );
  });

  it('spaces beats by their length, widening a beat whose text does not fit', () => {
    // Arrange: two 32nds (1 column each), a 16th (2), an eighth (3), a quarter (4) and a half (5)
    const song = buildSong({
      tracks: [
        {
          measures: [
            [
              { voice: buildVoice([buildNote(1, 0)], plainDuration(32)) },
              { voice: buildVoice([buildNote(1, 12)], plainDuration(32)) },
              { voice: buildVoice([buildNote(1, 1)], plainDuration(16)) },
              { voice: buildVoice([buildNote(1, 2)], plainDuration(8)) },
              { voice: buildVoice([buildNote(1, 3)]) },
              { voice: buildVoice([buildNote(1, 4)], plainDuration(2)) },
            ],
          ],
        },
      ],
    });

    // Act
    const [firstRow] = systemsOf(writeAsciiTab(song))[0] ?? [];

    // Assert: "0" needs 2 columns, "12" needs 3
    expect(firstRow).toBe('E|-0-12-1-2--3---4----|');
  });

  it('shows the notes of every voice, the first voice winning on a shared string', () => {
    // Arrange
    const song = buildSong({
      tracks: [{ measures: [[{ voice: buildVoice([buildNote(1, 5)], plainDuration(1)), voice2: buildVoice([buildNote(1, 9), buildNote(6, 3)], plainDuration(1)) }]] }],
    });

    // Act
    const rows = systemsOf(writeAsciiTab(song))[0] ?? [];

    // Assert
    expect([rows[0], rows[5]]).toEqual(['E|-5-----|', 'E|-3-----|']);
  });

  it('gives an empty bar the width of a whole-bar rest, and a bar’s last beat the rest of the bar', () => {
    // Arrange
    const song = buildSong({ tracks: [{ measures: [[], [{ voice: buildVoice([buildNote(1, 1)]) }]] }] });

    // Act
    const [firstRow] = systemsOf(writeAsciiTab(song))[0] ?? [];

    // Assert
    expect(firstRow).toBe('E|-------|-1-----|');
  });

  it('names each string after its open note, right-aligned to the widest name', () => {
    // Arrange: E B F# D A E
    const tuning = [64, 59, 54, 50, 45, 40];
    const song = buildSong({
      tracks: [{ strings: tuning.map((pitch, index) => ({ number: index + 1, tuning: pitch })), measures: [[{ voice: buildVoice([buildNote(6, 0)], WHOLE) }]] }],
    });

    // Act
    const rows = systemsOf(writeAsciiTab(song))[0] ?? [];

    // Assert
    expect(rows.map((row) => row.slice(0, 3))).toEqual([' E|', ' B|', 'F#|', ' D|', ' A|', ' E|']);
  });
});

describe('writeAsciiTab lines', () => {
  it('breaks the bars into systems no wider than the line width', () => {
    // Arrange: each whole-note bar is 8 columns; 1 + 3 × 8 + 1 = 26 fits in 30, a fourth bar would not
    const song = wholeNoteBars(8);

    // Act
    const systems = systemsOf(writeAsciiTab(song, { lineWidth: 30 }));

    // Assert
    expect(systems.map((rows) => rows.length)).toEqual([6, 6, 6]);
    expect(systems.map((rows) => rows[0]?.length)).toEqual([26, 26, 18]);
  });

  it('writes 80-column systems by default, as TuxGuitar does', () => {
    // Act
    const systems = systemsOf(writeAsciiTab(wholeNoteBars(20)));

    // Assert: 1 + 9 × 8 + 1 = 74
    expect(systems.map((rows) => rows[0]?.length)).toEqual([74, 74, 18]);
  });

  it('gives a bar wider than the line a system of its own', () => {
    // Act
    const systems = systemsOf(writeAsciiTab(wholeNoteBars(2), { lineWidth: 5 }));

    // Assert
    expect(systems.map((rows) => rows[0])).toEqual(['E|-------|', 'E|-------|']);
  });

  it('writes the chosen tracks in the order given', () => {
    // Arrange
    const bar = [{ voice: buildVoice([buildNote(1, 0)], WHOLE) }];
    const song = buildSong({ tracks: [{ name: 'Lead', measures: [bar] }, { name: 'Bass', measures: [bar] }, { name: 'Keys', measures: [bar] }] });

    // Act
    const text = writeAsciiTab(song, { trackIndexes: [2, 0] });

    // Assert
    expect(text.split('\n').filter((line) => line.startsWith('Track '))).toEqual(['Track 3: Keys', 'Track 1: Lead']);
  });

  it('writes only the heading of a track without strings', () => {
    // Arrange
    const song = buildSong({ tracks: [{ name: 'Empty', strings: [], measures: [[{ voice: restVoice() }]] }] });

    // Act
    const text = writeAsciiTab(song);

    // Assert
    expect(text).toBe(`${HEADER}\nTrack 1: Empty\n`);
  });

  it.each([
    [{ trackIndexes: [3] }, 'trackIndexes contains 3'],
    [{ trackIndexes: [-1] }, 'trackIndexes contains -1'],
    [{ lineWidth: 0 }, 'lineWidth 0'],
    [{ lineWidth: 2.5 }, 'lineWidth 2.5'],
  ])('rejects %o', (options, message) => {
    // Arrange
    const song = wholeNoteBars(1);

    // Act / Assert
    expect(() => writeAsciiTab(song, options)).toThrow(RangeError);
    expect(() => writeAsciiTab(song, options)).toThrow(message);
  });
});
