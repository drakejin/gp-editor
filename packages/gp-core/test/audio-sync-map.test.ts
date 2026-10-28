import { describe, expect, it } from 'vitest';
import { buildAudioTrack } from '../src/audio-track/audio-track';
import {
  audioSecondsAt,
  buildSyncMap,
  playedBarIndex,
  playedPositionAt,
  scoreSecondsAt,
  syncPointTick,
  tickAtAudioSeconds,
} from '../src/audio-track/sync-map';
import { type AudioSyncPoint, QUARTER_TIME, type Song } from '../src/model/song';
import { buildSong, rest } from './helpers/edit-songs';

/** Ticks of one 4/4 bar. */
const BAR = 4 * QUARTER_TIME;

/** `count` bars of 4/4 (two seconds each at the default 120 BPM), with an audio track holding `points`. */
function songWith(count: number, points: readonly AudioSyncPoint[] = [], extra: { tempos?: number[]; startSeconds?: number } = {}): Song {
  const song = buildSong({ tempos: extra.tempos, tracks: [Array.from({ length: count }, () => [[rest(1)]])] });
  return { ...song, audioTrack: buildAudioTrack({ assetId: 'a', syncPoints: points, startSeconds: extra.startSeconds }) };
}

function at(measureIndex: number, seconds: number, extra: Partial<AudioSyncPoint> = {}): AudioSyncPoint {
  return { measureIndex, occurrence: 0, position: 0, seconds, ...extra };
}

/** Bars 1–2 between repeat signs, played twice, then bar 3. */
function withRepeat(song: Song): Song {
  return {
    ...song,
    measureHeaders: song.measureHeaders.map((header, index) =>
      index === 0 ? { ...header, repeatOpen: true } : index === 1 ? { ...header, repeatClose: 1 } : header,
    ),
  };
}

describe('the played timeline', () => {
  it('lays the bars one after the other from tick 0, at their written tempo', () => {
    // Arrange / Act
    const map = buildSyncMap(songWith(3, [], { tempos: [120, 60, 120] }));

    // Assert
    expect(map.bars.map((bar) => [bar.measureIndex, bar.occurrence, bar.tick, bar.scoreSeconds])).toEqual([
      [0, 0, 0, 0],
      [1, 0, BAR, 2],
      [2, 0, 2 * BAR, 6],
    ]);
    expect(scoreSecondsAt(map, 2.5 * BAR)).toBe(7);
  });

  it('unfolds repeats, counting each bar’s occurrences', () => {
    // Arrange / Act
    const map = buildSyncMap(withRepeat(songWith(3)));

    // Assert
    expect(map.bars.map((bar) => `${bar.measureIndex}.${bar.occurrence}`)).toEqual(['0.0', '1.0', '0.1', '1.1', '2.0']);
    expect(playedBarIndex(map, 0, 1)).toBe(2);
    expect(playedBarIndex(map, 2, 1)).toBeUndefined();
  });

  it('gives the bar, occurrence and place in it of a tick', () => {
    // Arrange
    const map = buildSyncMap(withRepeat(songWith(3)));

    // Act
    const position = playedPositionAt(map, 2.25 * BAR);

    // Assert
    expect(position).toEqual({ playedIndex: 2, measureIndex: 0, occurrence: 1, position: 0.25 });
  });
});

describe('audio time and score ticks', () => {
  it('follows the written tempo from the start offset when there is no sync point', () => {
    // Arrange
    const map = buildSyncMap(songWith(4, [], { startSeconds: 1.5 }));

    // Act / Assert
    expect(audioSecondsAt(map, 0)).toBe(1.5);
    expect(audioSecondsAt(map, 2 * BAR)).toBe(5.5);
    expect(tickAtAudioSeconds(map, 5.5)).toBe(2 * BAR);
  });

  it('follows the written tempo through a single sync point', () => {
    // Arrange
    const map = buildSyncMap(songWith(4, [at(1, 3)]));

    // Act / Assert
    expect(audioSecondsAt(map, 0)).toBe(1);
    expect(audioSecondsAt(map, 3 * BAR)).toBe(7);
    expect(tickAtAudioSeconds(map, 7)).toBe(3 * BAR);
  });

  it('maps linearly between two sync points and keeps their pace past them', () => {
    // Arrange: two bars in five seconds
    const map = buildSyncMap(songWith(6, [at(0, 1), at(2, 6)]));

    // Act / Assert
    expect(audioSecondsAt(map, BAR)).toBe(3.5);
    expect(audioSecondsAt(map, 4 * BAR)).toBe(11);
    expect(audioSecondsAt(map, -BAR)).toBe(-1.5);
    expect(tickAtAudioSeconds(map, 3.5)).toBe(BAR);
    expect(tickAtAudioSeconds(map, 11)).toBe(4 * BAR);
    expect(tickAtAudioSeconds(map, -1.5)).toBe(-BAR);
  });

  it('places a point inside its bar', () => {
    // Arrange
    const map = buildSyncMap(songWith(4, [at(0, 0), at(1, 3, { position: 0.5 }), at(3, 5)]));

    // Act / Assert
    expect(map.anchors.map((anchor) => anchor.tick)).toEqual([0, 1.5 * BAR, 3 * BAR]);
    expect(audioSecondsAt(map, 0.75 * BAR)).toBe(1.5);
  });

  it('places a point on a later occurrence of a repeated bar', () => {
    // Arrange
    const song = withRepeat(songWith(3, [at(0, 0), at(0, 10, { occurrence: 1 })]));
    const map = buildSyncMap(song);

    // Act
    const tick = syncPointTick(map, at(0, 10, { occurrence: 1 }));

    // Assert
    expect(tick).toBe(2 * BAR);
    expect(audioSecondsAt(map, BAR)).toBe(5);
  });

  it('leaves out points of bars that do not play that often and points against the order of the ones before', () => {
    // Arrange: bar 1 comes after bar 3 in the audio but before it in the score
    const map = buildSyncMap(songWith(4, [at(0, 0), at(3, 1), at(1, 2), at(2, 3, { occurrence: 4 })]));

    // Act / Assert
    expect(map.anchors.map((anchor) => anchor.pointIndex)).toEqual([0, 1]);
  });

  it('maps by the written tempo when the song has no audio track', () => {
    // Arrange
    const { audioTrack: _audioTrack, ...song } = songWith(2);

    // Act
    const map = buildSyncMap(song);

    // Assert
    expect(map.anchors).toEqual([]);
    expect(audioSecondsAt(map, BAR)).toBe(2);
  });

  it('extends the first and last bar’s tempo before and after the song', () => {
    // Arrange
    const map = buildSyncMap(songWith(2, [], { tempos: [60, 240] }));

    // Act / Assert
    expect(scoreSecondsAt(map, -BAR)).toBe(-4);
    expect(scoreSecondsAt(map, 3 * BAR)).toBe(6);
    expect(tickAtAudioSeconds(map, 6)).toBe(3 * BAR);
    expect(tickAtAudioSeconds(map, -4)).toBe(-BAR);
  });

  it('maps a song without bars at 120 BPM', () => {
    // Arrange
    const song: Song = { ...songWith(1), measureHeaders: [], tracks: [] };

    // Act
    const map = buildSyncMap(song);

    // Assert
    expect(map.bars).toEqual([]);
    expect(audioSecondsAt(map, QUARTER_TIME)).toBe(0.5);
    expect(tickAtAudioSeconds(map, 0.5)).toBe(QUARTER_TIME);
    expect(playedPositionAt(map, 0)).toBeUndefined();
  });
});
