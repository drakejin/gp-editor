import { plural } from '../src/lib/wording';

describe('plural', () => {
  it('uses the singular for one', () => {
    expect(plural(1, 'bar')).toBe('1 bar');
  });

  it('adds an s for none and for more than one', () => {
    expect(plural(0, 'track')).toBe('0 tracks');
    expect(plural(96, 'bar')).toBe('96 bars');
  });
});
