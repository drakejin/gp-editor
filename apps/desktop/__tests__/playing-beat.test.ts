import { playingBeatAt, playingTracksAt, samePlayingBeat, samePlayingTracks } from '../src/lib/playing-beat';
import { beat, fromTux, makeSong, note, withTrack } from '../test-support/songs';

const song = makeSong([[beat(960, [note(1, 0)]), beat(1920, [note(1, 2)])]]);

describe('playingBeatAt', () => {
  it('returns the last beat starting at or before the tick', () => {
    expect(playingBeatAt(song, 0, { headerIndex: 0, tick: fromTux(960) })).toEqual({ measureIndex: 0, beatIndex: 0 });
    expect(playingBeatAt(song, 0, { headerIndex: 0, tick: fromTux(2500) })).toEqual({ measureIndex: 0, beatIndex: 1 });
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

describe('playingTracksAt', () => {
  // Track 2: one beat for the whole bar.
  const twoTracks = withTrack(song, [[beat(960, [note(2, 0)])]]);

  it('gives each shown track the beat it is sounding', () => {
    expect(playingTracksAt(twoTracks, [0, 1], { headerIndex: 0, tick: fromTux(2500) })).toEqual({
      0: { measureIndex: 0, beatIndex: 1 },
      1: { measureIndex: 0, beatIndex: 0 },
    });
  });

  it('compares the beats of every track', () => {
    const a = { 0: { measureIndex: 0, beatIndex: 1 }, 1: { measureIndex: 0, beatIndex: 0 } };
    expect(samePlayingTracks(a, { ...a })).toBe(true);
    expect(samePlayingTracks(a, { ...a, 1: { measureIndex: 0, beatIndex: 1 } })).toBe(false);
    expect(samePlayingTracks(a, { 0: a[0] })).toBe(false);
    expect(samePlayingTracks(undefined, undefined)).toBe(true);
  });
});
