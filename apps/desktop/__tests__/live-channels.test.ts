import type { Channel, Song } from '@gp-editor/core';
import { liveChannelChanges } from '../src/lib/live-channels';
import { makeSong } from '../test-support/songs';

const CHANNEL: Channel = { id: 1, name: 'Guitar', program: 25, bank: 0, volume: 127, balance: 64, chorus: 0, reverb: 0, phaser: 0, tremolo: 0, isPercussion: false };
const DRUMS: Channel = { ...CHANNEL, id: 2, name: 'Drums', program: 0, bank: 128, isPercussion: true };

/** Two tracks: a guitar on channel 1 (MIDI channels 0 and 1) and drums on channel 2 (MIDI channel 9). */
function song(channels: readonly Channel[] = [CHANNEL, DRUMS]): Song {
  const base = makeSong([[]]);
  const guitar = base.tracks[0]!;
  return { ...base, channels, tracks: [guitar, { ...guitar, number: 2, channelId: 2, isPercussion: true }] };
}

describe('liveChannelChanges', () => {
  it('switches both MIDI channels of a track whose instrument changed', () => {
    // Arrange
    const played = song();
    const next = song([{ ...CHANNEL, program: 30 }, DRUMS]);

    // Act
    const changes = liveChannelChanges(played, next);

    // Assert
    expect(changes).toEqual([
      { kind: 'program', midiChannel: 0, value: 30 },
      { kind: 'program', midiChannel: 1, value: 30 },
    ]);
  });

  it('sends volume (controller 7) and pan (controller 10) changes, drums included', () => {
    // Arrange
    const played = song();
    const next = song([{ ...CHANNEL, volume: 90 }, { ...DRUMS, balance: 20 }]);

    // Act
    const changes = liveChannelChanges(played, next);

    // Assert
    expect(changes).toEqual([
      { kind: 'controller', midiChannel: 0, controller: 7, value: 90 },
      { kind: 'controller', midiChannel: 1, controller: 7, value: 90 },
      { kind: 'controller', midiChannel: 9, controller: 10, value: 20 },
    ]);
  });

  it('has nothing to do when no channel setting changed', () => {
    expect(liveChannelChanges(song(), song())).toEqual([]);
  });

  it('needs a restart when a channel was added or a track moved to another channel', () => {
    const played = song();
    const added = song([CHANNEL, DRUMS, { ...CHANNEL, id: 3, program: 30 }]);
    const moved = { ...added, tracks: added.tracks.map((track, index) => (index === 0 ? { ...track, channelId: 3 } : track)) };
    expect(liveChannelChanges(played, added)).toBeUndefined();
    expect(liveChannelChanges(played, moved)).toBeUndefined();
  });

  it('needs a restart when a channel turned into a percussion channel or back', () => {
    expect(liveChannelChanges(song(), song([{ ...CHANNEL, isPercussion: true }, DRUMS]))).toBeUndefined();
  });

  it('needs a restart when a track was muted or soloed (the rendered song left those notes out or in)', () => {
    const played = song();
    const muted = { ...played, tracks: played.tracks.map((track, index) => (index === 1 ? { ...track, mute: true } : track)) };
    const soloed = { ...played, tracks: played.tracks.map((track, index) => (index === 0 ? { ...track, solo: true } : track)) };
    expect(liveChannelChanges(played, muted)).toBeUndefined();
    expect(liveChannelChanges(played, soloed)).toBeUndefined();
  });
});
