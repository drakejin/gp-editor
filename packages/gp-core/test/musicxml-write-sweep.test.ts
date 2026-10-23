import { unzipSync } from 'fflate';
import { describe, expect, it } from 'vitest';
import type { XmlElement } from '../src/formats/gpif/xml';
import { decodeUtf8Strict } from '../src/io/text';
import { readSong } from '../src/read-song';
import { MXL_CONTAINER_ENTRY, MXL_SCORE_ENTRY, encodeMusicXml, writeMusicXmlArchive } from '../src/write/musicxml/musicxml-archive';
import { writeMusicXml } from '../src/write/musicxml/musicxml-writer';
import { type FixtureFolder, listFixtures, loadFixture } from './helpers/fixtures';
import { attribute, child, children, expectSchemaOrder, measuresOf, parseWritten } from './helpers/musicxml-tree';
import { buildNote, songWithNotes } from './helpers/write-song-builder';

const GP_FOLDERS: readonly FixtureFolder[] = ['guitarpro3', 'guitarpro4', 'guitarpro5', 'guitarpro6', 'guitarpro7', 'guitarpro8'];
/**
 * The few fixtures above this size write several megabytes of XML each; the round trip (musicxml-round-trip.test.ts)
 * parses theirs, and the smaller files already reach every element the writer makes.
 */
const MAX_SWEPT_BYTES = 32 * 1024;
const SWEEP_TIMEOUT = 60_000;

function sweptFixtures(folder: FixtureFolder): string[] {
  return listFixtures(folder).filter((name) => loadFixture(folder, name).length <= MAX_SWEPT_BYTES);
}

/** Sequences of the MusicXML 4.0 schema the writer produces, element by element. */
const SCHEMA_ORDERS: Readonly<Record<string, readonly string[]>> = {
  'score-partwise': ['work', 'movement-number', 'movement-title', 'identification', 'defaults', 'credit', 'part-list', 'part'],
  identification: ['creator', 'rights', 'encoding', 'source', 'relation', 'miscellaneous'],
  'score-part': ['identification', 'part-name', 'part-abbreviation', 'group', 'score-instrument', 'player', 'midi-device', 'midi-instrument'],
  'midi-instrument': ['midi-channel', 'midi-name', 'midi-bank', 'midi-program', 'midi-unpitched', 'volume', 'pan', 'elevation'],
  note: [
    'grace', 'chord', 'pitch', 'unpitched', 'rest', 'duration', 'tie', 'instrument', 'voice', 'type', 'dot', 'accidental',
    'time-modification', 'stem', 'notehead', 'notehead-text', 'staff', 'beam', 'notations', 'lyric', 'play', 'listen',
  ],
  attributes: ['divisions', 'key', 'time', 'staves', 'part-symbol', 'instruments', 'clef', 'staff-details', 'transpose'],
  'staff-details': ['staff-type', 'staff-lines', 'line-detail', 'staff-tuning', 'capo', 'staff-size'],
  clef: ['sign', 'line', 'clef-octave-change'],
  time: ['beats', 'beat-type'],
  direction: ['direction-type', 'offset', 'footnote', 'level', 'voice', 'staff', 'sound'],
  barline: ['bar-style', 'footnote', 'level', 'wavy-line', 'segno', 'coda', 'fermata', 'ending', 'repeat'],
  forward: ['duration', 'footnote', 'level', 'voice', 'staff'],
  backup: ['duration'],
  bend: ['bend-alter', 'pre-bend', 'release', 'with-bar'],
  lyric: ['syllabic', 'text', 'extend', 'end-line', 'end-paragraph'],
  'time-modification': ['actual-notes', 'normal-notes', 'normal-type', 'normal-dot'],
  pitch: ['step', 'alter', 'octave'],
  'staff-tuning': ['tuning-step', 'tuning-alter', 'tuning-octave'],
  unpitched: ['display-step', 'display-octave'],
  metronome: ['beat-unit', 'beat-unit-dot', 'per-minute'],
};

function expectSchemaOrderEverywhere(element: XmlElement): void {
  const order = SCHEMA_ORDERS[element.name];
  if (order !== undefined) {
    expectSchemaOrder(element, order);
  }
  element.children.forEach(expectSchemaOrderEverywhere);
}

describe.each(GP_FOLDERS)('MusicXML export of %s fixtures', (folder) => {
  it.each(sweptFixtures(folder))('%s writes a well-formed score in schema order', (name) => {
    // Arrange
    const song = readSong(loadFixture(folder, name));

    // Act
    const root = parseWritten(writeMusicXml(song));

    // Assert
    expect(children(root, 'part')).toHaveLength(song.tracks.length);
    song.tracks.forEach((_, index) => expect(measuresOf(root, index)).toHaveLength(song.measureHeaders.length));
    expectSchemaOrderEverywhere(root);
  }, SWEEP_TIMEOUT);
});

describe('writeMusicXmlArchive', () => {
  it('zips the stored mimetype first, then container.xml naming the score, then the score', () => {
    // Arrange
    const song = songWithNotes([buildNote(1, 0)]);

    // Act
    const entries = unzipSync(writeMusicXmlArchive(song));

    // Assert
    expect(Object.keys(entries)).toEqual(['mimetype', MXL_CONTAINER_ENTRY, MXL_SCORE_ENTRY]);
    expect(decodeUtf8Strict(entries.mimetype ?? new Uint8Array())).toBe('application/vnd.recordare.musicxml');
    const container = parseWritten(decodeUtf8Strict(entries[MXL_CONTAINER_ENTRY] ?? new Uint8Array()) ?? '');
    expect(attribute(child(child(container, 'rootfiles'), 'rootfile'), 'full-path')).toBe(MXL_SCORE_ENTRY);
    expect(decodeUtf8Strict(entries[MXL_SCORE_ENTRY] ?? new Uint8Array())).toBe(writeMusicXml(song));
  });

  it('gives the same bytes for the same song', () => {
    // Arrange
    const song = songWithNotes([buildNote(1, 0)]);

    // Act / Assert
    expect(writeMusicXmlArchive(song)).toEqual(writeMusicXmlArchive(song));
  });
});

describe('encodeMusicXml', () => {
  it('encodes the document as UTF-8, characters outside the BMP included', () => {
    // Arrange / Act
    const bytes = encodeMusicXml('é한🎸');

    // Assert
    expect([...bytes]).toEqual([0xc3, 0xa9, 0xed, 0x95, 0x9c, 0xf0, 0x9f, 0x8e, 0xb8]);
  });
});
