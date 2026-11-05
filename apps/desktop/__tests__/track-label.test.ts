import { trackLabel } from '../src/lib/track-label';
import { makeSong } from '../test-support/songs';

describe('trackLabel', () => {
  const track = makeSong([[]]).tracks[0]!;

  it('names a track by its name, without the spaces around it', () => {
    expect(trackLabel({ ...track, name: '  Lead guitar ' })).toBe('Lead guitar');
  });

  it('names a track without a name by its number', () => {
    expect(trackLabel({ ...track, name: '', number: 3 })).toBe('Track 3');
  });
});
