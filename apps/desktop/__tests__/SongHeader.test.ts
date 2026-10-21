import { authorCredits } from '../src/components/SongHeader';

describe('authorCredits', () => {
  it('merges identical words and music credits', () => {
    expect(authorCredits('Carulli', 'Carulli')).toEqual(['Words & Music: Carulli']);
    expect(authorCredits('Marco', 'Nightwish')).toEqual(['Music: Nightwish', 'Words: Marco']);
    expect(authorCredits('', '')).toEqual(['', '']);
  });
});
