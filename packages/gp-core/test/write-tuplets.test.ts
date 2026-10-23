import { describe, expect, it } from 'vitest';
import { plainDuration } from '../src/model/defaults';
import type { Duration, Song, Tuplet } from '../src/model/song';
import { readSong } from '../src/read-song';
import { type WritableFormat, writeSong } from '../src/write/index';
import { songDifference } from './helpers/write-compare';
import { expectedAfterGp5 } from './helpers/write-expected';
import { buildNote, buildSong, buildVoice } from './helpers/write-song-builder';

const TRIPLET: Tuplet = { enters: 3, times: 2 };
const QUINTUPLET: Tuplet = { enters: 5, times: 4 };

/** One bar: a quintuplet sixteenth, three triplet sixteenths inside the quintuplet, then a quarter. */
function nestedSong(): Song {
  const quintuplet: Duration = { ...plainDuration(16), tuplet: QUINTUPLET };
  const nested: Duration = { ...quintuplet, innerTuplet: TRIPLET };
  const beats = [quintuplet, nested, nested, nested, plainDuration(4)].map((duration, i) => ({ voice: buildVoice([buildNote(1, i)], duration) }));
  return buildSong({ tracks: [{ measures: [beats] }] });
}

function durationsAfter(song: Song, format: WritableFormat): readonly (Duration | undefined)[] {
  return readSong(writeSong(song, format)).tracks[0]?.measures[0]?.beats.map((beat) => beat.voices[0]?.duration) ?? [];
}

describe('writeSong and tuplets inside tuplets', () => {
  it.each(['gp5', 'gp4', 'gp3'] as const)('%s keeps the outer tuplet and drops the inner one, which no GP3–GP5 file holds', (format) => {
    // Act
    const durations = durationsAfter(nestedSong(), format);

    // Assert
    expect(durations.slice(0, 4)).toEqual(Array.from({ length: 4 }, () => ({ ...plainDuration(16), tuplet: QUINTUPLET })));
    expect(durations.some((duration) => duration?.innerTuplet !== undefined)).toBe(false);
  });

  it('reads back as the GP5 oracle says (the beats after a dropped inner tuplet move)', () => {
    // Arrange
    const song = nestedSong();

    // Act
    const again = readSong(writeSong(song, 'gp5'));

    // Assert
    expect(songDifference(expectedAfterGp5(song, again), again)).toBeUndefined();
  });

  it('writes a triplet inside a triplet as the 9:8 tuplet of the same length', () => {
    // Arrange: a triplet eighth's triplet lasts 4/9 of an eighth = a 9:8 sixteenth
    const nested: Duration = { ...plainDuration(8), tuplet: TRIPLET, innerTuplet: TRIPLET };
    const song = buildSong({ tracks: [{ measures: [[{ voice: buildVoice([buildNote(1, 0)], nested) }]] }] });

    // Act
    const [duration] = durationsAfter(song, 'gp5');

    // Assert
    expect(duration).toEqual({ ...plainDuration(16), tuplet: { enters: 9, times: 8 } });
  });
});
