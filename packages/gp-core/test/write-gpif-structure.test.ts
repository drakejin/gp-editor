import { unzipSync } from 'fflate';
import { describe, expect, it } from 'vitest';
import { detectFormat } from '../src/formats/detect';
import { type XmlElement, attribute, child, parseXml } from '../src/formats/gpif/xml';
import { decodeUtf8Lenient } from '../src/io/text';
import { readSong } from '../src/read-song';
import { writeSong } from '../src/write/index';
import { binaryStylesheet, layoutConfigurationOf, partConfigurationOf } from '../src/write/gpif/gp7-container';
import { type FixtureFolder, loadFixture } from './helpers/fixtures';

/*
 * The document and container are checked against real Guitar Pro files: the entries a Guitar Pro 7 file has, the binary
 * view settings in the layout Guitar Pro reads, and for every object of a simple Guitar Pro 8 file the element names it
 * has, in Guitar Pro's order.
 */

const GP7_ENTRIES = [
  'Content/',
  'Content/BinaryStylesheet',
  'Content/LayoutConfiguration',
  'Content/PartConfiguration',
  'Content/Preferences.json',
  'Content/score.gpif',
  'VERSION',
];

function entriesOf(bytes: Uint8Array): Readonly<Record<string, Uint8Array>> {
  return unzipSync(bytes);
}

function scoreOf(bytes: Uint8Array): XmlElement {
  const score = entriesOf(bytes)['Content/score.gpif'];
  if (score === undefined) {
    throw new Error('no score.gpif');
  }
  return parseXml(decodeUtf8Lenient(score));
}

function written(folder: FixtureFolder, name: string): Uint8Array {
  return writeSong(readSong(loadFixture(folder, name)), 'gp');
}

/** Child element names; a Property is told apart by its name attribute, as Guitar Pro orders properties by name. */
function childNames(element: XmlElement | undefined): readonly string[] {
  return (element?.children ?? []).map((c) => (c.name === 'Property' ? `Property[${attribute(c, 'name') ?? ''}]` : c.name));
}

function path(root: XmlElement, names: readonly string[]): XmlElement | undefined {
  return names.reduce<XmlElement | undefined>((element, name) => child(element, name), root);
}

/**
 * What Guitar Pro 8 writes into e.gp that this writer leaves out, per object: GP8's score views, RSE (Realistic Sound
 * Engine) master effects and sound bank patches, default beaming, the stem direction Guitar Pro computes (written only
 * when a voice has its own) and a beat's pickup settings (its only properties there).
 */
const NOT_WRITTEN: Readonly<Record<string, readonly string[]>> = {
  GPIF: ['ScoreViews'],
  MasterTrack: ['RSE'],
  'Tracks/Track/Sounds/Sound': ['RSE'],
  'MasterBars/MasterBar': ['XProperties'],
  'Beats/Beat': ['TransposedPitchStemOrientation', 'Properties'],
};

const OBJECTS: readonly (readonly string[])[] = [
  [],
  ['Score'],
  ['MasterTrack'],
  ['MasterTrack', 'Automations', 'Automation'],
  ['Tracks', 'Track'],
  ['Tracks', 'Track', 'InstrumentSet'],
  ['Tracks', 'Track', 'InstrumentSet', 'Elements', 'Element'],
  ['Tracks', 'Track', 'InstrumentSet', 'Elements', 'Element', 'Articulations', 'Articulation'],
  ['Tracks', 'Track', 'Sounds', 'Sound'],
  ['Tracks', 'Track', 'Sounds', 'Sound', 'MIDI'],
  ['Tracks', 'Track', 'MidiConnection'],
  ['Tracks', 'Track', 'Lyrics', 'Line'],
  ['Tracks', 'Track', 'Staves', 'Staff', 'Properties'],
  ['Tracks', 'Track', 'Automations', 'Automation'],
  ['MasterBars', 'MasterBar'],
  ['MasterBars', 'MasterBar', 'Key'],
  ['Bars', 'Bar'],
  ['Voices', 'Voice'],
  ['Beats', 'Beat'],
  ['Notes', 'Note'],
  ['Notes', 'Note', 'Properties'],
  ['Rhythms', 'Rhythm'],
];

describe('gp container', () => {
  it('holds the entries of a Guitar Pro 7 file, with VERSION 7.0', () => {
    // Arrange
    const original = Object.keys(entriesOf(loadFixture('guitarpro7', 'notes.gp')));

    // Act
    const entries = entriesOf(written('guitarpro7', 'notes.gp'));

    // Assert
    expect(Object.keys(entries)).toEqual(GP7_ENTRIES);
    expect(original).toEqual(GP7_ENTRIES);
    expect(decodeUtf8Lenient(entries.VERSION ?? new Uint8Array())).toBe('7.0');
    expect(JSON.parse(decodeUtf8Lenient(entries['Content/Preferences.json'] ?? new Uint8Array()))).toBeTypeOf('object');
  });

  it('is detected as a Guitar Pro 7 file', () => {
    // Arrange / Act
    const bytes = written('guitarpro5', 'notes.gp5');

    // Assert
    expect(detectFormat(bytes)?.format).toBe('gp7');
  });

  it('gives the same bytes for the same song', () => {
    // Arrange / Act / Assert
    expect(written('guitarpro7', 'chords.gp')).toEqual(written('guitarpro7', 'chords.gp'));
  });

  it('claims Guitar Pro 7.6 in the document', () => {
    // Arrange / Act
    const root = scoreOf(written('guitarpro5', 'notes.gp5'));

    // Assert
    expect(child(root, 'GPVersion')?.text).toBe('7.6.0');
    expect(attribute(child(root, 'GPRevision'), 'required')).toBe('12021');
    expect(child(child(root, 'Encoding'), 'EncodingDescription')?.text).toBe('GP7');
  });
});

/** Reads a PartConfiguration as documented in gp7-container.ts: view count, views of track flags, active view. */
function readPartConfiguration(bytes: Uint8Array): { views: number[][]; active: number } {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let at = 4;
  const views = Array.from({ length: view.getInt32(0) }, () => {
    const count = view.getInt32(at + 1);
    const flags = [...bytes.subarray(at + 5, at + 5 + count)];
    at += 5 + count;
    return flags;
  });
  const active = view.getInt32(at);
  expect(at + 4).toBe(bytes.length);
  return { views, active };
}

describe('gp view settings', () => {
  it.each([
    ['guitarpro8', 'e.gp', 1],
    ['guitarpro8', 'bank.gp', 3],
    ['guitarpro7', 'track-volume.gp', 7],
  ] as const)('reads %s/%s with the documented PartConfiguration layout', (folder, name, tracks) => {
    // Arrange
    const bytes = entriesOf(loadFixture(folder, name))['Content/PartConfiguration'] ?? new Uint8Array();

    // Act
    const { views } = readPartConfiguration(bytes);

    // Assert
    expect(views.map((flags) => flags.length)).toEqual([tracks, ...Array.from({ length: tracks }, () => 1)]);
  });

  it('writes a multi-track view and one view per track, drums with notation only', () => {
    // Arrange / Act
    const { views, active } = readPartConfiguration(partConfigurationOf([false, true, false]));

    // Assert
    expect(views).toEqual([[3, 1, 3], [3], [1], [3]]);
    expect(active).toBe(0);
  });

  it('writes the layout of every view along the part configuration', () => {
    // Arrange
    const original = entriesOf(loadFixture('guitarpro8', 'bank.gp'))['Content/LayoutConfiguration'];

    // Act
    const layout = layoutConfigurationOf(3);

    // Assert: zoom, view, multi-voice cursor, 3 + 3 visibility bytes, selected track
    expect(layout.length).toBe(original?.length);
    expect([...layout]).toEqual([0, 0, 0, 4, 1, 0, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0, 0, 0, 0]);
  });

  it('writes a style sheet of boolean entries', () => {
    // Arrange / Act
    const bytes = binaryStylesheet();
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);

    // Assert
    expect(view.getInt32(0)).toBe(2);
    const keyLength = bytes[4] ?? 0;
    expect(decodeUtf8Lenient(bytes.subarray(5, 5 + keyLength))).toBe('Global/DisplayTuning');
    expect([...bytes.subarray(5 + keyLength, 7 + keyLength)]).toEqual([0, 1]);
  });
});

/** Every instance of the element at `names` (e.g. every Notes/Note). */
function instances(root: XmlElement, names: readonly string[]): readonly XmlElement[] {
  return names.reduce<readonly XmlElement[]>(
    (elements, name) => elements.flatMap((element) => element.children.filter((c) => c.name === name)),
    [root],
  );
}

/**
 * Guitar Pro 7.0 wrote a note's properties in another order (Midi after TransposedPitch, effects last) and Guitar Pro 8
 * keeps that order for notes it did not change; Guitar Pro 7.6+ orders them as this writer does.
 */
function isOldStyle(order: readonly string[]): boolean {
  return order.indexOf('Property[Midi]') > order.indexOf('Property[TransposedPitch]');
}

/** "a before b" for every two child names of an element, over all its instances. */
function precedences(roots: readonly XmlElement[], names: readonly string[]): ReadonlySet<string> {
  const pairs = new Set<string>();
  for (const element of roots.flatMap((root) => instances(root, names))) {
    const order = [...new Set(childNames(element))];
    if (isOldStyle(order)) {
      continue;
    }
    order.forEach((first, i) => order.slice(i + 1).forEach((second) => pairs.add(`${first} < ${second}`)));
  }
  return pairs;
}

const GP8_FIXTURES = ['canon-audio-track.gp', 'faulty.gp', 'directions.gp', 'beat-tempo-change.gp', 'bank.gp', 'timer.gp'];
const ORDERED_OBJECTS: readonly (readonly string[])[] = [
  ['Tracks', 'Track'],
  ['MasterBars', 'MasterBar'],
  ['Beats', 'Beat'],
  ['Notes', 'Note'],
  ['Notes', 'Note', 'Properties'],
];

describe('gp element order against Guitar Pro 8 files with effects', () => {
  const originals = GP8_FIXTURES.map((name) => scoreOf(loadFixture('guitarpro8', name)));
  const ours = [...GP8_FIXTURES.map((name) => scoreOf(written('guitarpro8', name))), scoreOf(written('guitarpro5', 'effects.gp5'))];

  it.each(ORDERED_OBJECTS.map((names) => [names.join('/'), names] as const))('%s never orders two elements against Guitar Pro', (_label, names) => {
    // Arrange
    const guitarPro = precedences(originals, names);

    // Act
    const contradictions = [...precedences(ours, names)].filter((pair) => {
      const [first, second] = pair.split(' < ');
      return guitarPro.has(`${second} < ${first}`) && !guitarPro.has(pair);
    });

    // Assert
    expect(contradictions).toEqual([]);
  });
});

describe('gp document structure against Guitar Pro 8', () => {
  const original = scoreOf(loadFixture('guitarpro8', 'e.gp'));
  const ours = scoreOf(written('guitarpro8', 'e.gp'));

  it.each(OBJECTS.map((names) => [names.join('/') || 'GPIF', names] as const))('%s has the elements Guitar Pro writes', (label, names) => {
    // Arrange
    const leftOut = NOT_WRITTEN[label] ?? [];
    const expected = childNames(path(original, names)).filter((name) => !leftOut.includes(name));

    // Act
    const actual = new Set(childNames(path(ours, names)));

    // Assert
    expect(expected.filter((name) => !actual.has(name))).toEqual([]);
  });

  it.each(OBJECTS.map((names) => [names.join('/') || 'GPIF', names] as const))('%s keeps them in Guitar Pro’s order', (_label, names) => {
    // Arrange
    const expected = childNames(path(original, names));
    const actual = childNames(path(ours, names));

    // Act
    const common = (list: readonly string[], other: readonly string[]): string[] =>
      [...new Set(list)].filter((name) => other.includes(name));

    // Assert
    expect(common(actual, expected)).toEqual(common(expected, actual));
  });
});
