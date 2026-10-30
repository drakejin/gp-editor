import { pitchName, pitchNameInKey, tuningLabel } from '../src/lib/pitch';

describe('pitch', () => {
  it('names MIDI pitches and tunings', () => {
    expect(pitchName(64)).toBe('E4');
    expect(pitchName(40)).toBe('E2');
    expect(tuningLabel([64, 59, 55, 50, 45, 40])).toBe('E A D G B E');
  });

  it('names black keys with flats in a key with flats, else with sharps', () => {
    expect(pitchNameInKey(58, -2)).toBe('Bb3');
    expect(pitchNameInKey(58, 0)).toBe('A#3');
    expect(pitchNameInKey(61, 3)).toBe('C#4');
    expect(pitchNameInKey(60, -1)).toBe('C4');
  });
});
