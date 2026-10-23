import { describe, expect, it } from 'vitest';
import { type BeatAddress, setBeatDuration } from '../src/edit/beats';
import { setNoteFret } from '../src/edit/edit-song';
import { durationTicks, isMeasureOverfull, measureTicks } from '../src/model/defaults';
import type { Duration, Song, Tuplet } from '../src/model/song';
import { assertEditInvariants, buildSong, deepFreeze, dur, n, play, rest, voiceLayout } from './helpers/edit-songs';

const AT: BeatAddress = { trackIndex: 0, measureIndex: 0, beatIndex: 0, voiceIndex: 0 };
const QUINTUPLET: Tuplet = { enters: 5, times: 4 };
const TRIPLET: Tuplet = { enters: 3, times: 2 };

function wholeRestBar(): Song {
  return deepFreeze(buildSong({ tracks: [[[[rest(1)]]]] }));
}

/** Durations of the first voice of the first bar, in order. */
function voiceDurations(song: Song): readonly Duration[] {
  return (song.tracks[0]?.measures[0]?.beats ?? []).flatMap((beat) => (beat.voices[0]?.isEmpty === false ? [beat.voices[0].duration] : []));
}

function barState(song: Song): { readonly overfull: boolean; readonly filled: number; readonly length: number } {
  const header = song.measureHeaders[0];
  const measure = song.tracks[0]?.measures[0];
  if (header === undefined || measure === undefined) {
    throw new Error('test song has no first bar');
  }
  const filled = voiceDurations(song).reduce((sum, duration) => sum + durationTicks(duration), 0);
  return { overfull: isMeasureOverfull(measure, header), filled, length: measureTicks(4, 4) };
}

/** Every beat of the first bar gets a note (fret = beat index), as typing frets across the bar does. */
function playEveryBeat(song: Song): Song {
  const count = song.tracks[0]?.measures[0]?.beats.length ?? 0;
  return Array.from({ length: count }, (_, beatIndex) => beatIndex).reduce((current, beatIndex) => setNoteFret(current, { ...AT, beatIndex, string: 1 }, beatIndex % 24), song);
}

describe('edits with tuplets of 7, 9, 11 and 13', () => {
  it.each([
    [16, { enters: 7, times: 4 }, 28],
    [32, { enters: 9, times: 8 }, 36],
    [32, { enters: 11, times: 8 }, 44],
    [32, { enters: 13, times: 8 }, 52],
  ] as const)('fills a 4/4 bar with 1/%i notes of a %o tuplet: %i beats, neither over-full nor short', (value, tuplet, count) => {
    // Arrange
    const duration: Duration = { ...dur(value), tuplet };

    // Act
    const edited = playEveryBeat(setBeatDuration(wholeRestBar(), AT, duration));

    // Assert
    expect(voiceDurations(edited)).toHaveLength(count);
    expect(voiceDurations(edited).every((each) => each.tuplet.enters === tuplet.enters)).toBe(true);
    expect(barState(edited)).toEqual({ overfull: false, filled: measureTicks(4, 4), length: measureTicks(4, 4) });
    expect(edited.tracks[0]?.measures[0]?.beats.every((beat) => (beat.voices[0]?.notes.length ?? 0) === 1)).toBe(true);
    assertEditInvariants(edited);
  });

  it('places the beat after seven 7:4 sixteenths exactly on the next quarter', () => {
    // Arrange
    const septuplet: Duration = { ...dur(16), tuplet: { enters: 7, times: 4 } };
    const song = deepFreeze(buildSong({ tracks: [[[[...Array.from({ length: 7 }, (_, i) => play(septuplet, n(1, i))), play(4, n(2, 0)), rest(2)]]]] }));

    // Act
    const layout = voiceLayout(song, 0, 0, 0);

    // Assert: offsets are in 960ths of a quarter
    expect(layout[7]).toBe('960:4:2/0');
    expect(barState(song).overfull).toBe(false);
  });
});

describe('edits with a tuplet inside a tuplet', () => {
  it('turns a quintuplet sixteenth into a triplet inside the quintuplet, filling the time it gives up with rests', () => {
    // Arrange
    const quintuplet: Duration = { ...dur(16), tuplet: QUINTUPLET };
    const song = deepFreeze(buildSong({ tracks: [[[[...Array.from({ length: 5 }, (_, i) => play(quintuplet, n(1, i))), rest(4), rest(2)]]]] }));

    // Act
    const edited = setBeatDuration(song, { ...AT, beatIndex: 1 }, { ...quintuplet, innerTuplet: TRIPLET });

    // Assert: 2/3 of a quintuplet sixteenth, then a nested 32nd rest for the third it gave up
    expect(voiceLayout(edited, 0, 0, 0).slice(0, 4)).toEqual(['0:16/5:4:1/0', '192:16/5:4/3:2:1/1', '320:32/5:4/3:2:r', '384:16/5:4:1/2']);
    expect(barState(edited)).toEqual({ overfull: false, filled: measureTicks(4, 4), length: measureTicks(4, 4) });
    assertEditInvariants(edited);
  });

  it('removes an inner tuplet whose outer tuplet goes, and ignores one that is not a tuplet', () => {
    // Arrange
    const song = deepFreeze(buildSong({ tracks: [[[[play(4, n(1, 0)), rest(4), rest(2)]]]] }));

    // Act
    const plain = setBeatDuration(song, AT, { ...dur(4), innerTuplet: TRIPLET });
    const normalInner = setBeatDuration(song, AT, { ...dur(8), tuplet: TRIPLET, innerTuplet: { enters: 1, times: 1 } });

    // Assert
    expect(plain).toBe(song);
    expect(voiceDurations(normalInner)[0]).toEqual({ ...dur(8), tuplet: TRIPLET });
    expect(Object.hasOwn(voiceDurations(normalInner)[0] ?? {}, 'innerTuplet')).toBe(false);
  });

  it('refuses an inner tuplet of no notes', () => {
    // Arrange
    const song = deepFreeze(buildSong({ tracks: [[[[play({ ...dur(8), tuplet: TRIPLET }, n(1, 0)), rest({ ...dur(8), tuplet: TRIPLET }), rest({ ...dur(8), tuplet: TRIPLET }), rest(4), rest(2)]]]] }));

    // Act
    const edited = setBeatDuration(song, AT, { ...dur(8), tuplet: TRIPLET, innerTuplet: { enters: 0, times: 2 } });

    // Assert
    expect(edited).toBe(song);
  });
});
