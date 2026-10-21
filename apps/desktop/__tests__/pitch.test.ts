import { pitchName, tuningLabel } from '../src/lib/pitch';

describe('pitch', () => {
  it('names MIDI pitches and tunings', () => {
    expect(pitchName(64)).toBe('E4');
    expect(pitchName(40)).toBe('E2');
    expect(tuningLabel([64, 59, 55, 50, 45, 40])).toBe('E A D G B E');
  });
});
