import { jumpTarget } from '../src/state/app-command';

describe('jumpTarget', () => {
  it('goes to the first, previous, next and last bar', () => {
    expect(jumpTarget('first', 5, 10)).toBe(0);
    expect(jumpTarget('previous', 5, 10)).toBe(4);
    expect(jumpTarget('next', 5, 10)).toBe(6);
    expect(jumpTarget('last', 5, 10)).toBe(9);
  });

  it('stays inside the song', () => {
    expect(jumpTarget('previous', 0, 10)).toBe(0);
    expect(jumpTarget('next', 9, 10)).toBe(9);
    expect(jumpTarget('last', 0, 0)).toBe(0);
  });
});
