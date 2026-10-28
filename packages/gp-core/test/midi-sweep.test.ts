import { describe, expect, it } from 'vitest';
import { type TimelineEntry, positionAt, readSong, renderMidi } from '../src/index';
import { buildPlaybackOrder } from '../src/midi/playback-order';
import { type FixtureFolder, listFixtures, loadFixture } from './helpers/fixtures';
import { playedNotes, readMidi } from './helpers/midi-reader';

const FOLDERS: readonly FixtureFolder[] = [
  'guitarpro1',
  'guitarpro2',
  'guitarpro3',
  'guitarpro4',
  'guitarpro5',
  'guitarpro6',
  'guitarpro7',
  'guitarpro8',
];

const FIXTURES = FOLDERS.flatMap((folder) => listFixtures(folder).map((name) => [folder, name] as const)).filter(
  ([, name]) => !name.endsWith('.sh') && !name.endsWith('.md'),
);

/** Fixtures our readers reject on purpose (corrupt files kept to test the error path). */
function readable(folder: FixtureFolder, name: string): ReturnType<typeof readSong> | undefined {
  try {
    return readSong(loadFixture(folder, name));
  } catch {
    return undefined;
  }
}

/** Each entry at its measure's tick, in time order, and found again by its time. */
function timelineViolations(song: ReturnType<typeof readSong>, timeline: readonly TimelineEntry[]): string[] {
  return timeline.flatMap((entry, index) => {
    const problems: string[] = [];
    if (entry.tick !== song.measureHeaders[entry.headerIndex]?.start) {
      problems.push(`entry ${index}: tick ${entry.tick}`);
    }
    if (!(entry.seconds >= (timeline[index - 1]?.seconds ?? 0))) {
      problems.push(`entry ${index}: ${entry.seconds} s before the entry before`);
    }
    if (positionAt(timeline, entry.seconds)?.headerIndex !== entry.headerIndex) {
      problems.push(`entry ${index}: found at another measure`);
    }
    return problems;
  });
}

describe('renderMidi fixture sweep', () => {
  it('finds fixtures in every committed folder', () => {
    // Assert
    expect(FIXTURES.length).toBeGreaterThan(200);
  });

  it.each(FIXTURES)('renders %s/%s to a parsable MIDI file with a consistent timeline', (folder, name) => {
    // Arrange
    const song = readable(folder, name);
    if (song === undefined) {
      return;
    }

    // Act
    const render = renderMidi(song);
    const file = readMidi(render.bytes);

    // Assert
    expect(file.format).toBe(1);
    expect(file.division).toBe(960);
    expect(file.tracks).toHaveLength(song.tracks.length + 1);
    expect(render.timeline).toHaveLength(buildPlaybackOrder(song.measureHeaders, 0).length);
    // Gathered and checked once: an expect per entry and per note made the large files slow.
    expect(timelineViolations(song, render.timeline)).toEqual([]);
    expect(render.durationSeconds).toBeGreaterThanOrEqual(render.timeline.at(-1)?.seconds ?? 0);
    const unended = playedNotes(file).filter((played) => !(played.end !== undefined && played.end > played.start));
    expect(unended.map((played) => `${played.key}@${played.start}`)).toEqual([]);
  });
});
