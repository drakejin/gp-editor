import { buildAudioTrack, buildSyncMap, type Song } from '@gp-editor/core';
import {
  AUDIO_LANE,
  type AudioLaneInput,
  draggedSeconds,
  engraveAudioLane,
  hitTestAudioLane,
  laneWidth,
  laneWindow,
  laneX,
  scrollToShow,
} from '../src/score/audio-lane';
import { makeSong } from '../test-support/songs';
import { PALETTE as TEST_PALETTE } from '../test-support/score-helpers';

/** Four bars of 4/4 at 120 BPM; sync points put bar 1 at 1 s and bar 3 at 6 s (two bars in five seconds). */
function syncedSong(): Song {
  const points = [
    { measureIndex: 0, occurrence: 0, position: 0, seconds: 1 },
    { measureIndex: 2, occurrence: 0, position: 0, seconds: 6 },
  ];
  return { ...makeSong([[], [], [], []]), audioTrack: buildAudioTrack({ assetId: 'take', syncPoints: points }) };
}

const PPS = 40;

function input(extra: Partial<AudioLaneInput> = {}): AudioLaneInput {
  const song = syncedSong();
  return {
    map: buildSyncMap(song),
    points: song.audioTrack?.syncPoints ?? [],
    durationSeconds: 12,
    pixelsPerSecond: PPS,
    barNumbers: [1, 2, 3, 4],
    fromX: 0,
    toX: 600,
    palette: TEST_PALETTE,
    ...extra,
  };
}

describe('audio lane geometry', () => {
  it('lays the audio out in pixels per second and spans the audio or the score, whichever is longer', () => {
    // Arrange
    const map = buildSyncMap(syncedSong());

    // Act / Assert
    expect(laneX(2, PPS)).toBe(AUDIO_LANE.padLeft + 80);
    expect(laneWidth(map, 12, PPS)).toBe(AUDIO_LANE.padLeft + 480 + AUDIO_LANE.padRight);
    expect(laneWidth(map, 3, PPS)).toBe(AUDIO_LANE.padLeft + 11 * PPS + AUDIO_LANE.padRight);
  });

  it('draws three screens around the scroll position, moving a screen at a time', () => {
    // Arrange / Act / Assert
    expect(laneWindow(0, 500, 5000)).toEqual({ fromX: 0, toX: 1500 });
    expect(laneWindow(1200, 500, 5000)).toEqual({ fromX: 500, toX: 2000 });
    expect(laneWindow(4800, 500, 5000)).toEqual({ fromX: 4000, toX: 5000 });
  });

  it('scrolls only when a moment leaves the view', () => {
    // Arrange / Act / Assert
    expect(scrollToShow(300, 0, 600)).toBeUndefined();
    expect(scrollToShow(900, 0, 600)).toBe(700);
    expect(scrollToShow(10, 500, 600)).toBe(0);
  });
});

describe('hitTestAudioLane', () => {
  it('takes the nearest marker within reach', () => {
    // Arrange
    const map = buildSyncMap(syncedSong());

    // Act / Assert
    expect(hitTestAudioLane(map, PPS, laneX(6, PPS) + 3)).toEqual({ kind: 'marker', pointIndex: 1 });
    expect(hitTestAudioLane(map, PPS, laneX(1, PPS) - 4)).toEqual({ kind: 'marker', pointIndex: 0 });
  });

  it('gives the moment of the audio and the bar heard there elsewhere', () => {
    // Arrange
    const map = buildSyncMap(syncedSong());

    // Act
    const hit = hitTestAudioLane(map, PPS, laneX(4, PPS));

    // Assert
    expect(hit).toEqual({ kind: 'audio', seconds: 4, measureIndex: 1, occurrence: 0 });
  });

  it('gives only the moment outside the score', () => {
    // Arrange
    const map = buildSyncMap(syncedSong());

    // Act / Assert
    expect(hitTestAudioLane(map, PPS, laneX(0.2, PPS))).toEqual({ kind: 'audio', seconds: 0.2 });
  });
});

describe('dragging a marker', () => {
  it('keeps the point between its neighbours', () => {
    // Arrange
    const range = { min: 1, max: 6 };

    // Act / Assert
    expect(draggedSeconds(laneX(3, PPS), PPS, range)).toBe(3);
    expect(draggedSeconds(laneX(9, PPS), PPS, range)).toBe(6 - 1 / PPS);
    expect(draggedSeconds(laneX(0, PPS), PPS, range)).toBe(1 + 1 / PPS);
    expect(draggedSeconds(laneX(-2, PPS), PPS, { min: 0, max: 6 })).toBe(0);
  });
});

describe('engraveAudioLane', () => {
  it('draws the waveform as one polygon over the audio, the bars with their numbers and a marker per sync point', () => {
    // Arrange: a loud first second, then silence
    const values = new Int8Array(24).map((_, index) => (index < 4 ? (index % 2 === 0 ? -100 : 100) : 0));
    const peaks = { bucketsPerSecond: 2, durationSeconds: 6, values };

    // Act
    const commands = engraveAudioLane(input({ peaks, cursorMeasureIndex: 1, selectedPointIndex: 1, playingSeconds: 2 }));

    // Assert
    const texts = commands.filter((command) => command.kind === 'text').map((command) => (command.kind === 'text' ? command.text : ''));
    expect(texts).toEqual(['1', '2', '3', '4']);
    expect(commands.filter((command) => command.kind === 'polygon')).toHaveLength(3);
    const tint = commands.find((command) => command.kind === 'rect' && command.color.endsWith('40'));
    expect(tint).toMatchObject({ x: laneX(3.5, PPS), width: 2.5 * PPS });
    expect(commands.at(-1)).toMatchObject({ kind: 'line', x1: laneX(2, PPS) });
  });

  it('draws nothing of a waveform not loaded yet, nor markers outside its window', () => {
    // Arrange / Act
    const commands = engraveAudioLane(input({ fromX: 400, toX: 600 }));

    // Assert
    expect(commands.filter((command) => command.kind === 'polygon')).toHaveLength(0);
    expect(commands[0]).toMatchObject({ kind: 'rect', x: 0, width: 200 });
  });
});
