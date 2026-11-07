import { describe, expect, it } from 'vitest';
import type { BeatAddress } from '../src/edit/addresses';
import type { BeatFragment, BeatFragmentItem } from '../src/edit/beat-fragment';
import { pasteBeats } from '../src/edit/beat-paste';
import { barEvents } from '../src/edit/bar-flow';
import { copyBeats } from '../src/edit/beat-ranges';
import { NO_STROKE, durationTicks, headerTicks } from '../src/model/defaults';
import { type Duration, type Note, QUARTER_TIME, type Song } from '../src/model/song';
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

function quarters(count: number, firstFret: number): readonly BeatFragmentItem[] {
  return Array.from({ length: count }, (_, i) => item(dur(4), n(3, firstFret + i)));
}

const FIRST_BAR = [play(4, n(1, 0)), play(4, n(1, 1)), play(4, n(1, 2)), play(4, n(1, 3))];

describe('pasteBeats: where the voice goes on after the pasted beats (⌘V, ⌘V, ⌘V lays copies one after another)', () => {
  it('answers the beat right after the pasted beats, and a paste there lays the next copy after the first', () => {
    // Arrange
    const song = bars(FIRST_BAR, NEXT_BAR);
    const copy = fragment(...quarters(2, 9));

    // Act
    const first = pasteBeats(song, at(0, 0), copy);
    const second = first.next === undefined ? first : pasteBeats(first.song, first.next, copy);

    // Assert
    expect(first.next).toEqual(at(0, 2));
    expect(voiceLayout(second.song, 0, 0, 0)).toEqual(['0:4:3/9', '960:4:3/10', '1920:4:3/9', '2880:4:3/10']);
    expect(second.next).toEqual(at(1, 0));
  });

  it('is still a paste when it writes what is already there: the same song, and the beat after it', () => {
    const song = bars(FIRST_BAR, NEXT_BAR);
    const pasted = pasteBeats(song, at(0, 0), copyBeats(song, at(0, 0), at(0, 1)));
    expect(pasted).toMatchObject({ song, isPasted: true, at: at(0, 0), next: at(0, 2) });
  });

  it('goes on at the next bar’s start, a bar without beats too', () => {
    const song = deepFreeze(buildSong({ tracks: [[[FIRST_BAR], []]] }));
    const pasted = pasteBeats(song, at(0, 0), fragment(...quarters(4, 9)));
    expect(song.tracks[0]?.measures[1]?.beats).toEqual([]);
    expect(pasted.next).toEqual(at(1, 0));
  });

  it('goes on inside the bar it added at the end, or nowhere when the pasted beats end the song', () => {
    const song = bars(FIRST_BAR);
    expect(pasteBeats(song, at(0, 3), fragment(...quarters(2, 9)))).toMatchObject({ addedBars: 1, next: at(1, 1) });
    expect(pasteBeats(song, at(0, 0), fragment(...quarters(4, 9))).next).toBeUndefined();
  });

  it('pastes nothing for an empty fragment or a beat the track lacks', () => {
    const song = bars(FIRST_BAR);
    expect(pasteBeats(song, at(0, 0), fragment())).toMatchObject({ song, isPasted: false });
    expect(pasteBeats(song, at(0, 9), fragment(...quarters(1, 9)))).toMatchObject({ song, isPasted: false });
  });
});

describe('pasteBeats: a copied over-full bar stays one bar', () => {
  /** Track 1: a full bar, an over-full bar of five quarters, two full bars; track 2 quarter rests. */
  function withOverfullBar(): Song {
    const over = [...FIRST_BAR, play(4, n(1, 9))];
    const rests = [play(4), play(4), play(4), play(4)];
    return deepFreeze(buildSong({ tracks: [[[FIRST_BAR], [over], [NEXT_BAR], [FIRST_BAR]], [[rests], [rests], [rests], [rests]]] }));
  }

  it('records where the copied beats sat in their bars when one of them is over-full', () => {
    const song = withOverfullBar();
    expect(copyBeats(song, at(0, 1), at(2, 0)).layout).toEqual({ offset: QUARTER_TIME, bars: [{ ticks: 4 * QUARTER_TIME, length: 4 * QUARTER_TIME }, { ticks: 4 * QUARTER_TIME, length: 5 * QUARTER_TIME }, { ticks: 4 * QUARTER_TIME, length: 4 * QUARTER_TIME }] });
    expect(copyBeats(song, at(2, 0), at(3, 3)).layout).toBeUndefined();
  });

  it('pastes the over-full bar into one bar at the same place in a bar, the bars after it on their bar lines', () => {
    // Arrange
    const song = withOverfullBar();

    // Act: bars 1–4 of track 1 into track 2
    const pasted = pasteBeats(song, at(0, 0, 0, 1), copyBeats(song, at(0, 0), at(3, 3)));

    // Assert
    expect([0, 1, 2, 3].map((m) => voiceLayout(pasted.song, 1, m, 0))).toEqual([0, 1, 2, 3].map((m) => voiceLayout(song, 0, m, 0)));
    assertEditInvariants(pasted.song);
  });

  it('flows the over-full bar on across the bar line when pasted at another place in a bar', () => {
    const song = withOverfullBar();
    const pasted = pasteBeats(song, at(0, 1, 0, 1), copyBeats(song, at(0, 0), at(1, 4)));
    expect(voiceLayout(pasted.song, 1, 2, 0)).toEqual(['0:4:1/3', '960:4:1/9', '1920:4:r', '2880:4:r']);
  });

  it('canon.gp5: the whole of track 1 pasted into track 3 reads back bar for bar, its over-full bars 60, 140, 219 and 222 too', () => {
    // Arrange
    const song = deepFreeze(readSong(loadFixture('guitarpro5', 'canon.gp5')));
    const last = song.measureHeaders.length - 1;
    const copied = copyBeats(song, at(0, 0), at(last, Math.max(0, (song.tracks[0]?.measures[last]?.beats.length ?? 1) - 1)));

    // Act
    const pasted = pasteBeats(song, at(0, 0, 0, 2), copied);

    // Assert
    const bars = song.measureHeaders.map((_, k) => k);
    expect(bars.filter((k) => barItems(pasted.song, 2, k) !== barItems(song, 0, k))).toEqual([]);
    expect(pasted.song.measureHeaders).toBe(song.measureHeaders);
  });
});

describe('pasteBeats: a pasted note that cannot be cut at a bar line', () => {
  it('over-fills the bar it starts in and leaves the bars after it where they were, the beat after it there', () => {
    // Arrange: three bars of quarters; a triplet eighth then a whole note, which no tied pieces can split at the bar line
    const song = bars(FIRST_BAR, NEXT_BAR, FIRST_BAR);

    // Act
    const pasted = pasteBeats(song, at(0, 0), fragment(item(dur(8, { tuplet: TRIPLET }), n(2, 1)), item(dur(1), n(2, 3))));

    // Assert
    expect(voiceLayout(pasted.song, 0, 0, 0)).toEqual(['0:8/3:2:2/1', '320:1:2/3']);
    expect(voiceLayout(pasted.song, 0, 1, 0)).toEqual(voiceLayout(song, 0, 1, 0));
    expect(pasted).toMatchObject({ lastMeasureIndex: 0, next: at(1, 0) });
    assertEditInvariants(pasted.song);
  });
});

describe('pasteBeats: where the pasted beats start', () => {
  it('names the over-full part of the cursor’s bar, not the next bar’s beat at the same moment', () => {
    // Arrange: five quarters in a 4/4 bar; its fifth starts as bar 2 does
    const song = bars([...FIRST_BAR, play(4, n(1, 9))], NEXT_BAR);

    // Act
    const pasted = pasteBeats(song, at(0, 4), fragment(item(dur(4), n(2, 5))));

    // Assert
    expect(pasted.at).toEqual(at(0, 4));
    expect(voiceLayout(pasted.song, 0, 1, 0)).toEqual(voiceLayout(song, 0, 1, 0));
  });
});
