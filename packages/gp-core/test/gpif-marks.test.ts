/**
 * GPIF notation marks: directions (Target / Jump), hairpins, fades, rasgueado and the sustain pedal automations, from
 * real files and small hand-written documents.
 */
import { describe, expect, it } from 'vitest';
import { readGpifDocument } from '../src/formats/gpif/gpif-reader';
import { gpifToSong } from '../src/formats/gpif/gpif-to-song';
import { measureTicks } from '../src/model/defaults';
import type { Beat, Song } from '../src/model/song';
import { readSong } from '../src/read-song';
import { loadFixture } from './helpers/fixtures';
import { assertSongInvariants } from './helpers/invariants';

const QUARTER = '<Rhythm id="0"><NoteValue>Quarter</NoteValue></Rhythm>';
const NOTE = '<Note id="0"><Properties><Property name="String"><String>0</String></Property><Property name="Fret"><Fret>3</Fret></Property></Properties></Note>';
const BAR_TICKS = measureTicks(4, 4);

interface Parts {
  readonly trackExtra?: string;
  readonly masterBars?: string;
  readonly beats?: string;
  readonly voices?: string;
}

function track(extra: string): string {
  return '<Track id="0"><Name>Piano</Name><GeneralMidi><Program>0</Program><PrimaryChannel>0</PrimaryChannel><SecondaryChannel>1</SecondaryChannel></GeneralMidi>'
    + `<Properties><Property name="Tuning"><Pitches>40 45 50 55 59 64</Pitches></Property></Properties>${extra}</Track>`;
}

function masterBar(extra = ''): string {
  return `<MasterBar><Time>4/4</Time><Bars>0</Bars>${extra}</MasterBar>`;
}

function toSong(parts: Parts): Song {
  const xml = `<GPIF><Tracks>${track(parts.trackExtra ?? '')}</Tracks>`
    + `<MasterBars>${parts.masterBars ?? masterBar()}</MasterBars>`
    + '<Bars><Bar id="0"><Voices>0 -1 -1 -1</Voices></Bar></Bars>'
    + `<Voices>${parts.voices ?? '<Voice id="0"><Beats>0</Beats></Voice>'}</Voices>`
    + `<Beats>${parts.beats ?? '<Beat id="0"><Rhythm ref="0"/><Notes>0</Notes></Beat>'}</Beats>`
    + `<Notes>${NOTE}</Notes><Rhythms>${QUARTER}</Rhythms></GPIF>`;
  const song = gpifToSong(readGpifDocument(xml, 7), { format: 'gp7', version: 'test' });
  assertSongInvariants(song);
  return song;
}

function beatsOf(song: Song, measureIndex = 0): readonly Beat[] {
  return song.tracks[0]?.measures[measureIndex]?.beats ?? [];
}

function pedalAutomation(bar: number, position: number, value: string): string {
  return `<Automation><Type>SustainPedal</Type><Linear>false</Linear><Bar>${bar}</Bar><Position>${position}</Position><Visible>true</Visible><Value>${value}</Value></Automation>`;
}

describe('GPIF directions', () => {
  it('reads every target and jump of directions.gp, each bar in Guitar Pro 5 order', () => {
    // Act
    const song = readSong(loadFixture('guitarpro8', 'directions.gp'));

    // Assert
    expect(song.measureHeaders.map((header) => header.directions)).toEqual([
      ['coda', 'doubleCoda', 'segno', 'segnoSegno', 'fine'],
      ['daCapo', 'daSegno', 'daSegnoSegno', 'daCoda', 'daDoubleCoda'],
      ['daCapoAlCoda', 'daSegnoAlCoda', 'daSegnoSegnoAlCoda'],
      ['daCapoAlDoubleCoda', 'daSegnoAlDoubleCoda', 'daSegnoSegnoAlDoubleCoda'],
      ['daCapoAlFine', 'daSegnoAlFine', 'daSegnoSegnoAlFine'],
      undefined,
    ]);
  });

  it('reads a fine and a D.C. al Fine in timer.gp', () => {
    // Act
    const directions = readSong(loadFixture('guitarpro8', 'timer.gp')).measureHeaders.flatMap((header) => header.directions ?? []);

    // Assert
    expect(directions).toEqual(['fine', 'daCapoAlFine']);
  });

  it('keeps each direction once, and leaves out unknown names and jumps written as targets', () => {
    // Arrange
    const directions = '<Directions><Target>Segno</Target><Target> Segno </Target><Target>DaCapo</Target><Jump>Coda</Jump>'
      + '<Jump>DalSegnoAlCodaX</Jump><Jump>DaSegno</Jump><Target>constructor</Target></Directions>';

    // Act
    const song = toSong({ masterBars: masterBar(directions) + masterBar('<Directions></Directions>') });

    // Assert
    expect(song.measureHeaders.map((header) => header.directions)).toEqual([['segno', 'daSegno'], undefined]);
  });
});

describe('GPIF beat marks', () => {
  it('reads crescendo and decrescendo hairpins and ignores other values', () => {
    // Arrange
    const beat = (id: number, hairpin: string) => `<Beat id="${id}"><Hairpin>${hairpin}</Hairpin><Rhythm ref="0"/><Notes>0</Notes></Beat>`;
    const beats = beat(0, 'Crescendo') + beat(1, 'Decrescendo') + beat(2, 'Swell') + '<Beat id="3"><Rhythm ref="0"/></Beat>';

    // Act
    const song = toSong({ beats, voices: '<Voice id="0"><Beats>0 1 2 3</Beats></Voice>' });

    // Assert
    expect(beatsOf(song).map((b) => b.hairpin)).toEqual(['crescendo', 'decrescendo', undefined, undefined]);
  });

  it('reads fade out and volume swell onto the beat’s notes, never with fade in', () => {
    // Arrange
    const beat = (id: number, fadding: string) => `<Beat id="${id}"><Fadding>${fadding}</Fadding><Rhythm ref="0"/><Notes>0</Notes></Beat>`;
    const beats = beat(0, 'FadeOut') + beat(1, 'VolumeSwell') + beat(2, 'FadeIn') + beat(3, 'Other');

    // Act
    const song = toSong({ beats, voices: '<Voice id="0"><Beats>0 1 2 3</Beats></Voice>' });

    // Assert
    const fades = beatsOf(song).map((b) => {
      const effect = b.voices[0]?.notes[0]?.effect;
      return [effect?.fadeIn, effect?.fadeOut, effect?.volumeSwell];
    });
    expect(fades).toEqual([
      [false, true, undefined],
      [false, undefined, true],
      [true, undefined, undefined],
      [false, undefined, undefined],
    ]);
  });

  it('reads the rasgueado pattern of a beat property, and none for an unknown pattern', () => {
    // Arrange
    const beat = (id: number, pattern: string) =>
      `<Beat id="${id}"><Rhythm ref="0"/><Notes>0</Notes><Properties><Property name="Rasgueado"><Rasgueado>${pattern}</Rasgueado></Property></Properties></Beat>`;
    const beats = beat(0, 'mii_2') + beat(1, 'peami_1') + beat(2, 'ii_1') + beat(3, 'xyz_9');

    // Act
    const song = toSong({ beats, voices: '<Voice id="0"><Beats>0 1 2 3</Beats></Voice>' });

    // Assert
    expect(beatsOf(song).map((b) => b.rasgueado)).toEqual(['miiAnapaest', 'peami', 'ii', undefined]);
  });
});

describe('GPIF sustain pedal', () => {
  it('reads the track’s SustainPedal automations as pedal marks at their place in the bar', () => {
    // Arrange
    const automations = `<Automations>${pedalAutomation(0, 0.5, '0 1')}${pedalAutomation(0, 0.25, '0 1')}${pedalAutomation(0, 0.5, '0 3')}`
      + `${pedalAutomation(1, 1, '0 3')}${pedalAutomation(1, 0, '0 2')}${pedalAutomation(5, 0, '0 1')}</Automations>`;

    // Act
    const song = toSong({ trackExtra: automations, masterBars: masterBar() + masterBar() });

    // Assert
    const measures = song.tracks[0]?.measures ?? [];
    expect(measures[0]?.pedals).toEqual([
      { offset: BAR_TICKS / 4, action: 'down' },
      { offset: BAR_TICKS / 2, action: 'up' },
      { offset: BAR_TICKS / 2, action: 'down' },
    ]);
    expect(measures[1]?.pedals).toEqual([{ offset: BAR_TICKS, action: 'up' }]);
  });

  it('leaves the pedals out of measures without automations, and ignores other automation types', () => {
    // Arrange
    const automations = '<Automations><Automation><Type>Sound</Type><Bar>0</Bar><Position>0</Position><Value>Midi/0;Piano;Factory</Value></Automation></Automations>';

    // Act
    const song = toSong({ trackExtra: automations });

    // Assert
    expect(song.tracks[0]?.measures[0]?.pedals).toBeUndefined();
  });

  it('keeps a pedal position inside its bar', () => {
    // Arrange
    const automations = `<Automations>${pedalAutomation(0, 1.7, '0 3')}${pedalAutomation(0, -2, '0 1')}</Automations>`;

    // Act
    const song = toSong({ trackExtra: automations });

    // Assert
    expect(song.tracks[0]?.measures[0]?.pedals).toEqual([
      { offset: 0, action: 'down' },
      { offset: BAR_TICKS, action: 'up' },
    ]);
  });
});
