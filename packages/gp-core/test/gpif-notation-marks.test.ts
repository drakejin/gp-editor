/**
 * Fingering, slash notation and beaming in GPIF (GP6–GP8): the fixtures, and hand-written documents for what they lack.
 */
import { describe, expect, it } from 'vitest';
import { readPartConfiguration } from '../src/formats/gpif/part-configuration';
import { readGpifDocument } from '../src/formats/gpif/gpif-reader';
import { gpifToSong } from '../src/formats/gpif/gpif-to-song';
import { readSong } from '../src/read-song';
import type { Finger, Song, Voice } from '../src/model/song';
import { type FixtureFolder, loadFixture } from './helpers/fixtures';
import { assertSongInvariants } from './helpers/invariants';

const FINGERS: readonly Finger[] = ['thumb', 'index', 'middle', 'annular', 'little'];

function read(folder: FixtureFolder, name: string): Song {
  const song = readSong(loadFixture(folder, name));
  assertSongInvariants(song);
  return song;
}

/** The first voice of every beat of a bar of track 1. */
function voices(song: Song, measureIndex: number): readonly Voice[] {
  return (song.tracks[0]?.measures[measureIndex]?.beats ?? []).flatMap((beat) => beat.voices.slice(0, 1));
}

function firstNotes(song: Song): readonly { readonly leftFinger?: Finger; readonly rightFinger?: Finger }[] {
  return voices(song, 0).flatMap((voice) => voice.notes);
}

describe('GPIF fingering', () => {
  it.each([
    ['guitarpro7', 'fingering.gp'],
    ['guitarpro6', 'fingering.gpx'],
  ] as const)('%s/%s: P I M A C are thumb … little, left hand then right hand', (folder, name) => {
    // Act
    const notes = firstNotes(read(folder, name));

    // Assert
    expect(notes.map((note) => note.leftFinger)).toEqual([...FINGERS, ...FINGERS.map(() => undefined)]);
    expect(notes.map((note) => note.rightFinger)).toEqual([...FINGERS.map(() => undefined), ...FINGERS]);
  });

  it('ignores a letter Guitar Pro does not write', () => {
    // Act
    const song = toSong({ notes: note(0, 0, 3, '<LeftFingering>Q</LeftFingering><RightFingering>i</RightFingering>') });

    // Assert
    expect(firstNotes(song)[0]).not.toHaveProperty('leftFinger');
    expect(firstNotes(song)[0]).not.toHaveProperty('rightFinger');
  });
});

describe('GPIF beaming', () => {
  it.each([
    ['guitarpro6', 'beaming-mode.gpx'],
    ['guitarpro7', 'beaming-mode.gp'],
    ['guitarpro8', 'beaming-mode.gp'],
  ] as const)('%s/%s: forced beams join, broken beams break, a secondary break keeps the eighth beam', (folder, name) => {
    // Act
    const song = read(folder, name);

    // Assert
    expect(voices(song, 0).map((voice) => voice.beamToNext)).toEqual([undefined, undefined]);
    expect(voices(song, 1).map((voice) => voice.beamToNext)).toEqual(['join', 'join', 'join', undefined]);
    expect(voices(song, 2).map((voice) => voice.beamToNext)).toEqual(['break', 'break', 'break', undefined]);
    expect(voices(song, 3).map((voice) => voice.beamToNext)).toEqual(['breakSecondary', undefined, undefined]);
  });

  it('custom-beaming.gp: the master bars’ beam groups, none where they are the time signature’s', () => {
    // Act
    const song = read('guitarpro8', 'custom-beaming.gp');

    // Assert
    const groupings = song.measureHeaders.map((header) => header.beamGrouping?.groups);
    expect(groupings.slice(0, 5)).toEqual([undefined, undefined, undefined, undefined, undefined]);
    expect(groupings.slice(5, 10)).toEqual(new Array(5).fill([4, 4]));
    expect(groupings.slice(10, 15)).toEqual(new Array(5).fill([2, 4, 2]));
    expect(groupings.slice(15, 20)).toEqual(new Array(5).fill([8]));
    expect(groupings.slice(20, 25)).toEqual(new Array(5).fill([1, 1, 1, 1, 4]));
    expect(groupings.slice(25)).toEqual(new Array(5).fill([1, 1, 4]));
    expect(song.measureHeaders[5]?.beamGrouping?.unit).toBe(8);
  });

  it('reads no grouping without a unit or with an unknown one', () => {
    // Arrange
    const groups = xProperty(1124139264, 4) + xProperty(1124139265, 4);

    // Act
    const withoutUnit = toSong({ masterBars: masterBar('0', `<XProperties>${groups}</XProperties>`) });
    const badUnit = toSong({ masterBars: masterBar('0', `<XProperties>${xProperty(1124139010, 5)}${groups}</XProperties>`) });

    // Assert
    expect(withoutUnit.measureHeaders[0]).not.toHaveProperty('beamGrouping');
    expect(badUnit.measureHeaders[0]).not.toHaveProperty('beamGrouping');
  });
});

describe('GPIF slash notation', () => {
  it.each([
    ['guitarpro6', 'slash.gpx'],
    ['guitarpro7', 'slash.gp'],
    ['guitarpro8', 'slash.gp'],
  ] as const)('%s/%s: the first track shows slashes (its PartConfiguration flag), the second does not', (folder, name) => {
    // Act
    const song = read(folder, name);

    // Assert
    expect(song.tracks.map((track) => track.hasSlashNotation)).toEqual([true, undefined]);
  });

  it('reads a slashed beat', () => {
    // Act
    const song = toSong({ beats: '<Beat id="0"><Rhythm ref="0"/><Slashed/><Notes>0</Notes></Beat>' });

    // Assert
    expect(voices(song, 0)[0]?.isSlashed).toBe(true);
  });
});

describe('GPIF octave signs', () => {
  /** The octave sign of every beat of a bar of track 1. */
  const signs = (song: Song, measureIndex: number) => (song.tracks[0]?.measures[measureIndex]?.beats ?? []).map((beat) => beat.ottava);

  it('ottavia.gp: the beats’ <Ottavia>, and none from the bars’ clef octaves', () => {
    // Act
    const song = read('guitarpro7', 'ottavia.gp');

    // Assert
    expect([0, 1, 2, 3].map((index) => signs(song, index))).toEqual([0, 1, 2, 3].map(() => [undefined, undefined, undefined, undefined]));
    expect(signs(song, 4)).toEqual(['8va', '8vb', '15ma', '15mb']);
    expect(signs(song, 5)).toEqual(['8va', '8va', '8va', '8va']);
    expect(signs(song, 6)).toEqual([undefined, '8va', undefined, '8va']);
    expect(signs(song, 12)).toEqual([undefined, '15mb', undefined, '15mb']);
  });

  it('takes the octave sign of a beat from any of its voices and ignores one it does not know', () => {
    // Act
    const known = toSong({ beats: '<Beat id="0"><Rhythm ref="0"/><Ottavia>15mb</Ottavia><Notes>0</Notes></Beat>' });
    const unknown = toSong({ beats: '<Beat id="0"><Rhythm ref="0"/><Ottavia>Regular</Ottavia><Notes>0</Notes></Beat>' });

    // Assert
    expect(known.tracks[0]?.measures[0]?.beats[0]?.ottava).toBe('15mb');
    expect(unknown.tracks[0]?.measures[0]?.beats[0]).not.toHaveProperty('ottava');
  });
});

describe('readPartConfiguration', () => {
  it('reads the notation flags of the multi-track view, one per track', () => {
    // Arrange
    const bytes = Uint8Array.from([0, 0, 0, 2, 0, 0, 0, 0, 3, 0x07, 0x03, 0x05, 1, 0, 0, 0, 1, 0x03, 0, 0, 0, 0]);

    // Act
    const views = readPartConfiguration(bytes);

    // Assert
    expect(views).toEqual([
      { hasSlash: true },
      { hasSlash: false },
      { hasSlash: true },
    ]);
  });

  it('reads nothing from missing, short or impossible data', () => {
    // Act / Assert
    expect(readPartConfiguration(undefined)).toEqual([]);
    expect(readPartConfiguration(Uint8Array.from([0, 0, 0, 1, 0, 0, 0, 0, 9, 7]))).toEqual([]);
    expect(readPartConfiguration(Uint8Array.from([0, 0, 0, 1, 0, 0xff, 0xff, 0xff, 0xff]))).toEqual([]);
    expect(readPartConfiguration(Uint8Array.from([0, 0]))).toEqual([]);
  });
});

// ---------------------------------------------------------------- hand-written documents

interface Parts {
  readonly masterBars?: string;
  readonly beats?: string;
  readonly notes?: string;
}

const TRACK = '<Track id="0"><Name>Guitar</Name><GeneralMidi><Program>25</Program><PrimaryChannel>0</PrimaryChannel>'
  + '<SecondaryChannel>1</SecondaryChannel></GeneralMidi>'
  + '<Properties><Property name="Tuning"><Pitches>40 45 50 55 59 64</Pitches></Property></Properties></Track>';

function masterBar(bars: string, extra = ''): string {
  return `<MasterBar><Time>4/4</Time><Bars>${bars}</Bars>${extra}</MasterBar>`;
}

function xProperty(id: number, value: number): string {
  return `<XProperty id="${id}"><Int>${value}</Int></XProperty>`;
}

function note(id: number, string: number, fret: number, extra = ''): string {
  return `<Note id="${id}">${extra}<Properties><Property name="String"><String>${string}</String></Property>`
    + `<Property name="Fret"><Fret>${fret}</Fret></Property></Properties></Note>`;
}

function toSong(parts: Parts): Song {
  const xml = `<GPIF><Tracks>${TRACK}</Tracks><MasterBars>${parts.masterBars ?? masterBar('0')}</MasterBars>`
    + '<Bars><Bar id="0"><Voices>0 -1 -1 -1</Voices></Bar></Bars><Voices><Voice id="0"><Beats>0</Beats></Voice></Voices>'
    + `<Beats>${parts.beats ?? '<Beat id="0"><Rhythm ref="0"/><Notes>0</Notes></Beat>'}</Beats>`
    + `<Notes>${parts.notes ?? note(0, 0, 3)}</Notes><Rhythms><Rhythm id="0"><NoteValue>Quarter</NoteValue></Rhythm></Rhythms></GPIF>`;
  const song = gpifToSong(readGpifDocument(xml, 7), { format: 'gp7', version: 'test' });
  assertSongInvariants(song);
  return song;
}
