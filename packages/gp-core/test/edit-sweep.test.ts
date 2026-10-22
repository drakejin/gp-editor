import { describe, expect, it } from 'vitest';
import { type BeatAddress, deleteBeat, insertBeat, setBeatDuration } from '../src/edit/beats';
import { type StringAddress, deleteNote, setNoteFret } from '../src/edit/edit-song';
import { BEND_PRESETS, type ToggleableEffect, setNoteBend, setNoteHarmonic, setNoteSlides, setNoteTied, toggleNoteEffect } from '../src/edit/effects';
import { setKeySignature, setRepeat, setTempo, setTimeSignature } from '../src/edit/measure-headers';
import { deleteMeasure, insertMeasure } from '../src/edit/measures';
import { NOTE_VALUES, NORMAL_TUPLET, durationTicks } from '../src/model/defaults';
import type { Duration, SlideType, Song } from '../src/model/song';
import { readSong } from '../src/read-song';
import { assertEditInvariants, deepFreeze, editInvariantViolations } from './helpers/edit-songs';
import { type FixtureFolder, loadFixture } from './helpers/fixtures';

/** Real files whose every measure already passes the edit invariants (checked below). */
const SWEEP_FIXTURES: readonly (readonly [FixtureFolder, string])[] = [
  ['guitarpro3', 'other-effects.gp3'],
  ['guitarpro4', 'slides.gp4'],
  ['guitarpro5', 'nightwish.gp5'],
  ['guitarpro5', 'beat-text-lyrics.gp5'],
  ['guitarpro5', 'chords.gp5'],
  ['guitarpro6', 'tuplets.gpx'],
  ['guitarpro7', 'time-signatures.gp'],
  ['guitarpro8', 'custom-beaming.gp'],
];

const STEPS = 120;

/** mulberry32: small seeded generator so a failing sequence can be replayed. */
function createRandom(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

type Random = () => number;

function pick<T>(random: Random, items: readonly T[]): T {
  const index = Math.floor(random() * items.length);
  if (index >= items.length) {
    throw new Error('pick from an empty list');
  }
  return items[index] as T;
}

function intBetween(random: Random, min: number, max: number): number {
  return min + Math.floor(random() * (max - min + 1));
}

/** Mostly an address of an existing event; sometimes one past the end, to exercise the invalid paths. */
function randomBeat(song: Song, random: Random): BeatAddress {
  const trackIndex = intBetween(random, 0, song.tracks.length - 1);
  const measureIndex = intBetween(random, 0, song.measureHeaders.length - 1);
  const beats = song.tracks[trackIndex]?.measures[measureIndex]?.beats ?? [];
  const beatIndex = intBetween(random, 0, beats.length);
  const voiceCount = beats[beatIndex]?.voices.length ?? 1;
  return { trackIndex, measureIndex, beatIndex, voiceIndex: random() < 0.75 ? 0 : intBetween(random, 0, voiceCount) };
}

function randomString(song: Song, random: Random): StringAddress {
  const at = randomBeat(song, random);
  const voice = song.tracks[at.trackIndex]?.measures[at.measureIndex]?.beats[at.beatIndex]?.voices[at.voiceIndex];
  const played = voice?.notes ?? [];
  const string = played.length > 0 && random() < 0.8 ? pick(random, played).string : intBetween(random, 1, 7);
  return { ...at, string };
}

function randomDuration(random: Random): Duration {
  const dotted = random() < 0.2;
  return {
    value: pick(random, NOTE_VALUES),
    dotted,
    doubleDotted: !dotted && random() < 0.05,
    tuplet: random() < 0.15 ? pick(random, [{ enters: 3, times: 2 }, { enters: 5, times: 4 }]) : NORMAL_TUPLET,
  };
}

const EFFECTS: readonly ToggleableEffect[] = ['hammer', 'palmMute', 'letRing', 'vibrato', 'deadNote', 'ghostNote', 'staccato', 'tapping', 'slapping'];
const SLIDES: readonly SlideType[] = ['shift', 'legato', 'outDownwards', 'intoFromBelow'];

/** setNoteFret only where the voice already holds an event: filling an empty voice slot is outside the timeline model. */
function setFretOnEvent(song: Song, random: Random): Song {
  const at = randomString(song, random);
  const voice = song.tracks[at.trackIndex]?.measures[at.measureIndex]?.beats[at.beatIndex]?.voices[at.voiceIndex];
  return voice === undefined || voice.isEmpty ? song : setNoteFret(song, at, intBetween(random, 0, 24));
}

const EDITS: readonly ((song: Song, random: Random) => Song)[] = [
  (song, random) => setBeatDuration(song, randomBeat(song, random), randomDuration(random)),
  (song, random) => setBeatDuration(song, randomBeat(song, random), randomDuration(random)),
  (song, random) => insertBeat(song, randomBeat(song, random), random() < 0.5 ? 'before' : 'after'),
  (song, random) => deleteBeat(song, randomBeat(song, random)),
  (song, random) => toggleNoteEffect(song, randomString(song, random), pick(random, EFFECTS)),
  (song, random) => setNoteTied(song, randomString(song, random), random() < 0.7),
  (song, random) => setNoteSlides(song, randomString(song, random), SLIDES.filter(() => random() < 0.3)),
  (song, random) => setNoteBend(song, randomString(song, random), pick(random, [BEND_PRESETS.half, BEND_PRESETS.bendRelease, undefined])),
  (song, random) => setNoteHarmonic(song, randomString(song, random), random() < 0.5 ? { type: 'artificial', data: 12 } : undefined),
  (song, random) => deleteNote(song, randomString(song, random)),
  setFretOnEvent,
  (song, random) => insertMeasure(song, intBetween(random, 0, song.measureHeaders.length - 1), random() < 0.5 ? 'before' : 'after'),
  (song, random) => deleteMeasure(song, intBetween(random, 0, song.measureHeaders.length - 1)),
  (song, random) =>
    setTimeSignature(song, intBetween(random, 0, song.measureHeaders.length - 1), {
      numerator: intBetween(random, 1, 9),
      denominator: pick(random, [2, 4, 8, 16]),
    }),
  (song, random) => setTempo(song, intBetween(random, 0, song.measureHeaders.length - 1), intBetween(random, 40, 240)),
  (song, random) => setKeySignature(song, intBetween(random, 0, song.measureHeaders.length - 1), intBetween(random, -7, 7)),
  (song, random) => setRepeat(song, intBetween(random, 0, song.measureHeaders.length - 1), { repeatOpen: random() < 0.5, repeatClose: intBetween(random, 0, 3) }),
];

describe('random edit sequences on real files', () => {
  it.each(SWEEP_FIXTURES)('%s/%s keeps every invariant after each edit', (folder, name) => {
    // Arrange
    const original = deepFreeze(readSong(loadFixture(folder, name)));
    expect(editInvariantViolations(original)).toEqual([]);
    const random = createRandom(name.length * 7919 + folder.length);
    let song = original;
    let changes = 0;

    // Act + Assert after every step
    for (let step = 0; step < STEPS; step++) {
      const next = deepFreeze(pick(random, EDITS)(song, random));
      changes += next === song ? 0 : 1;
      expect(editInvariantViolations(next), `step ${step}`).toEqual([]);
      song = next;
    }
    assertEditInvariants(song);
    expect(changes).toBeGreaterThan(STEPS / 4);
  });
});

/** Start, notes and length of every played event of one voice in a measure. */
function playedEvents(song: Song, at: BeatAddress, voiceIndex: number): string[] {
  const beats = song.tracks[at.trackIndex]?.measures[at.measureIndex]?.beats ?? [];
  return beats.flatMap((beat) => {
    const voice = beat.voices[voiceIndex];
    if (voice === undefined || voice.isEmpty || voice.notes.length === 0) {
      return [];
    }
    return [`${beat.start}:${voice.notes.map((note) => `${note.string}/${note.fret}`).join(',')}:${durationTicks(voice.duration)}`];
  });
}

/** An event of any voice of a random measure (secondary voices included), else a random address. */
function randomEvent(song: Song, random: Random): BeatAddress {
  const at = randomBeat(song, random);
  const beats = song.tracks[at.trackIndex]?.measures[at.measureIndex]?.beats ?? [];
  const events = beats.flatMap((beat, beatIndex) => beat.voices.flatMap((voice, voiceIndex) => (voice.isEmpty ? [] : [{ beatIndex, voiceIndex }])));
  return events.length === 0 ? at : { ...at, ...pick(random, events) };
}

/** Every event of a secondary voice in the song. */
function secondaryEvents(song: Song): BeatAddress[] {
  return song.tracks.flatMap((track, trackIndex) =>
    track.measures.flatMap((measure, measureIndex) =>
      measure.beats.flatMap((beat, beatIndex) =>
        beat.voices.flatMap((voice, voiceIndex) => (voiceIndex > 0 && !voice.isEmpty ? [{ trackIndex, measureIndex, beatIndex, voiceIndex }] : [])),
      ),
    ),
  );
}

const BEAT_EDITS: readonly ((song: Song, at: BeatAddress, random: Random) => Song)[] = [
  (song, at, random) => setBeatDuration(song, at, randomDuration(random)),
  (song, at, random) => insertBeat(song, at, random() < 0.5 ? 'before' : 'after'),
  (song, at) => deleteBeat(song, at),
];

function expectOnlyVoiceChanged(before: Song, after: Song, at: BeatAddress): void {
  expect(after.measureHeaders).toBe(before.measureHeaders);
  after.tracks.forEach((track, trackIndex) => {
    const original = before.tracks[trackIndex];
    if (trackIndex !== at.trackIndex) {
      expect(track).toBe(original);
      return;
    }
    track.measures.forEach((measure, measureIndex) => {
      if (measureIndex !== at.measureIndex) {
        expect(measure).toBe(original?.measures[measureIndex]);
      }
    });
  });
  for (let voiceIndex = 0; voiceIndex < 4; voiceIndex++) {
    if (voiceIndex !== at.voiceIndex) {
      expect(playedEvents(after, at, voiceIndex)).toEqual(playedEvents(before, at, voiceIndex));
    }
  }
}

describe('random beat edits on multi-voice files', () => {
  it.each([
    ['guitarpro5', 'nightwish.gp5'],
    ['guitarpro6', 'time-signatures.gpx'],
    ['guitarpro7', 'time-signatures.gp'],
  ] as const)('%s/%s never move another voice\'s notes or touch another measure', (folder, name) => {
    // Arrange
    let song = deepFreeze(readSong(loadFixture(folder, name)));
    const random = createRandom(name.length * 104729);
    let secondaryChanges = 0;

    // Act + Assert after every step
    for (let step = 0; step < STEPS; step++) {
      const secondary = random() < 0.5 ? secondaryEvents(song) : [];
      const at = secondary.length > 0 ? pick(random, secondary) : randomEvent(song, random);
      const next = deepFreeze(pick(random, BEAT_EDITS)(song, at, random));
      if (next !== song) {
        expectOnlyVoiceChanged(song, next, at);
        secondaryChanges += at.voiceIndex > 0 ? 1 : 0;
      }
      expect(editInvariantViolations(next), `step ${step}`).toEqual([]);
      song = next;
    }
    expect(secondaryChanges).toBeGreaterThan(0);
  });
});
