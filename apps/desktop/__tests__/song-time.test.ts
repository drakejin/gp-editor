import { formatClock, measureStartSeconds, songSeconds } from '../src/lib/song-time';
import { makeSong } from '../test-support/songs';

describe('song time', () => {
  it('starts each bar after the bars before it, at their tempos', () => {
    // Arrange: 4/4 at 120 BPM lasts 2 s, 4/4 at 60 BPM lasts 4 s
    const base = makeSong([[], [], []]);
    const song = {
      ...base,
      measureHeaders: base.measureHeaders.map((measureHeader, index) => ({ ...measureHeader, tempo: index === 1 ? 60 : 120 })),
    };

    // Act
    const starts = measureStartSeconds(song);

    // Assert
    expect(starts).toEqual([0, 2, 6]);
    expect(songSeconds(song)).toBe(8);
  });

  it('plays slower at a lower playback speed', () => {
    const song = makeSong([[], []]);
    expect(songSeconds(song, 0.5)).toBe(songSeconds(song) * 2);
  });

  it('plays every bar at a locked tempo, whatever is written', () => {
    // Arrange: 120 BPM bars locked at 60 BPM (4 s a bar)
    const song = makeSong([[], [], []]);

    // Act / Assert
    expect(measureStartSeconds(song, 1, 60)).toEqual([0, 4, 8]);
    expect(songSeconds(song, 0.5, 60)).toBe(24);
  });

  it('formats a clock as mm:ss', () => {
    expect(formatClock(0)).toBe('00:00');
    expect(formatClock(61.9)).toBe('01:01');
    expect(formatClock(3725)).toBe('62:05');
  });

  it('has no time for a song without bars', () => {
    const empty = { ...makeSong([[]]), measureHeaders: [] };
    expect(measureStartSeconds(empty)).toEqual([]);
    expect(songSeconds(empty)).toBe(0);
  });
});
