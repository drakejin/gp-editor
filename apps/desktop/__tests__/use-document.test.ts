import { canOverwrite, gp5Name } from '../src/hooks/use-document';

describe('save helpers', () => {
  it('names the saved file .gp5', () => {
    expect(gp5Name('Song.gpx')).toBe('Song.gp5');
    expect(gp5Name('my.song.gp')).toBe('my.song.gp5');
    expect(gp5Name('noext')).toBe('noext.gp5');
  });

  it('overwrites only GP5 documents', () => {
    expect(canOverwrite('/a/Song.gp5')).toBe(true);
    expect(canOverwrite('/a/Song.GP5')).toBe(true);
    expect(canOverwrite('/a/Song.gpx')).toBe(false);
    expect(canOverwrite('/a/Song.gp')).toBe(false);
  });
});
