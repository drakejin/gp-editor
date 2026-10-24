import { describe, expect, it } from 'vitest';
import {
  AUDIO_TRACK_NAME,
  DEFAULT_AUDIO_VOLUME,
  MAX_DETUNE_CENTS,
  MAX_SYNC_POINTS,
  buildAudioTrack,
  fileExtensionOf,
  isValidSyncPoint,
  normalizeFileExtension,
  normalizeSyncPoints,
} from '../src/audio-track/audio-track';
import type { AudioSyncPoint } from '../src/model/song';

function point(measureIndex: number, seconds: number, extra: Partial<AudioSyncPoint> = {}): AudioSyncPoint {
  return { measureIndex, occurrence: 0, position: 0, seconds, ...extra };
}

describe('buildAudioTrack', () => {
  it('gives a new audio track Guitar Pro’s defaults', () => {
    // Arrange / Act
    const track = buildAudioTrack({ assetId: 'abc' });

    // Assert
    expect(track).toEqual({
      assetId: 'abc',
      fileExtension: '',
      originalFilePath: '',
      name: AUDIO_TRACK_NAME,
      volume: DEFAULT_AUDIO_VOLUME,
      mute: false,
      solo: false,
      detuneCents: 0,
      startSeconds: 0,
      syncPoints: [],
    });
  });

  it('clamps the volume and the detune and rounds the cents', () => {
    // Arrange / Act
    const loud = buildAudioTrack({ assetId: 'a', volume: 3, detuneCents: 99_999.4 });
    const quiet = buildAudioTrack({ assetId: 'a', volume: -1, detuneCents: -12.6 });

    // Assert
    expect(loud.volume).toBe(1);
    expect(loud.detuneCents).toBe(MAX_DETUNE_CENTS);
    expect(quiet.volume).toBe(0);
    expect(quiet.detuneCents).toBe(-13);
  });

  it('replaces numbers that are not finite with the defaults', () => {
    // Arrange / Act
    const track = buildAudioTrack({ assetId: 'a', volume: Number.NaN, detuneCents: Number.POSITIVE_INFINITY, startSeconds: Number.NaN });

    // Assert
    expect(track.volume).toBe(DEFAULT_AUDIO_VOLUME);
    expect(track.detuneCents).toBe(0);
    expect(track.startSeconds).toBe(0);
  });

  it('keeps a negative start (the score starts before the audio)', () => {
    // Arrange / Act
    const track = buildAudioTrack({ assetId: 'a', startSeconds: -1.5 });

    // Assert
    expect(track.startSeconds).toBe(-1.5);
  });

  it('names a blank name after Guitar Pro and trims the others', () => {
    // Arrange / Act / Assert
    expect(buildAudioTrack({ assetId: 'a', name: '   ' }).name).toBe(AUDIO_TRACK_NAME);
    expect(buildAudioTrack({ assetId: 'a', name: ' Band take 3 ' }).name).toBe('Band take 3');
  });

  it('refuses a blank asset id', () => {
    // Arrange / Act / Assert
    expect(() => buildAudioTrack({ assetId: ' ' })).toThrow(RangeError);
  });

  it('keeps the extension lower case and drops one that is not a plain extension', () => {
    // Arrange / Act / Assert
    expect(buildAudioTrack({ assetId: 'a', fileExtension: 'MP3' }).fileExtension).toBe('mp3');
    expect(buildAudioTrack({ assetId: 'a', fileExtension: '../x' }).fileExtension).toBe('');
  });
});

describe('file extensions', () => {
  it('reads the extension of a path with either separator', () => {
    // Arrange / Act / Assert
    expect(fileExtensionOf('C:/Users/Daniel/Canon Rock.OGG')).toBe('ogg');
    expect(fileExtensionOf('C:\\take.Wav')).toBe('wav');
    expect(fileExtensionOf('/tmp/no-extension')).toBe('');
    expect(fileExtensionOf('/tmp/.hidden')).toBe('');
  });

  it('takes an extension with or without its dot', () => {
    // Arrange / Act / Assert
    expect(normalizeFileExtension('.M4A')).toBe('m4a');
    expect(normalizeFileExtension('a very long one')).toBe('');
  });
});

describe('sync points', () => {
  it('accepts whole bars and occurrences, places inside the bar and moments of the audio', () => {
    // Arrange / Act / Assert
    expect(isValidSyncPoint(point(0, 0))).toBe(true);
    expect(isValidSyncPoint(point(3, 1.5, { position: 1, occurrence: 2 }))).toBe(true);
    expect(isValidSyncPoint(point(-1, 1))).toBe(false);
    expect(isValidSyncPoint(point(1.5, 1))).toBe(false);
    expect(isValidSyncPoint(point(1, 1, { occurrence: -1 }))).toBe(false);
    expect(isValidSyncPoint(point(1, 1, { position: 1.01 }))).toBe(false);
    expect(isValidSyncPoint(point(1, -0.1))).toBe(false);
    expect(isValidSyncPoint(point(1, Number.NaN))).toBe(false);
  });

  it('sorts the points by their moment in the audio, dropping invalid ones', () => {
    // Arrange
    const points = [point(4, 8), point(-2, 1), point(0, 0.5), point(2, 4)];

    // Act
    const normalized = normalizeSyncPoints(points);

    // Assert
    expect(normalized.map((each) => each.measureIndex)).toEqual([0, 2, 4]);
  });

  it('keeps one point per place of the score: the earliest in the audio', () => {
    // Arrange
    const points = [point(2, 5), point(2, 4), point(2, 6, { position: 0.5 })];

    // Act
    const normalized = normalizeSyncPoints(points);

    // Assert
    expect(normalized).toEqual([point(2, 4), point(2, 6, { position: 0.5 })]);
  });

  it('keeps no more than MAX_SYNC_POINTS', () => {
    // Arrange
    const points = Array.from({ length: MAX_SYNC_POINTS + 5 }, (_, index) => point(index, index));

    // Act
    const normalized = normalizeSyncPoints(points);

    // Assert
    expect(normalized).toHaveLength(MAX_SYNC_POINTS);
  });

  it('copies only the model fields of a point', () => {
    // Arrange
    const extra = { ...point(1, 2), color: 'red' } as AudioSyncPoint;

    // Act
    const [normalized] = normalizeSyncPoints([extra]);

    // Assert
    expect(normalized).toEqual(point(1, 2));
  });
});
