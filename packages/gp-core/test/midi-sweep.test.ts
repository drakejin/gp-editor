import { describe, expect, it } from 'vitest';
import { positionAt, readSong, renderMidi } from '../src/index';
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
    render.timeline.forEach((entry, index) => {
      expect(entry.tick).toBe(song.measureHeaders[entry.headerIndex]?.start);
      expect(entry.seconds).toBeGreaterThanOrEqual(render.timeline[index - 1]?.seconds ?? 0);
      expect(positionAt(render.timeline, entry.seconds)?.headerIndex).toBe(entry.headerIndex);
    });
    expect(render.durationSeconds).toBeGreaterThanOrEqual(render.timeline.at(-1)?.seconds ?? 0);
    for (const played of playedNotes(file)) {
      expect(played.end, `${played.key}@${played.start}`).toBeDefined();
      expect(played.end ?? 0).toBeGreaterThan(played.start);
    }
  });
});
