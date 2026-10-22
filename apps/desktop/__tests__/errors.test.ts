import { errorMessage } from '../src/lib/errors';

describe('errorMessage', () => {
  it("returns an Error's message", () => {
    expect(errorMessage(new Error('Disk full'), 'Could not save')).toBe('Disk full');
  });

  it('returns the fallback for anything that is not an Error', () => {
    expect(errorMessage({ code: 1 }, 'Could not save')).toBe('Could not save');
  });

  it('turns a thrown value into text when there is no fallback', () => {
    expect(errorMessage('timeout')).toBe('timeout');
  });
});
