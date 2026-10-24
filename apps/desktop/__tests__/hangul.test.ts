import { initialOf, initials, isInitialsOnly, startsWithTyped } from '../src/lib/hangul';

describe('hangul search helpers', () => {
  it('turns syllables into their initial consonants and leaves other characters alone', () => {
    expect(initialOf('튜')).toBe('ㅌ');
    expect(initialOf('까')).toBe('ㄲ');
    expect(initialOf('a')).toBe('a');
    expect(initials('조옮김…')).toBe('ㅈㅇㄱ…');
    expect(initials('PDF로 내보내기')).toBe('PDFㄹ ㄴㅂㄴㄱ');
  });

  it('tells a 초성 query from any other', () => {
    expect(['ㅌㄴ', 'ㄲㅆ'].map(isInitialsOnly)).toEqual([true, true]);
    expect(['', '튜너', 'ㅌ너', 'tn', 'ㅏ'].map(isInitialsOnly)).toEqual([false, false, false, false, false]);
  });

  it('matches a word by what was typed, the last syllable still composing', () => {
    // 조옮김 as the input method shows it, key by key.
    const typing = ['ㅈ', '조', '조ㅇ', '조오', '조올', '조옮', '조옮ㄱ', '조옮기', '조옮김'];
    expect(typing.filter((token) => !startsWithTyped('조옮김', token))).toEqual([]);
    expect(startsWithTyped('튜너', '튠')).toBe(true);
    expect(startsWithTyped('화음', '호')).toBe(true);
    expect(startsWithTyped('튜너', '튬')).toBe(false);
    expect(startsWithTyped('튜너', '투')).toBe(false);
    expect(startsWithTyped('튜', '튠')).toBe(false);
    expect(startsWithTyped('export', 'exp')).toBe(true);
    expect(startsWithTyped('export', 'exq')).toBe(false);
  });
});
