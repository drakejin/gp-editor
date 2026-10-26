import { describe, expect, it } from 'vitest';
import { type Song, readSong } from '../src/index';
import { assertSongInvariants } from './helpers/invariants';
import { listFixtures, loadFixture } from './helpers/fixtures';

function at<T>(items: readonly T[], index: number): T {
  const item = items[index];
  if (item === undefined) {
    throw new Error(`no item at index ${index} (length ${items.length})`);
  }
  return item;
}

function read(name: string): Song {
  return readSong(loadFixture('guitarpro8', name));
}

describe('Guitar Pro 8 (.gp) fixture sweep', () => {
  const names = listFixtures('guitarpro8');

  it('has fixtures', () => {
    expect(names.length).toBe(45);
  });

  it.each(names)('%s parses and passes the song invariants', (name) => {
    // Act
    const song = read(name);

    // Assert
    expect(song.source.format).toBe('gp7');
    assertSongInvariants(song);
  });
});

describe('Guitar Pro 8 (.gp) values', () => {
  it('canon-audio-track: keeps a track icon other than the instrument’s and Guitar Pro’s short names', () => {
    // Act
    const song = read('canon-audio-track.gp');
    const appearance = song.tracks.map((track) => [track.name, track.shortName, track.iconId, track.color]);

    // Assert: GP8 gives its Distortion Guitar icon 24 (our instrument sets say 4); the others are their instrument's
    expect(appearance.slice(0, 2)).toEqual([
      ['Guitar Player', 'dist.guit.', 24, { r: 255, g: 0, b: 0 }],
      ['Low Bassy Sound', 'vln.', undefined, { r: 0, g: 255, b: 255 }],
    ]);
    expect(appearance.slice(6, 9)).toEqual([
      ['The clean guitar', 'el.guit.', undefined, { r: 255, g: 0, b: 0 }],
      ['Track 8', 'el.bs.', undefined, { r: 255, g: 255, b: 0 }],
      ['Percussion', 'drm.', undefined, { r: 0, g: 0, b: 255 }],
    ]);
  });

  it('bank: a short name the same as the name reads as none', () => {
    expect(read('bank.gp').tracks.every((track) => track.shortName === undefined)).toBe(true);
  });

  it('reports the GP8 version and revision', () => {
    expect(read('directions.gp').source.version).toMatch(/^8\.\d+\.\d+ r\d+$/);
  });

  it('faulty: tracks without MIDI channels get distinct free channels, drums get the percussion channel', () => {
    // Act
    const song = read('faulty.gp');

    // Assert
    expect(song.tracks).toHaveLength(6);
    const melodic = song.tracks.filter((t) => !t.isPercussion);
    expect(melodic).toHaveLength(5);
    expect(new Set(melodic.map((t) => t.channelId)).size).toBe(5);
    const drums = at(song.tracks, 5);
    expect(drums.isPercussion).toBe(true);
    expect(song.channels.find((c) => c.id === drums.channelId)).toMatchObject({ isPercussion: true, bank: 128 });
    expect(melodic.map((t) => song.channels.find((c) => c.id === t.channelId)?.program)).toEqual([29, 29, 29, 33, 2]);
  });

  it('beat-tempo-change: each bar takes its first tempo automation', () => {
    const song = read('beat-tempo-change.gp');
    expect(song.measureHeaders.map((h) => h.tempo)).toEqual([120, 100, 121, 121]);
  });

  it('bank: banks from the sound MSB/LSB', () => {
    const song = read('bank.gp');
    const banks = song.tracks.map((t) => song.channels.find((c) => c.id === t.channelId));
    expect(banks.map((c) => [c?.program, c?.bank])).toEqual([
      [25, 0],
      [25, 77],
      [25, 256],
    ]);
  });

  it('bank-change: the first sound is the initial instrument', () => {
    const song = read('bank-change.gp');
    expect(at(song.channels, 0)).toMatchObject({ program: 25, bank: 0 });
  });

  it('harmonics-lowercase: harmonic types are matched case-insensitively', () => {
    const song = read('harmonics-lowercase.gp');
    const types = at(at(song.tracks, 0).measures, 0).beats.map((b) => b.voices[0]?.notes[0]?.effect.harmonic?.type);
    expect(types).toEqual(['natural', 'artificial', 'tapped', 'semi', 'pinch']);
  });

  it('orphan-tempo-automation: tempo automations past the last bar are ignored', () => {
    const song = read('orphan-tempo-automation.gp');
    expect(song.measureHeaders).toHaveLength(100);
    expect(song.tracks).toHaveLength(3);
  });

  it('orphan-tempo-automation: drum notes with out-of-range GPIF strings are placed by their MIDI pitch', () => {
    // Act
    const drums = at(read('orphan-tempo-automation.gp').tracks, 2);

    // Assert
    const frets = new Set(drums.measures.flatMap((m) => m.beats.flatMap((b) => b.voices.flatMap((v) => v.notes.map((n) => n.fret)))));
    expect(drums.isPercussion).toBe(true);
    expect(frets.has(36)).toBe(true);
    expect(frets.has(38)).toBe(true);
  });

  it('header-footer: a two-staff track reads its first staff only', () => {
    // Act
    const song = read('header-footer.gp');

    // Assert
    expect(song.tracks).toHaveLength(1);
    const track = at(song.tracks, 0);
    expect(track.strings.map((s) => s.tuning)).toEqual([64, 59, 55, 50, 45, 40]);
    expect(at(track.measures, 0).clef).toBe('treble');
  });

  it.each([
    ['transposition-tonality-c.gp', 0],
    ['transposition-tonality-fsharp.gp', 6],
    ['eb-ks.gp', -4],
  ])('%s keeps the written key signature (%d)', (name, expected) => {
    const measure = at(at(read(name).tracks, 0).measures, 0);
    expect(measure.keySignature).toBe(expected);
  });
});
