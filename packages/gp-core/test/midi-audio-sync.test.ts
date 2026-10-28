import { describe, expect, it } from 'vitest';
import { buildAudioTrack } from '../src/audio-track/audio-track';
import { renderMidi } from '../src/midi/render-midi';
import { positionAt } from '../src/midi/timeline';
import { type AudioSyncPoint, QUARTER_TIME, type Song } from '../src/model/song';
import { eventsOf, playedNotes, readMidi } from './helpers/midi-reader';
import { type HeaderSpec, makeSong, note } from './helpers/midi-song';

/** MIDI file ticks per quarter note (MIDI_PPQ). */
const PPQ = 960;

function at(measureIndex: number, seconds: number, extra: Partial<AudioSyncPoint> = {}): AudioSyncPoint {
  return { measureIndex, occurrence: 0, position: 0, seconds, ...extra };
}

/** `count` bars of 4/4 at 120 BPM, a quarter note at the start of each, and an audio track with `points`. */
function songWith(count: number, points: readonly AudioSyncPoint[], headers?: readonly HeaderSpec[], solo = false): Song {
  const song = makeSong({ headers, tracks: [{ measures: Array.from({ length: count }, () => [{ notes: [note({ fret: 0, string: 1 })] }]) }] });
  return { ...song, audioTrack: buildAudioTrack({ assetId: 'take', syncPoints: points, solo }) };
}

function seconds(song: Song, options: Parameters<typeof renderMidi>[1]): number[] {
  return renderMidi(song, options).timeline.map((entry) => Math.round(entry.seconds * 1000) / 1000);
}

describe('playback following the audio track', () => {
  it('plays the bars at the pace of the sync points and lays the audio under them', () => {
    // Arrange: two bars in five seconds (96 BPM)
    const song = songWith(4, [at(0, 1), at(2, 6)]);

    // Act
    const render = renderMidi(song, { syncToAudioTrack: true });

    // Assert
    expect(seconds(song, { syncToAudioTrack: true })).toEqual([0, 2.5, 5, 7.5]);
    expect(render.timeline.map((entry) => entry.tempo)).toEqual([96, 96, 96, 96]);
    expect(eventsOf(readMidi(render.bytes), 0, 'tempo')).toEqual([{ kind: 'tempo', tick: 0, usq: 625000 }]);
    expect(render.audioRuns).toEqual([{ atSeconds: 0, fromSeconds: 1, toSeconds: 11, rate: 1 }]);
  });

  it('slows the score and the audio together at the practice speed', () => {
    // Arrange
    const song = songWith(4, [at(0, 1), at(2, 6)]);

    // Act
    const render = renderMidi(song, { syncToAudioTrack: true, passTempoScales: [0.5] });

    // Assert
    expect(seconds(song, { syncToAudioTrack: true, passTempoScales: [0.5] })).toEqual([0, 5, 10, 15]);
    expect(render.audioRuns).toEqual([{ atSeconds: 0, fromSeconds: 1, toSeconds: 11, rate: 0.5 }]);
  });

  it('changes the tempo inside a bar at a sync point there', () => {
    // Arrange: the first half bar in 1.5 s (80 BPM), the second in 2.5 s (48 BPM)
    const song = songWith(2, [at(0, 0), at(0, 1.5, { position: 0.5 }), at(1, 4)]);

    // Act
    const render = renderMidi(song, { syncToAudioTrack: true });
    const halfway = positionAt(render.timeline, 1.5);

    // Assert
    expect(eventsOf(readMidi(render.bytes), 0, 'tempo')).toEqual([
      { kind: 'tempo', tick: 0, usq: 750000 },
      { kind: 'tempo', tick: 2 * PPQ, usq: 1250000 },
    ]);
    expect(render.timeline[1]?.seconds).toBeCloseTo(4, 9);
    expect(halfway).toEqual({ headerIndex: 0, tick: QUARTER_TIME + 2 * QUARTER_TIME });
    expect(positionAt(render.timeline, 2.75)?.tick).toBe(QUARTER_TIME + 3 * QUARTER_TIME);
  });

  it('plays the audio again from the loop’s first bar on every pass', () => {
    // Arrange
    const song = songWith(4, [at(0, 0), at(3, 6)]);

    // Act
    const render = renderMidi(song, { syncToAudioTrack: true, fromHeaderIndex: 1, toHeaderIndex: 2, passTempoScales: [1, 0.5] });

    // Assert
    expect(render.audioRuns).toEqual([
      { atSeconds: 0, fromSeconds: 2, toSeconds: 6, rate: 1 },
      { atSeconds: 4, fromSeconds: 2, toSeconds: 6, rate: 0.5 },
    ]);
  });

  it('starts the audio where the bar playback starts from is heard', () => {
    // Arrange
    const song = songWith(4, [at(0, 3)]);

    // Act
    const render = renderMidi(song, { syncToAudioTrack: true, fromHeaderIndex: 2 });

    // Assert
    expect(render.audioRuns).toEqual([{ atSeconds: 0, fromSeconds: 7, toSeconds: 11, rate: 1 }]);
  });

  it('follows a later occurrence of a repeated bar to its own place in the audio', () => {
    // Arrange: bars 1–2 twice, then bar 3; the second time through is slower in the recording
    const headers: HeaderSpec[] = [{ repeatOpen: true }, { repeatClose: 1 }, {}];
    const song = songWith(3, [at(0, 0), at(0, 4, { occurrence: 1 }), at(2, 14)], headers);

    // Act
    const render = renderMidi(song, { syncToAudioTrack: true });

    // Assert
    expect(render.timeline.map((entry) => [entry.headerIndex, entry.seconds, entry.tempo])).toEqual([
      [0, 0, 120],
      [1, 2, 120],
      [0, 4, 48],
      [1, 9, 48],
      [2, 14, 48],
    ]);
    expect(render.audioRuns).toEqual([{ atSeconds: 0, fromSeconds: 0, toSeconds: 19, rate: 1 }]);
  });

  it('renders as before without the option, and gives no audio runs', () => {
    // Arrange
    const song = songWith(4, [at(0, 1), at(2, 6)]);
    const { audioTrack: _audioTrack, ...withoutTrack } = song;

    // Act
    const render = renderMidi(song);

    // Assert
    expect(render.bytes).toEqual(renderMidi(withoutTrack).bytes);
    expect(render.audioRuns).toBeUndefined();
    expect(renderMidi(withoutTrack, { syncToAudioTrack: true }).audioRuns).toBeUndefined();
  });

  it('plays only the audio when the audio track is solo', () => {
    // Arrange
    const song = songWith(2, [], undefined, true);

    // Act
    const notes = playedNotes(readMidi(renderMidi(song, { syncToAudioTrack: true }).bytes));

    // Assert
    expect(notes).toEqual([]);
    expect(playedNotes(readMidi(renderMidi(song).bytes))).toHaveLength(2);
  });
});
