import { showsStaff, toggleStaff } from '../src/score/geometry';

describe('toggleStaff', () => {
  it('turns standard notation or tablature off while the other stays', () => {
    expect(toggleStaff('notationAndTab', 'standard')).toBe('tab');
    expect(toggleStaff('notationAndTab', 'tab')).toBe('notation');
  });

  it('turns one back on', () => {
    expect(toggleStaff('tab', 'standard')).toBe('notationAndTab');
    expect(toggleStaff('notation', 'tab')).toBe('notationAndTab');
  });

  it('keeps the last staff shown (one must stay on)', () => {
    expect(toggleStaff('tab', 'tab')).toBe('tab');
    expect(toggleStaff('notation', 'standard')).toBe('notation');
  });

  it('says which staves a mode shows', () => {
    expect(showsStaff('notationAndTab', 'standard')).toBe(true);
    expect(showsStaff('tab', 'standard')).toBe(false);
    expect(showsStaff('notation', 'tab')).toBe(false);
  });
});
