import { DEFAULT_CHANNEL, type Song } from '@gp-editor/core';
import { previewSound } from '../src/lib/note-preview';
import { makeSong } from '../test-support/songs';

/** Two tracks: a distortion guitar on channel 1, a bass on channel 2. */
function twoTracks(): Song {
  const base = makeSong([[]]);
  const track = base.tracks[0]!;
  return {
    ...base,
    channels: [
      { ...DEFAULT_CHANNEL, id: 1, program: 30 },
      { ...DEFAULT_CHANNEL, id: 2, program: 33 },
    ],
    tracks: [
      { ...track, channelId: 1 },
      { ...track, number: 2, channelId: 2 },
    ],
  };
}

describe('previewSound', () => {
  it('plays a track’s note on the MIDI channel and program its playback uses', () => {
    // Act / Assert: each melodic channel takes two MIDI channels (the second for bends)
    expect(previewSound(twoTracks(), 0)).toEqual({ midiChannel: 0, program: 30 });
    expect(previewSound(twoTracks(), 1)).toEqual({ midiChannel: 2, program: 33 });
  });

  it('has no sound for a track without a channel or a missing track', () => {
    expect(previewSound(makeSong([[]]), 0)).toBeUndefined();
    expect(previewSound(twoTracks(), 5)).toBeUndefined();
  });
});
