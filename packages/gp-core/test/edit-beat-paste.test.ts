import { describe, expect, it } from 'vitest';
import type { BeatAddress } from '../src/edit/addresses';
import type { BeatFragment, BeatFragmentItem } from '../src/edit/beat-fragment';
import { pasteBeats } from '../src/edit/beat-paste';
import { NO_STROKE } from '../src/model/defaults';
import type { Note, Song } from '../src/model/song';
import { type EventSpec, assertEditInvariants, buildSong, deepFreeze, dur, n, play, rest, voiceLayout } from './helpers/edit-songs';

function at(measureIndex: number, beatIndex: number, voiceIndex = 0, trackIndex = 0): BeatAddress {
  return { trackIndex, measureIndex, beatIndex, voiceIndex };
}

/** One track of 4/4 bars, voice 1 only. */
function bars(...measures: (readonly EventSpec[])[]): Song {
  return deepFreeze(buildSong({ tracks: [measures.map((events) => [events])] }));
}

/** Two tracks of 4/4 bars, voice 1 only. */
function twoTracks(first: readonly (readonly EventSpec[])[], second: readonly (readonly EventSpec[])[]): Song {
  return deepFreeze(buildSong({ tracks: [first.map((events) => [events]), second.map((events) => [events])] }));
}

function layout(song: Song, measureIndex: number, trackIndex = 0): string[] {
  return voiceLayout(song, trackIndex, measureIndex, 0);
}

function tied(string: number, fret: number): Note {
  return { ...n(string, fret), isTied: true };
}

function item(value: 1 | 2 | 4 | 8, ...notes: Note[]): BeatFragmentItem {
  return { duration: dur(value), notes, stroke: NO_STROKE, pickStroke: 'none' };
}

function fragment(...items: BeatFragmentItem[]): BeatFragment {
  return { isPercussion: false, items };
}

function quarters(count: number, firstFret: number): readonly BeatFragmentItem[] {
  return Array.from({ length: count }, (_, i) => item(4, n(3, firstFret + i)));
}

const FOUR_QUARTERS = [play(4, n(1, 0)), play(4, n(1, 1)), play(4, n(1, 2)), play(4, n(1, 3))];
const NEXT_QUARTERS = [play(4, n(1, 4)), play(4, n(1, 5)), play(4, n(1, 6)), play(4, n(1, 7))];

describe('pasteBeats: up to a bar, written over the voice (Guitar Pro 8 completes the current bar)', () => {
  it('replaces the beats from the cursor for the fragment’s length and leaves what follows in place', () => {
    // Arrange
    const song = bars(FOUR_QUARTERS, NEXT_QUARTERS);

    // Act
    const pasted = pasteBeats(song, at(0, 1), fragment(item(8, n(2, 9)), item(8, n(2, 10))));

    // Assert
    expect(layout(pasted.song, 0)).toEqual(['0:4:1/0', '960:8:2/9', '1440:8:2/10', '1920:4:1/2', '2880:4:1/3']);
    expect(layout(pasted.song, 1)).toEqual(layout(song, 1));
    expect(pasted.song.tracks[0]?.measures[1]).toBe(song.tracks[0]?.measures[1]);
    expect(pasted).toMatchObject({ addedBars: 0, at: at(0, 1) });
    assertEditInvariants(pasted.song);
  });

  it('keeps the track in time with the others: a note it cuts into leaves the rest of its time as rests', () => {
    // Arrange
    const song = twoTracks([FOUR_QUARTERS, NEXT_QUARTERS], [NEXT_QUARTERS, FOUR_QUARTERS]);

    // Act: three eighths over the first two quarters
    const pasted = pasteBeats(song, at(0, 0), fragment(item(8, n(2, 9)), item(8, n(2, 10)), item(8, n(2, 11))));

    // Assert
    expect(layout(pasted.song, 0)).toEqual(['0:8:2/9', '480:8:2/10', '960:8:2/11', '1440:8:r', '1920:4:1/2', '2880:4:1/3']);
    expect(pasted.song.measureHeaders).toHaveLength(2);
    expect(pasted.song.tracks[1]).toBe(song.tracks[1]);
  });

  it('runs on over the bar line, tying a note the bar line splits, and replaces only that much of the next bar', () => {
    const pasted = pasteBeats(bars(FOUR_QUARTERS, NEXT_QUARTERS), at(0, 3), fragment(item(2, n(2, 9))));
    expect(layout(pasted.song, 0)).toEqual(['0:4:1/0', '960:4:1/1', '1920:4:1/2', '2880:4:2/9']);
    expect(layout(pasted.song, 1)).toEqual(['0:4:2/9', '960:4:1/5', '1920:4:1/6', '2880:4:1/7']);
    expect(pasted.song.tracks[0]?.measures[1]?.beats[0]?.voices[0]?.notes[0]?.isTied).toBe(true);
    assertEditInvariants(pasted.song);
  });

  it('adds bars at the end, in every track, for what runs past the last bar', () => {
    const song = twoTracks([FOUR_QUARTERS], [[rest(1)]]);
    const pasted = pasteBeats(song, at(0, 3), fragment(item(2, n(2, 9))));
    expect(pasted.song.measureHeaders).toHaveLength(2);
    expect(pasted.song.tracks[1]?.measures).toHaveLength(2);
    expect(pasted.addedBars).toBe(1);
    assertEditInvariants(pasted.song);
  });

  it('undoes the tie of the note after the pasted beats: the note it continued is gone', () => {
    const pasted = pasteBeats(bars([play(4, n(1, 5)), play(4, tied(1, 5)), rest(2)]), at(0, 0), fragment(item(4, n(2, 9))));
    expect(pasted.song.tracks[0]?.measures[0]?.beats[1]?.voices[0]?.notes[0]).toMatchObject({ fret: 5, isTied: false });
  });
});

describe('pasteBeats: longer than a bar', () => {
  it('adds whole bars before the cursor’s bar, in every track, and pastes into them', () => {
    // Arrange
    const song = twoTracks([FOUR_QUARTERS, NEXT_QUARTERS], [NEXT_QUARTERS, FOUR_QUARTERS]);

    // Act: six quarters with the cursor on bar 2, beat 3
    const pasted = pasteBeats(song, at(1, 2), fragment(...quarters(6, 0)));

    // Assert
    expect(pasted).toMatchObject({ addedBars: 2, at: at(1, 0) });
    expect(layout(pasted.song, 1)).toEqual(['0:4:3/0', '960:4:3/1', '1920:4:3/2', '2880:4:3/3']);
    expect(layout(pasted.song, 2)).toEqual(['0:4:3/4', '960:4:3/5', '1920:2:r']);
    expect(layout(pasted.song, 3)).toEqual(layout(song, 1));
    expect(layout(pasted.song, 3, 1)).toEqual(layout(song, 1, 1));
    expect(pasted.song.measureHeaders).toHaveLength(4);
    assertEditInvariants(pasted.song);
  });

  it('fills the empty bars from the cursor on first, then adds bars for what does not fit', () => {
    // Arrange: bar 2 is empty, bar 3 has music
    const song = bars(FOUR_QUARTERS, [rest(1)], NEXT_QUARTERS);

    // Act
    const pasted = pasteBeats(song, at(1, 0), fragment(...quarters(6, 0)));

    // Assert
    expect(pasted).toMatchObject({ addedBars: 1, at: at(1, 0) });
    expect(layout(pasted.song, 1)).toEqual(['0:4:3/0', '960:4:3/1', '1920:4:3/2', '2880:4:3/3']);
    expect(layout(pasted.song, 2)).toEqual(['0:4:3/4', '960:4:3/5', '1920:2:r']);
    expect(layout(pasted.song, 3)).toEqual(layout(song, 2));
  });

  it('adds no bar where the empty bars hold it all', () => {
    const song = bars(FOUR_QUARTERS, [rest(1)], [rest(1)], NEXT_QUARTERS);
    const pasted = pasteBeats(song, at(1, 0), fragment(...quarters(6, 0)));
    expect(pasted.addedBars).toBe(0);
    expect(layout(pasted.song, 3)).toEqual(layout(song, 3));
  });
});

describe('pasteBeats: what it leaves alone', () => {
  it('changes nothing for an empty fragment, a missing beat, or drum beats into another track', () => {
    const song = bars(FOUR_QUARTERS);
    expect(pasteBeats(song, at(0, 0), fragment()).song).toBe(song);
    expect(pasteBeats(song, at(0, 9), fragment(item(4, n(1, 1)))).song).toBe(song);
    expect(pasteBeats(song, at(0, 0), { isPercussion: true, items: [item(4, n(1, 38))] }).song).toBe(song);
  });
});
