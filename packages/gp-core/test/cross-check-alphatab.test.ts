// Cross-check of every file gp-core writes with an independent reader: alphaTab (https://github.com/CoderLine/alphaTab,
// MPL-2.0, @coderline/alphatab, a test-only devDependency pinned in package.json). Guitar Pro itself cannot run here;
// alphaTab reads GP3–GP5, GPX and GP7/GP8 files and is the closest stand-in.
//
// Every fixture `readSong` reads (GP1–GP8, Power Tab, TablEdit, MIDI, MusicXML) is written as 'gp', 'gp5', 'gp4' and
// 'gp3'; gp-core and alphaTab each read the written bytes, and the two readings must agree on what both models hold
// (cross-check-view.ts): title, artist, tempo, track names, tunings and capos, bars, time and key signatures, repeats,
// every voice's beats and durations (dots, tuplets), notes (string, fret, tie) and a sample of effects, chord names, beat
// texts and lyrics. gp-core's reading of the written file is the reference: the round-trip tests (write-round-trip,
// write-gpif-round-trip, write-gp34-writer) pin it to what each format holds (write-expected*.ts).
//
// The differences alphaTab reads on purpose are in alphatab-known-differences.ts, each with its evidence; the last
// describe block below pins that evidence on Guitar Pro's own files, so a rule cannot hide a mismatch of our writer.
import { readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { plainDuration } from '../src/model/defaults';
import type { Song } from '../src/model/song';
import { type WritableFormat, writeSong } from '../src/write/index';
import { compareReadings, crossCheck, sourceFiles } from './helpers/alphatab-cross-check';
import { explain, FIELD_RULES, TAG_RULES, unexplainedDifferences } from './helpers/alphatab-known-differences';
import { viewDifferences } from './helpers/cross-check-diff';
import { type NoteView, type ScoreView, viewFromSong } from './helpers/cross-check-view';
import { type FixtureFolder, loadFixture } from './helpers/fixtures';
import { buildNote, buildSong, buildVoice } from './helpers/write-song-builder';

const FORMATS: readonly WritableFormat[] = ['gp', 'gp5', 'gp4', 'gp3'];
/** The differences a failing case prints. */
const SHOWN_DIFFERENCES = 5;
/** The largest fixtures take a second to write and read three times under load. */
const SLOW_TEST_TIMEOUT = 30000;

/** Every readable fixture, labelled `folder/name`. */
const SOURCES = sourceFiles().map((source) => [`${source.folder}/${source.name}`, source] as const);

describe.each(FORMATS)('alphaTab reads every fixture written as %s as gp-core does', (format) => {
  it.each(SOURCES)(
    '%s',
    (_label, source) => {
      // Arrange / Act
      const { unexplained } = crossCheck(source, format);

      // Assert
      expect(unexplained.slice(0, SHOWN_DIFFERENCES)).toEqual([]);
    },
    SLOW_TEST_TIMEOUT,
  );
});

/** `view` with the first note of track 1, bar 1, voice 1, beat `beat` changed by `change`. */
function withNote(view: ScoreView, beat: number, change: (note: NoteView) => NoteView): ScoreView {
  const [track, ...tracks] = view.tracks;
  const [bar, ...bars] = track?.bars ?? [];
  const [voice, ...voices] = bar?.voices ?? [];
  const changed = (voice ?? []).map((candidate, index) =>
    index === beat ? { ...candidate, notes: candidate.notes.map((note, n) => (n === 0 ? change(note) : note)) } : candidate,
  );
  return track === undefined || bar === undefined ? view : { ...view, tracks: [{ ...track, bars: [{ ...bar, voices: [changed, ...voices] }, ...bars] }, ...tracks] };
}

/** A song of one bar: a hammer-on on string 1, then a note on `nextString`. */
function hammerSong(nextString: number): Song {
  return buildSong({
    tracks: [{ measures: [[{ voice: buildVoice([buildNote(1, 3, { effect: { hammer: true } })]) }, { voice: buildVoice([buildNote(nextString, 5)]) }]] }],
  });
}

function unexplainedOf(song: Song, read: ScoreView, format: WritableFormat): readonly string[] {
  const expected = viewFromSong(song);
  return unexplainedDifferences(viewDifferences(expected, read), { format, expected, song }).map((difference) => difference.path);
}

describe('the cross-check itself', () => {
  it('reports a fret alphaTab would read differently', () => {
    // Arrange
    const song = hammerSong(1);

    // Act
    const unexplained = unexplainedOf(song, withNote(viewFromSong(song), 1, (note) => ({ ...note, fret: 7 })), 'gp5');

    // Assert
    expect(unexplained).toEqual(['score.tracks[0].bars[0].voices[0][1].notes[0].fret']);
  });

  it('does not excuse a lost hammer-on that has a note to land on', () => {
    // Arrange
    const song = hammerSong(1);

    // Act
    const unexplained = unexplainedOf(song, withNote(viewFromSong(song), 0, (note) => ({ ...note, effects: [] })), 'gp5');

    // Assert
    expect(unexplained).toEqual(['score.tracks[0].bars[0].voices[0][0].notes[0].effects']);
  });

  it('excuses a hammer-on alphaTab drops because no later note is on its string', () => {
    // Arrange
    const song = hammerSong(2);

    // Act
    const unexplained = unexplainedOf(song, withNote(viewFromSong(song), 0, (note) => ({ ...note, effects: [] })), 'gp5');

    // Assert
    expect(unexplained).toEqual([]);
  });

  it('writes the files of every fixture folder', () => {
    // Arrange
    const fixturesDir = join(import.meta.dirname, 'fixtures');
    const folders = readdirSync(fixturesDir, { withFileTypes: true }).filter((entry) => entry.isDirectory()).map((entry) => entry.name);

    // Act
    const swept = new Set(sourceFiles().map((source) => source.folder));

    // Assert
    expect(folders.filter((folder) => !swept.has(folder as FixtureFolder))).toEqual([]);
    expect(swept.size).toBeGreaterThanOrEqual(10);
  });
});

/** Guitar Pro's own file showing each known difference, and the format family its rules are for. */
const EVIDENCE: readonly (readonly [string, FixtureFolder, string, WritableFormat])[] = [
  ['lone-tie', 'guitarpro5', 'canon.gp5', 'gp5'],
  ['drum-tuning', 'guitarpro5', 'percussion-all.gp5', 'gp5'],
  ['gp5-drum-articulations', 'guitarpro5', 'percussion-all.gp5', 'gp5'],
  ['gpif-drum-output', 'guitarpro7', 'drum-tabs.gp', 'gp'],
  ['gp34-empty-beat', 'guitarpro3', 'effects.gp3', 'gp3'],
  ['lone-slide-or-hammer', 'guitarpro5', 'hammer.gp5', 'gp5'],
  ['lone-slide-or-hammer', 'guitarpro3', 'slides.gp3', 'gp3'],
  ['wide-vibrato-as-slight', 'guitarpro4', 'vibrato.gp4', 'gp4'],
  ['wide-vibrato-as-slight', 'guitarpro5', 'effects.gp5', 'gp5'],
  ['gp3-tremolo-bar', 'guitarpro3', 'effects.gp3', 'gp3'],
  ['gp34-dead-grace', 'guitarpro4', 'fade-to-black.gp4', 'gp4'],
];

/** Rules without a Guitar Pro file showing them: alphaTab's source is the evidence, or it is a format limit. */
const WITHOUT_GUITAR_PRO_FILE: readonly string[] = ['secondary-tuplet', 'text-outside-windows-1252'];

describe('alphaTab reads Guitar Pro’s own files the same way (evidence for each known difference)', () => {
  it.each(EVIDENCE)('%s: %s/%s', (id, folder, name, format) => {
    // Arrange
    const original = loadFixture(folder, name);

    // Act
    const { differences, context } = compareReadings(original, format, folder === 'guitarpro7' ? 'gpif' : 'binary');

    // Assert
    expect(differences.some((difference) => explain(difference, context)?.includes(id) === true)).toBe(true);
  });

  it('names a Guitar Pro file for every known difference but those that cannot have one', () => {
    // Arrange
    const ids = [...FIELD_RULES, ...TAG_RULES].map((rule) => rule.id);

    // Act
    const shown = new Set([...EVIDENCE.map(([id]) => id), ...WITHOUT_GUITAR_PRO_FILE]);

    // Assert
    expect(ids.filter((id) => !shown.has(id))).toEqual([]);
  });

  it('reads only the outer tuplet of a tuplet inside a tuplet that gp-core writes and reads back', () => {
    // Arrange: a triplet of eighths inside a triplet of quarters
    const nested = { ...plainDuration(8), tuplet: { enters: 3, times: 2 }, innerTuplet: { enters: 3, times: 2 } };
    const song = buildSong({ tracks: [{ measures: [[{ voice: buildVoice([buildNote(1, 3)], nested) }]] }] });

    // Act
    const { differences, context } = compareReadings(writeSong(song, 'gp'), 'gp');

    // Assert
    expect(context.song.tracks[0]?.measures[0]?.beats[0]?.voices[0]?.duration.innerTuplet).toEqual({ enters: 3, times: 2 });
    expect(differences.map((difference) => [difference.expected, difference.actual, explain(difference, context)])).toEqual([
      ['8(3:2)(3:2)', '8(3:2)', ['secondary-tuplet']],
    ]);
  });

  it('shows text windows-1252 cannot hold differently in a GP5 file, and gp-core reads it back as written', () => {
    // Arrange
    const song = buildSong({ info: { title: 'Song ♩' }, tracks: [{ measures: [[{ voice: buildVoice([buildNote(1, 3)]) }]] }] });

    // Act
    const { differences, context } = compareReadings(writeSong(song, 'gp5'), 'gp5');

    // Assert
    expect(context.song.info.title).toBe('Song ♩');
    expect(differences.map((difference) => [difference.path, explain(difference, context)])).toEqual([['score.title', ['text-outside-windows-1252']]]);
  });
});

describe('alphaTab reads the practice fields gp-core writes', () => {
  it('reads a GP5 note’s duration percent (flag 0x01, a double) without losing its place in the file', () => {
    // Arrange: the second note plays 60% of its length
    const song = buildSong({
      tracks: [{ measures: [[{ voice: buildVoice([buildNote(1, 3)]) }, { voice: buildVoice([buildNote(2, 5, { audio: { durationPercent: 60, offsetPercent: 0, velocityOffset: 0 } })]) }]] }],
    });

    // Act
    const { context, unexplained } = compareReadings(writeSong(song, 'gp5'), 'gp5');

    // Assert
    expect(context.song.tracks[0]?.measures[0]?.beats[1]?.voices[0]?.notes[0]?.audio?.durationPercent).toBe(60);
    expect(unexplained).toEqual([]);
  });

  it('reads a decimal tempo from a .gp file', () => {
    // Arrange
    const song = buildSong({ headers: [{ tempo: 92.5 }], tracks: [{ measures: [[{ voice: buildVoice([buildNote(1, 3)]) }]] }] });

    // Act
    const { context, unexplained } = compareReadings(writeSong(song, 'gp'), 'gp');

    // Assert
    expect(context.song.measureHeaders[0]?.tempo).toBe(92.5);
    expect(unexplained).toEqual([]);
  });
});
