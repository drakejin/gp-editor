import { describe, expect, it } from 'vitest';
import type { BeatAddress } from '../src/edit/addresses';
import type { BeatFragment, BeatFragmentItem } from '../src/edit/beat-fragment';
import { pasteBeats } from '../src/edit/beat-paste';
import { barEvents } from '../src/edit/bar-flow';
import { copyBeats } from '../src/edit/beat-ranges';
import { NO_STROKE, durationTicks, headerTicks } from '../src/model/defaults';
import type { Duration, Note, Song } from '../src/model/song';
import { readSong } from '../src/read-song';
import { type EventSpec, assertEditInvariants, buildSong, deepFreeze, dur, n, play, voiceLayout } from './helpers/edit-songs';
import { loadFixture } from './helpers/fixtures';

const TRIPLET = { enters: 3, times: 2 };
const QUINTUPLET = { enters: 5, times: 4 };
const SEPTUPLET = { enters: 7, times: 4 };

function at(measureIndex: number, beatIndex: number, voiceIndex = 0, trackIndex = 0): BeatAddress {
  return { trackIndex, measureIndex, beatIndex, voiceIndex };
}

function bars(...measures: (readonly EventSpec[])[]): Song {
  return deepFreeze(buildSong({ tracks: [measures.map((events) => [events])] }));
}

function item(duration: Duration, ...notes: Note[]): BeatFragmentItem {
  return { duration, notes, stroke: NO_STROKE, pickStroke: 'none' };
}

function fragment(...items: BeatFragmentItem[]): BeatFragment {
  return { isPercussion: false, items };
}

/** Ticks the voice fills in a bar. */
function voiceTicks(song: Song, measureIndex: number): number {
  return (song.tracks[0]?.measures[measureIndex]?.beats ?? []).reduce((total, beat) => total + (beat.voices[0]?.isEmpty === false ? durationTicks(beat.voices[0].duration) : 0), 0);
}

const NEXT_BAR = [play(4, n(1, 4)), play(4, n(1, 5)), play(4, n(1, 6)), play(4, n(1, 7))];

describe('pasteBeats: where the paste ends inside a note of another tuplet', () => {
  it('writes a quintuplet over a bar of halves: the half it cuts leaves the rest of its time as quintuplet rests', () => {
    // Arrange
    const song = bars([play(2, n(1, 0)), play(2, n(1, 2))], NEXT_BAR);

    // Act
    const pasted = pasteBeats(song, at(0, 0), fragment(item(dur(16, { tuplet: QUINTUPLET }), n(2, 9))));

    // Assert
    expect(pasted.song).not.toBe(song);
    const layout = voiceLayout(pasted.song, 0, 0, 0);
    expect(layout[0]).toBe('0:16/5:4:2/9');
    expect(layout.at(-1)).toBe('1920:2:1/2');
    expect(voiceLayout(pasted.song, 0, 1, 0)).toEqual(voiceLayout(song, 0, 1, 0));
    assertEditInvariants(pasted.song);
  });

  it('writes a quintuplet into a bar of triplets: the triplet it cuts leaves rests mixing both tuplets', () => {
    // Arrange: three triplet quarters, then a half
    const tripletQuarter = dur(4, { tuplet: TRIPLET });
    const song = bars([play(tripletQuarter, n(1, 0)), play(tripletQuarter, n(1, 1)), play(tripletQuarter, n(1, 2)), play(2, n(1, 5))], NEXT_BAR);

    // Act: a quintuplet sixteenth on the second triplet quarter
    const pasted = pasteBeats(song, at(0, 1), fragment(item(dur(16, { tuplet: QUINTUPLET }), n(2, 9))));

    // Assert
    expect(pasted.song).not.toBe(song);
    const layout = voiceLayout(pasted.song, 0, 0, 0);
    expect(layout).toContain('640:16/5:4:2/9');
    expect(layout).toContain('1280:4/3:2:1/2');
    expect(layout.at(-1)).toBe('1920:2:1/5');
    expect(voiceTicks(pasted.song, 0)).toBe(headerTicks(song.measureHeaders[0]!));
    assertEditInvariants(pasted.song);
  });

  it('keeps the note it cuts as a rest of its own length when no rests can write the time left, the bar over-full', () => {
    // Arrange: seven septuplet sixteenths, then a dotted half
    const septuplet = dur(16, { tuplet: SEPTUPLET });
    const song = bars([...Array.from({ length: 7 }, (_, i) => play(septuplet, n(1, i))), play(dur(2, { dotted: true }), n(1, 9))], NEXT_BAR);

    // Act: a triplet eighth and a quintuplet sixteenth end inside the fourth septuplet
    const pasted = pasteBeats(song, at(0, 0), fragment(item(dur(8, { tuplet: TRIPLET }), n(2, 1)), item(dur(16, { tuplet: QUINTUPLET }), n(2, 2))));

    // Assert
    expect(pasted.song).not.toBe(song);
    expect(voiceTicks(pasted.song, 0)).toBeGreaterThan(headerTicks(song.measureHeaders[0]!));
    expect(voiceLayout(pasted.song, 0, 0, 0).at(-1)).toMatch(/:2\.:1\/9$/);
    expect(voiceLayout(pasted.song, 0, 1, 0)).toEqual(voiceLayout(song, 0, 1, 0));
    assertEditInvariants(pasted.song);
  });
});

describe('pasteBeats: the real files where a paste used to change nothing', () => {
  it.each([
    ['guitarpro4', 'fade-to-black.gp4', at(119, 6, 0, 9), at(150, 3, 0, 9), at(151, 1, 0, 9)],
    ['guitarpro7', 'tuplets.gp', at(1, 4), at(1, 4), at(0, 2)],
    ['guitarpro6', 'effects.gpx', at(5, 0), at(25, 0), at(9, 0)],
  ] as const)('%s/%s: the copied run is written over the cursor', (folder, name, from, to, target) => {
    // Arrange
    const song = deepFreeze(readSong(loadFixture(folder, name)));
    const copied = copyBeats(song, from, to);

    // Act
    const pasted = pasteBeats(song, target, copied);

    // Assert
    expect(pasted.song).not.toBe(song);
    expect(copyBeats(pasted.song, pasted.at, pasted.at).items[0]?.notes).toEqual(copied.items[0]?.notes);
    assertEditInvariants(pasted.song);
  });
});

/** Each bar of a track's voice 1 as events (time the voice leaves unused read as rests), without their beat indexes. */
function barItems(song: Song, trackIndex: number, measureIndex: number): string {
  const events = barEvents(song, { trackIndex, voiceIndex: 0, firstMeasureIndex: measureIndex }, measureIndex) ?? [];
  return JSON.stringify(events.map(({ voice }) => ({ duration: voice.duration, notes: voice.notes })));
}

describe('pasteBeats: a long paste stays on the bar lines', () => {
  it('canon.gp5: bars 1–50 of track 1 pasted at bar 100 read back bar for bar up to the 6/4 bar 139, over-full bar 140 written whole', () => {
    // Arrange
    const song = deepFreeze(readSong(loadFixture('guitarpro5', 'canon.gp5')));
    const copied = copyBeats(song, at(0, 0), at(49, Math.max(0, (song.tracks[0]?.measures[49]?.beats.length ?? 1) - 1)));

    // Act
    const pasted = pasteBeats(song, at(99, 0), copied);

    // Assert: the 4/4 bars before bar 139 as they were copied; bar 139 (6/4) takes six quarters of the run, as Guitar Pro 8's single track paste "does not account for bar structures, such as time signatures"
    const fourFour = Array.from({ length: 39 }, (_, k) => k);
    expect(fourFour.filter((k) => barItems(pasted.song, 0, 99 + k) !== barItems(song, 0, k))).toEqual([]);
    expect(barEvents(pasted.song, { trackIndex: 0, voiceIndex: 0, firstMeasureIndex: 139 }, 139)?.reduce((ticks, event) => ticks + durationTicks(event.voice.duration), 0)).toBe(headerTicks(song.measureHeaders[139]!));
    expect(pasted.song.tracks.slice(1)).toEqual(song.tracks.slice(1));
    assertEditInvariants(pasted.song);
  });
});
