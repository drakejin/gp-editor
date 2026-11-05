import { describe, expect, it } from 'vitest';
import { lyricsSyllables, separateCjkSyllables, setTrackLyrics, withBlankSyllable, withBlankSyllables } from '../src/edit/lyrics';
import type { Song } from '../src/model/song';
import { buildSong, deepFreeze, n, play } from './helpers/edit-songs';

/** Two tracks of three bars; the second track sings "old words" from bar 2. */
function twoTracks(): Song {
  const bars = [[[play(1, n(1, 5))]], [[play(1, n(1, 7))]], [[play(1, n(1, 8))]]];
  const song = buildSong({ tracks: [bars, bars] });
  const sung = { ...song.tracks[1]!, lyrics: { from: 2, text: 'old words' } };
  return deepFreeze({ ...song, tracks: [song.tracks[0]!, sung] });
}

describe('setTrackLyrics', () => {
  it('gives the track its lyrics and keeps the other tracks', () => {
    // Arrange
    const song = twoTracks();

    // Act
    const edited = setTrackLyrics(song, 0, { from: 1, text: 'Hel-lo world' });

    // Assert
    expect(edited.tracks[0]?.lyrics).toEqual({ from: 1, text: 'Hel-lo world' });
    expect(edited.tracks[0]?.measures).toBe(song.tracks[0]?.measures);
    expect(edited.tracks[1]).toBe(song.tracks[1]);
    expect(song.tracks[0]?.lyrics).toBeUndefined();
  });

  it('keeps the first bar inside the song, rounded', () => {
    expect(setTrackLyrics(twoTracks(), 1, { from: 9, text: 'la' }).tracks[1]?.lyrics?.from).toBe(3);
    expect(setTrackLyrics(twoTracks(), 1, { from: -4, text: 'la' }).tracks[1]?.lyrics?.from).toBe(1);
    expect(setTrackLyrics(twoTracks(), 1, { from: 1.6, text: 'la' }).tracks[1]?.lyrics?.from).toBe(2);
  });

  it('takes the lyrics away when the text is blank', () => {
    const edited = setTrackLyrics(twoTracks(), 1, { from: 2, text: '  \n ' });
    expect(edited.tracks[1]).not.toHaveProperty('lyrics');
  });

  it('returns the same song for the same lyrics, a missing track, a first bar that is not a number or no text', () => {
    const song = twoTracks();
    expect(setTrackLyrics(song, 1, { from: 2, text: 'old words' })).toBe(song);
    expect(setTrackLyrics(song, 0, { from: 1, text: '' })).toBe(song);
    expect(setTrackLyrics(song, 4, { from: 1, text: 'la' })).toBe(song);
    expect(setTrackLyrics(song, 1, { from: Number.NaN, text: 'la' })).toBe(song);
  });
});

describe('lyricsSyllables', () => {
  it('splits at spaces and line breaks, and after hyphens, which stay on their syllable (Guitar Pro)', () => {
    expect(lyricsSyllables('Beau-ti-ful day\nto-night')).toEqual(['Beau-', 'ti-', 'ful', 'day', 'to-', 'night']);
  });

  it('reads a hyphen before a space like one alone, as the song writer writes it', () => {
    expect(lyricsSyllables('Pa- per boats')).toEqual(['Pa-', 'per', 'boats']);
  });

  it('leaves a note without a syllable where two spaces meet (TuxGuitar’s TGLyric)', () => {
    expect(lyricsSyllables('one  two')).toEqual(['one', '', 'two']);
  });

  it('sings words joined by "+" on one note and drops the underscores that hold a syllable', () => {
    expect(lyricsSyllables('a+lot of love__ __')).toEqual(['a lot', 'of', 'love', '']);
  });

  it('leaves out comments in brackets, with the space after them, as Guitar Pro does', () => {
    expect(lyricsSyllables('[Verse 1]\nsing a [la la] song [with comments]')).toEqual(['sing', 'a', 'song']);
    expect(lyricsSyllables('a[b]')).toEqual(['a[b]']);
  });

  it('keeps hyphens that start or fill a syllable', () => {
    expect(lyricsSyllables('- --la')).toEqual(['-', '--', 'la']);
  });
});

describe('withBlankSyllable', () => {
  /** The syllables with a blank inserted at `index`, as the text with the blank must read. */
  function expected(text: string, index: number): readonly string[] {
    const syllables = lyricsSyllables(text);
    return index >= syllables.length ? syllables : [...syllables.slice(0, index), '', ...syllables.slice(index)];
  }

  it('leaves a note bare before a word: one more space', () => {
    expect(withBlankSyllable('one two three', 1)).toBe('one  two three');
    expect(withBlankSyllable('one two three', 0)).toBe(' one two three');
  });

  it('splits a hyphenated word with a bare note between its syllables', () => {
    expect(withBlankSyllable('Beau-ti-ful', 1)).toBe('Beau-  ti-ful');
    expect(lyricsSyllables(withBlankSyllable('Beau-ti-ful', 2))).toEqual(['Beau-', 'ti-', '', 'ful']);
  });

  it('keeps line breaks, comments, joined words and held syllables as they are', () => {
    const texts = ['[Verse 1]\nsing a [la la] song', 'a+lot of love__ __', 'Pa- per\r\nboats', 'one  two', '- --la', '[Intro] la la', 'la\rla [x]'];
    for (const text of texts) {
      for (let index = 0; index <= lyricsSyllables(text).length; index++) {
        expect(lyricsSyllables(withBlankSyllable(text, index)), `${JSON.stringify(text)} at ${index}`).toEqual(expected(text, index));
      }
    }
  });

  it('leaves the text as it is where the spaces would turn a bracketed syllable into a comment', () => {
    expect(lyricsSyllables('la-[x] b')).toEqual(['la-', '[x]', 'b']);
    expect(withBlankSyllable('la-[x] b', 1)).toBe('la-[x] b');
    expect(withBlankSyllable('la-[x] b', 2)).toBe('la-[x]  b');
  });

  it('changes nothing past the last syllable', () => {
    expect(withBlankSyllable('one two', 2)).toBe('one two');
    expect(withBlankSyllable('one two', 9)).toBe('one two');
  });
});

describe('withBlankSyllables', () => {
  it('leaves bare notes at each index of the lyrics as they will be sung, in one pass', () => {
    expect(withBlankSyllables('a b c d', [1, 3])).toBe('a  b  c d');
    expect(lyricsSyllables(withBlankSyllables('a b c d', [1, 3]))).toEqual(['a', '', 'b', '', 'c', 'd']);
    expect(lyricsSyllables(withBlankSyllables('a b-c d', [1, 2, 4]))).toEqual(['a', '', '', 'b-', '', 'c', 'd']);
  });

  it('reads like inserting the blanks one at a time', () => {
    const text = 'Beau-ti-ful [x] day\r\nto+night__ end';
    const indexes = [0, 2, 3, 6, 9];
    expect(lyricsSyllables(withBlankSyllables(text, indexes))).toEqual(lyricsSyllables(indexes.reduce((current, index) => withBlankSyllable(current, index), text)));
  });
});

describe('separateCjkSyllables', () => {
  it('puts one Korean or Chinese character on each note', () => {
    expect(separateCjkSyllables('사랑해 너를')).toBe('사 랑 해 너 를');
    expect(separateCjkSyllables('月亮')).toBe('月 亮');
  });

  it('keeps Japanese small kana with the character before them', () => {
    expect(separateCjkSyllables('きょうはシャツ')).toBe('きょ う は シャ ツ');
  });

  it('leaves Latin text, spaced characters and line breaks as they are', () => {
    expect(separateCjkSyllables('Hel-lo 종 이  배\n를')).toBe('Hel-lo 종 이  배\n를');
    expect(separateCjkSyllables('la사랑')).toBe('la사 랑');
  });
});
