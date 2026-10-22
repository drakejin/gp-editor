import { describe, expect, it } from 'vitest';
import type { BeatAddress } from '../src/edit/addresses';
import { copyBeats, deleteBeatsFlowing, insertBeatsFlowing } from '../src/edit/beat-ranges';
import { parseBeatFragment, serializeBeatFragment } from '../src/edit/fragment-json';
import type { Song } from '../src/model/song';
import { readSong } from '../src/read-song';
import { assertEditInvariants, deepFreeze } from './helpers/edit-songs';
import { type FixtureFolder, loadFixture } from './helpers/fixtures';

/** Real files with several tracks, voices, tuplets and time signatures. */
const FIXTURES: readonly (readonly [FixtureFolder, string])[] = [
  ['guitarpro3', 'other-effects.gp3'],
  ['guitarpro5', 'nightwish.gp5'],
  ['guitarpro5', 'beat-text-lyrics.gp5'],
  ['guitarpro6', 'tuplets.gpx'],
  ['guitarpro7', 'time-signatures.gp'],
];

const ROUNDS = 12;
/** The invariant checks on large files take a while, more so under coverage. */
const SWEEP_TIMEOUT_MS = 60_000;

/** mulberry32, seeded so a failing round can be replayed. */
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

/** A beat of the track that has a slot for the voice; undefined when the track has none. */
function randomBeat(song: Song, trackIndex: number, voiceIndex: number, random: () => number): BeatAddress | undefined {
  const measures = song.tracks[trackIndex]?.measures ?? [];
  const candidates = measures.flatMap((measure, measureIndex) =>
    measure.beats.flatMap((beat, beatIndex) => (beat.voices[voiceIndex] === undefined ? [] : [{ trackIndex, measureIndex, beatIndex, voiceIndex }])),
  );
  return candidates[Math.floor(random() * candidates.length)];
}

/** Notes in one voice of a track (tied pieces included). */
function noteCount(song: Song, trackIndex: number, voiceIndex: number): number {
  const measures = song.tracks[trackIndex]?.measures ?? [];
  return measures.reduce((total, measure) => total + measure.beats.reduce((sum, beat) => sum + (beat.voices[voiceIndex]?.notes.length ?? 0), 0), 0);
}

describe.each(FIXTURES)('copy, cut and paste on %s/%s', (folder, name) => {
  it('keep every note and leave valid songs', () => {
    const song = deepFreeze(readSong(loadFixture(folder, name)));
    const random = createRandom(name.length * 7919);
    let changed = 0;
    for (let round = 0; round < ROUNDS; round++) {
      const trackIndex = Math.floor(random() * song.tracks.length);
      const voiceIndex = random() < 0.75 ? 0 : 1;
      const from = randomBeat(song, trackIndex, voiceIndex, random);
      const to = randomBeat(song, trackIndex, voiceIndex, random);
      const target = randomBeat(song, trackIndex, voiceIndex, random);
      if (from === undefined || to === undefined || target === undefined) {
        continue;
      }
      const fragment = copyBeats(song, from, to);
      const fragmentNotes = fragment.items.reduce((total, item) => total + item.notes.length, 0);
      const cut = deleteBeatsFlowing(song, from, to);
      const pasted = insertBeatsFlowing(song, target, fragment);

      assertEditInvariants(cut);
      assertEditInvariants(pasted);
      expect(parseBeatFragment(JSON.parse(serializeBeatFragment(fragment)))).toEqual(fragment.items.length === 0 ? undefined : fragment);
      changed += (cut === song ? 0 : 1) + (pasted === song ? 0 : 1);
      if (cut !== song) {
        expect(noteCount(cut, trackIndex, voiceIndex)).toBeGreaterThanOrEqual(noteCount(song, trackIndex, voiceIndex) - fragmentNotes);
      }
      if (pasted !== song) {
        expect(noteCount(pasted, trackIndex, voiceIndex)).toBeGreaterThanOrEqual(noteCount(song, trackIndex, voiceIndex) + fragmentNotes);
      }
    }
    expect(changed).toBeGreaterThan(ROUNDS);
  }, SWEEP_TIMEOUT_MS);
});
