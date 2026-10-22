import type { Channel, Song } from '@gp-editor/core';
import { liveProgramChanges } from '../src/lib/live-programs';
import { makeSong } from '../test-support/songs';

const CHANNEL: Channel = { id: 1, name: 'Guitar', program: 25, bank: 0, volume: 127, balance: 64, chorus: 0, reverb: 0, phaser: 0, tremolo: 0, isPercussion: false };
const DRUMS: Channel = { ...CHANNEL, id: 2, name: 'Drums', program: 0, bank: 128, isPercussion: true };

/** Two tracks: a guitar on channel 1 (MIDI channels 0 and 1) and drums on channel 2 (MIDI channel 9). */
function song(channels: readonly Channel[] = [CHANNEL, DRUMS]): Song {
  const base = makeSong([[]]);
  const guitar = base.tracks[0]!;
  return { ...base, channels, tracks: [guitar, { ...guitar, number: 2, channelId: 2, isPercussion: true }] };
}

describe('liveProgramChanges', () => {
  it('switches both MIDI channels of a track whose instrument changed', () => {
    // Arrange
    const played = song();
    const next = song([{ ...CHANNEL, program: 30 }, DRUMS]);

    // Act
    const changes = liveProgramChanges(played, next);

    // Assert
    expect(changes).toEqual([{ midiChannel: 0, program: 30 }, { midiChannel: 1, program: 30 }]);
  });

  it('has nothing to do when no program changed', () => {
    expect(liveProgramChanges(song(), song())).toEqual([]);
  });

  it('needs a restart when a channel was added or a track moved to another channel', () => {
    const played = song();
    const added = song([CHANNEL, DRUMS, { ...CHANNEL, id: 3, program: 30 }]);
    const moved = { ...added, tracks: added.tracks.map((track, index) => (index === 0 ? { ...track, channelId: 3 } : track)) };
    expect(liveProgramChanges(played, added)).toBeUndefined();
    expect(liveProgramChanges(played, moved)).toBeUndefined();
  });

  it('needs a restart when a channel turned into a percussion channel or back', () => {
    expect(liveProgramChanges(song(), song([{ ...CHANNEL, isPercussion: true }, DRUMS]))).toBeUndefined();
  });
});
