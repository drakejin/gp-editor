import { expect } from 'vitest';
import { durationTicks, measureTicks } from '../../src/model/defaults';
import type { Song } from '../../src/model/song';

/**
 * Structural checks every reader's output must pass, whatever the format.
 * Use in each reader's fixture sweep: `assertSongInvariants(readSong(bytes))`.
 */
export function assertSongInvariants(song: Song): void {
  expect(song.measureHeaders.length).toBeGreaterThan(0);
  expect(song.tracks.length).toBeGreaterThan(0);

  song.measureHeaders.forEach((header, index) => {
    expect(header.number).toBe(index + 1);
    expect([1, 2, 4, 8, 16, 32, 64]).toContain(header.timeSignature.denominator);
    expect(header.timeSignature.numerator).toBeGreaterThan(0);
    expect(header.tempo).toBeGreaterThan(0);
    const previous = song.measureHeaders[index - 1];
    if (previous !== undefined) {
      const length = measureTicks(previous.timeSignature.numerator, previous.timeSignature.denominator);
      expect(header.start).toBe(previous.start + length);
    }
  });

  const channelIds = new Set(song.channels.map((channel) => channel.id));
  song.tracks.forEach((track, trackIndex) => {
    expect(track.number).toBe(trackIndex + 1);
    expect(channelIds.has(track.channelId)).toBe(true);
    expect(track.strings.length).toBeGreaterThan(0);
    track.strings.forEach((guitarString, i) => expect(guitarString.number).toBe(i + 1));
    expect(track.measures.length).toBe(song.measureHeaders.length);

    track.measures.forEach((measure, measureIndex) => {
      expect(measure.headerIndex).toBe(measureIndex);
      const header = song.measureHeaders[measureIndex];
      if (header === undefined) {
        throw new Error('unreachable: header count checked above');
      }
      let previousStart = -1;
      for (const beat of measure.beats) {
        expect(beat.start).toBeGreaterThanOrEqual(header.start);
        expect(beat.start).toBeGreaterThanOrEqual(previousStart);
        previousStart = beat.start;
        expect(beat.voices.length).toBeGreaterThan(0);
        for (const voice of beat.voices) {
          expect(durationTicks(voice.duration)).toBeGreaterThan(0);
          for (const note of voice.notes) {
            expect(note.string).toBeGreaterThanOrEqual(1);
            expect(note.string).toBeLessThanOrEqual(track.strings.length);
            expect(note.velocity).toBeGreaterThanOrEqual(0);
            expect(note.velocity).toBeLessThanOrEqual(127);
            expect(note.effect.vibrato && note.effect.wideVibrato).toBe(false);
          }
        }
      }
    });
  });
}
