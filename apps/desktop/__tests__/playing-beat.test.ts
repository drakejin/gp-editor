import { playingBeatAt, samePlayingBeat } from '../src/lib/playing-beat';
import { beat, makeSong, note } from '../test-support/songs';

const song = makeSong([[beat(960, [note(1, 0)]), beat(1920, [note(1, 2)])]]);

describe('playingBeatAt', () => {
  it('returns the last beat starting at or before the tick', () => {
    expect(playingBeatAt(song, 0, { headerIndex: 0, tick: 960 })).toEqual({ measureIndex: 0, beatIndex: 0 });
    expect(playingBeatAt(song, 0, { headerIndex: 0, tick: 2500 })).toEqual({ measureIndex: 0, beatIndex: 1 });
  });

  it('returns undefined before the first beat or outside the song', () => {
    expect(playingBeatAt(song, 0, { headerIndex: 0, tick: 100 })).toBeUndefined();
    expect(playingBeatAt(song, 0, { headerIndex: 5, tick: 960 })).toBeUndefined();
  });

  it('compares playing beats', () => {
    expect(samePlayingBeat({ measureIndex: 1, beatIndex: 2 }, { measureIndex: 1, beatIndex: 2 })).toBe(true);
    expect(samePlayingBeat({ measureIndex: 1, beatIndex: 2 }, undefined)).toBe(false);
    expect(samePlayingBeat(undefined, undefined)).toBe(true);
  });
});
