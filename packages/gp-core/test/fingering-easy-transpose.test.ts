import { describe, expect, it } from 'vitest';
import { tabFret } from '../src/edit/banjo';
import { NECK_FRETS } from '../src/edit/edit-song';
import { transpose } from '../src/edit/transpose';
import { easyTranspose } from '../src/fingering/easy-transpose';
import { fingeringCost } from '../src/fingering/refinger';
import { STANDARD_TUNING, durationTicks } from '../src/model/defaults';
import type { Song } from '../src/model/song';
import { readSong } from '../src/read-song';
import { assertEditInvariants, n, play } from './helpers/edit-songs';
import { loadFixture } from './helpers/fixtures';
import { songOnStrings } from './helpers/tuning-songs';

const SONG = { kind: 'song' } as const;

/** Sounding pitches by `track:measure:start:voice:duration`, each list sorted. */
function pitchesByEvent(song: Song): ReadonlyMap<string, readonly number[]> {
  const events = new Map<string, number[]>();
  song.tracks.forEach((track, trackIndex) =>
    track.measures.forEach((measure, measureIndex) =>
      measure.beats.forEach((beat) =>
        beat.voices.forEach((voice, voiceIndex) => {
          const key = `${trackIndex}:${measureIndex}:${beat.start}:${voiceIndex}:${durationTicks(voice.duration)}`;
          const pitches = voice.notes.map((note) => (track.isPercussion ? note.fret : (track.strings[note.string - 1]?.tuning ?? Number.NaN) + track.offset + note.fret));
          events.set(key, [...(events.get(key) ?? []), ...pitches].sort((a, b) => a - b));
        }),
      ),
    ),
  );
  return events;
}

/** Notes whose pitch is not `original − shift` (drums: not their own key), counted. */
function wrongPitches(original: Song, edited: Song, shift: number): number {
  const before = pitchesByEvent(original);
  const after = pitchesByEvent(edited);
  let wrong = 0;
  before.forEach((pitches, key) => {
    const isDrum = original.tracks[Number(key.split(':')[0])]?.isPercussion === true;
    const expected = pitches.map((pitch) => (isDrum ? pitch : pitch + shift)).sort((a, b) => a - b);
    const found = after.get(key) ?? [];
    wrong += expected.filter((pitch, i) => found[i] !== pitch).length;
  });
  return wrong;
}

function offNeck(song: Song): number {
  return song.tracks
    .filter((track) => !track.isPercussion)
    .reduce((count, track) => {
      const tuning = track.strings.map((string) => string.tuning);
      const neck = NECK_FRETS - track.offset;
      return count + track.measures.flatMap((m) => m.beats.flatMap((b) => b.voices.flatMap((v) => v.notes))).filter((note) => note.fret < 0 || tabFret(tuning, note.string, note.fret) > neck).length;
    }, 0);
}

describe('easyTranspose: lower the key and make it easy to play', () => {
  it('moves every note two semitones down, frets on the neck, at a cost no higher than the plain transposition', () => {
    // Arrange: canon.gp5 (guitar parts) — notes too low to go down stay and are counted.
    const song = readSong(loadFixture('guitarpro5', 'canon.gp5'));
    const plain = transpose(song, SONG, { mode: 'chromatic', amount: -2 });

    // Act
    const result = easyTranspose(song, SONG, -2);

    // Assert
    expect(result.transposition.moved).toBe(plain.moved);
    expect(wrongPitches(song, result.song, -2)).toBe(result.transposition.unplaced);
    expect(offNeck(result.song)).toBe(0);
    expect(result.refingering.before).toEqual(fingeringCost(plain.song, SONG));
    expect(result.refingering.after.total).toBeLessThanOrEqual(result.refingering.before.total);
    assertEditInvariants(result.song);
  });

  it('leaves drum tracks as they were', () => {
    // Arrange
    const song = readSong(loadFixture('guitarpro5', 'nightwish.gp5'));
    const drums = song.tracks.filter((track) => track.isPercussion);

    // Act
    const result = easyTranspose(song, SONG, -3);

    // Assert
    expect(drums.length).toBeGreaterThan(0);
    expect(result.song.tracks.filter((track) => track.isPercussion)).toEqual(drums);
    expect(wrongPitches(song, result.song, -3)).toBe(result.transposition.unplaced);
  });

  it('turns a line up the neck into an open-position line once it is two semitones lower', () => {
    // Arrange: F#4 G#4 A#4 on string 2 (frets 7, 9, 11): two semitones down is E4 F#4 G#4 — open string 1, frets 2 and 4.
    const song = songOnStrings(STANDARD_TUNING, [[[play(4, n(2, 7)), play(4, n(2, 9)), play(4, n(2, 11)), play(4, n(2, 7))]]]);

    // Act
    const result = easyTranspose(song, SONG, -2);

    // Assert
    expect(result.song.tracks[0]?.measures[0]?.beats.map((beat) => `${beat.voices[0]?.notes[0]?.string}/${beat.voices[0]?.notes[0]?.fret}`)).toEqual(['1/0', '1/2', '1/4', '1/0']);
    expect(result.refingering.after.total).toBeLessThan(result.refingering.before.total);
  });

  it('only re-fingers with an amount of 0', () => {
    // Arrange
    const song = songOnStrings(STANDARD_TUNING, [[[play(1, n(2, 5))]]]);

    // Act
    const result = easyTranspose(song, { kind: 'track', trackIndex: 0 }, 0);

    // Assert
    expect(result.transposition).toMatchObject({ moved: 0, unplaced: 0 });
    expect(result.refingering.restrung).toBe(1);
  });
});
