import { describe, expect, it } from 'vitest';
import { buildAudioTrack } from '../src/audio-track/audio-track';
import {
  canSetAudioSyncPoint,
  deleteAudioSyncPoint,
  moveAudioSyncPoint,
  setAudioSyncPoint,
  setAudioTrack,
  setAudioTrackMix,
  syncPointSecondsRange,
} from '../src/edit/audio-track';
import { deleteMeasure, insertMeasure } from '../src/edit/measures';
import type { AudioSyncPoint, Song } from '../src/model/song';
import { buildSong, rest } from './helpers/edit-songs';

function bars(count: number): Song {
  return buildSong({ tracks: [Array.from({ length: count }, () => [[rest(1)]])] });
}

function at(measureIndex: number, seconds: number, extra: Partial<AudioSyncPoint> = {}): AudioSyncPoint {
  return { measureIndex, occurrence: 0, position: 0, seconds, ...extra };
}

function withPoints(count: number, points: readonly AudioSyncPoint[]): Song {
  return setAudioTrack(bars(count), buildAudioTrack({ assetId: 'take', syncPoints: points }));
}

describe('setAudioTrack', () => {
  it('adds, replaces and removes the song’s audio track', () => {
    // Arrange
    const song = bars(2);

    // Act
    const added = setAudioTrack(song, buildAudioTrack({ assetId: 'first' }));
    const replaced = setAudioTrack(added, buildAudioTrack({ assetId: 'second', volume: 5 }));
    const removed = setAudioTrack(replaced, undefined);

    // Assert
    expect(added.audioTrack?.assetId).toBe('first');
    expect(replaced.audioTrack).toMatchObject({ assetId: 'second', volume: 1 });
    expect(removed.audioTrack).toBeUndefined();
    expect('audioTrack' in removed).toBe(false);
  });

  it('returns the same song when there is nothing to remove', () => {
    // Arrange
    const song = bars(1);

    // Act / Assert
    expect(setAudioTrack(song, undefined)).toBe(song);
  });
});

describe('setAudioTrackMix', () => {
  it('sets volume, mute, solo, detune and name within their bounds', () => {
    // Arrange
    const song = withPoints(2, []);

    // Act
    const mixed = setAudioTrackMix(song, { volume: 0.5, mute: true, solo: true, detuneCents: 3000, name: 'Take 2' });

    // Assert
    expect(mixed.audioTrack).toMatchObject({ volume: 0.5, mute: true, solo: true, detuneCents: 2400, name: 'Take 2' });
  });

  it('returns the same song without an audio track or without a change', () => {
    // Arrange
    const song = bars(1);
    const withTrack = withPoints(1, []);

    // Act / Assert
    expect(setAudioTrackMix(song, { mute: true })).toBe(song);
    expect(setAudioTrackMix(withTrack, { mute: false })).toBe(withTrack);
  });
});

describe('sync points', () => {
  it('adds a point between the others and keeps them in order', () => {
    // Arrange
    const song = withPoints(8, [at(0, 1), at(4, 9)]);

    // Act
    const next = setAudioSyncPoint(song, at(2, 5));

    // Assert
    expect(next.audioTrack?.syncPoints.map((point) => point.measureIndex)).toEqual([0, 2, 4]);
  });

  it('replaces the point already at that place of the score', () => {
    // Arrange
    const song = withPoints(8, [at(0, 1), at(2, 5), at(4, 9)]);

    // Act
    const next = setAudioSyncPoint(song, at(2, 6));

    // Assert
    expect(next.audioTrack?.syncPoints).toEqual([at(0, 1), at(2, 6), at(4, 9)]);
  });

  it('refuses a point against the order of the others, or on a bar that does not play that often', () => {
    // Arrange
    const song = withPoints(8, [at(0, 1), at(4, 9)]);

    // Act / Assert
    expect(canSetAudioSyncPoint(song, at(2, 10))).toBe(false);
    expect(canSetAudioSyncPoint(song, at(6, 8))).toBe(false);
    expect(canSetAudioSyncPoint(song, at(2, 5, { occurrence: 1 }))).toBe(false);
    expect(canSetAudioSyncPoint(song, at(4, 9, { position: 0 }))).toBe(true);
    expect(setAudioSyncPoint(song, at(2, 10))).toBe(song);
  });

  it('refuses a point without an audio track or outside the bounds of a point', () => {
    // Arrange
    const song = bars(2);
    const withTrack = withPoints(2, []);

    // Act / Assert
    expect(canSetAudioSyncPoint(song, at(0, 1))).toBe(false);
    expect(canSetAudioSyncPoint(withTrack, at(0, -1))).toBe(false);
    expect(canSetAudioSyncPoint(withTrack, at(0, 1, { position: 2 }))).toBe(false);
  });

  it('deletes a point', () => {
    // Arrange
    const song = withPoints(8, [at(0, 1), at(2, 5), at(4, 9)]);

    // Act
    const next = deleteAudioSyncPoint(song, 1);

    // Assert
    expect(next.audioTrack?.syncPoints).toEqual([at(0, 1), at(4, 9)]);
    expect(deleteAudioSyncPoint(song, 7)).toBe(song);
  });

  it('moves a point in the audio between its neighbours only', () => {
    // Arrange
    const song = withPoints(8, [at(0, 1), at(2, 5), at(4, 9)]);

    // Act
    const moved = moveAudioSyncPoint(song, 1, 6.5);

    // Assert
    expect(moved.audioTrack?.syncPoints[1]?.seconds).toBe(6.5);
    expect(syncPointSecondsRange(song, 1)).toEqual({ min: 1, max: 9 });
    expect(syncPointSecondsRange(song, 0)).toEqual({ min: 0, max: 5 });
    expect(syncPointSecondsRange(song, 2)).toEqual({ min: 5, max: Number.POSITIVE_INFINITY });
    expect(moveAudioSyncPoint(song, 1, 9)).toBe(song);
    expect(moveAudioSyncPoint(song, 1, 0.5)).toBe(song);
    expect(syncPointSecondsRange(song, 3)).toBeUndefined();
  });
});

describe('measure edits keep the sync points on their bars', () => {
  it('moves the points of later bars one bar on when a bar is inserted', () => {
    // Arrange
    const song = withPoints(4, [at(0, 1), at(1, 3), at(3, 7)]);

    // Act
    const next = insertMeasure(song, 1, 'before');

    // Assert
    expect(next.audioTrack?.syncPoints.map((point) => point.measureIndex)).toEqual([0, 2, 4]);
  });

  it('drops the points of a deleted bar and moves the later ones back', () => {
    // Arrange
    const song = withPoints(4, [at(0, 1), at(1, 3), at(3, 7)]);

    // Act
    const next = deleteMeasure(song, 1);

    // Assert
    expect(next.audioTrack?.syncPoints.map((point) => point.measureIndex)).toEqual([0, 2]);
  });
});
