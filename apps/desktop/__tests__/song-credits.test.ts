import { EMPTY_SONG_INFO } from '@gp-editor/core';
import { authorCredits, authorshipCredits, songCredits } from '../src/lib/song-credits';

describe('authorCredits', () => {
  it('merges identical words and music credits', () => {
    expect(authorCredits('Carulli', 'Carulli')).toEqual(['Words & Music: Carulli']);
    expect(authorCredits('Marco', 'Nightwish')).toEqual(['Music: Nightwish', 'Words: Marco']);
    expect(authorCredits('', '')).toEqual(['', '']);
  });
});

describe('authorshipCredits', () => {
  it('lists the author credits and the tab author, without empty ones', () => {
    expect(authorshipCredits({ ...EMPTY_SONG_INFO, music: 'Nightwish', transcriber: 'Jin' })).toEqual(['Music: Nightwish', 'Tab: Jin']);
    expect(authorshipCredits(EMPTY_SONG_INFO)).toEqual([]);
  });
});

describe('songCredits', () => {
  it('starts with the artist and album, then the authorship credits', () => {
    // Arrange
    const info = { ...EMPTY_SONG_INFO, artist: 'Nightwish', album: 'Oceanborn', words: 'Tuomas', music: 'Tuomas', transcriber: 'Jin' };

    // Act
    const credits = songCredits(info);

    // Assert
    expect(credits).toEqual(['Nightwish', 'Oceanborn', 'Words & Music: Tuomas', 'Tab: Jin']);
    expect(songCredits(EMPTY_SONG_INFO)).toEqual([]);
  });
});
