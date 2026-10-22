import { withoutExtension } from '../src/lib/file-name';

describe('withoutExtension', () => {
  it('drops the last extension only', () => {
    expect(withoutExtension('Song.gpx')).toBe('Song');
    expect(withoutExtension('my.song.gp')).toBe('my.song');
  });

  it('keeps a name without an extension, or a dot file, as it is', () => {
    expect(withoutExtension('noext')).toBe('noext');
    expect(withoutExtension('.hidden')).toBe('.hidden');
    expect(withoutExtension('')).toBe('');
  });
});
