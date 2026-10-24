import { unzipSync } from 'fflate';
import { describe, expect, it } from 'vitest';
import { readPartConfiguration } from '../src/formats/gpif/part-configuration';
import { type XmlElement, attribute, child, childList, childText, parseXml } from '../src/formats/gpif/xml';
import { decodeUtf8Lenient } from '../src/io/text';
import { plainDuration } from '../src/model/defaults';
import type { BeamLink, Finger, Song, Voice } from '../src/model/song';
import { readSong } from '../src/read-song';
import { partConfigurationOf } from '../src/write/gpif/gp7-container';
import { writeSong } from '../src/write/index';
import { assertSongInvariants } from './helpers/invariants';
import { songDifference } from './helpers/write-compare';
import { expectedAfterGp } from './helpers/write-expected-gpif';
import { buildNote, buildSong, buildVoice, restVoice } from './helpers/write-song-builder';

const EIGHTH = plainDuration(8);

function roundTrip(song: Song): Song {
  const again = readSong(writeSong(song, 'gp'));
  assertSongInvariants(again);
  return again;
}

function entries(song: Song): Readonly<Record<string, Uint8Array>> {
  return unzipSync(writeSong(song, 'gp'));
}

function scoreXml(song: Song): XmlElement {
  return parseXml(decodeUtf8Lenient(entries(song)['Content/score.gpif'] ?? new Uint8Array()));
}

function firstVoices(song: Song): readonly Voice[] {
  return song.tracks[0]?.measures[0]?.beats.map((beat) => beat.voices[0] ?? restVoice()) ?? [];
}

/** Four eighths with these beams to the next beat, then a half rest. */
function beamedSong(links: readonly (BeamLink | undefined)[]): Song {
  const beats = links.map((link) => ({ voice: { ...buildVoice([buildNote(1, 3)], EIGHTH), ...(link === undefined ? {} : { beamToNext: link }) } }));
  return buildSong({ tracks: [{ measures: [[...beats, { voice: restVoice(plainDuration(2)) }]] }] });
}

describe('writeSong gp: fingering', () => {
  it.each<[Finger | undefined, Finger | undefined]>([
    ['thumb', undefined],
    ['little', 'annular'],
    [undefined, 'index'],
  ])('keeps left hand %s and right hand %s', (leftFinger, rightFinger) => {
    // Arrange
    const fingers = { ...(leftFinger === undefined ? {} : { leftFinger }), ...(rightFinger === undefined ? {} : { rightFinger }) };
    const song = buildSong({ tracks: [{ measures: [[{ voice: buildVoice([buildNote(2, 5, fingers)]) }]] }] });

    // Act
    const again = roundTrip(song);

    // Assert
    expect(firstVoices(again)[0]?.notes[0]).toMatchObject(fingers);
    expect(songDifference(expectedAfterGp(song), again)).toBeUndefined();
  });

  it('writes Guitar Pro’s letters before the instrument articulation, as Guitar Pro 7 does', () => {
    // Arrange
    const song = buildSong({ tracks: [{ measures: [[{ voice: buildVoice([buildNote(2, 5, { leftFinger: 'middle', rightFinger: 'little' })]) }]] }] });

    // Act
    const note = childList(scoreXml(song), 'Notes', 'Note')[0];

    // Assert
    const names = note?.children.map((element) => element.name) ?? [];
    expect(names.slice(0, 3)).toEqual(['LeftFingering', 'RightFingering', 'InstrumentArticulation']);
    expect([childText(note, 'LeftFingering'), childText(note, 'RightFingering')]).toEqual(['M', 'C']);
  });
});

describe('writeSong gp: slashes and beams', () => {
  it('keeps a slashed beat as <Slashed/>', () => {
    // Arrange
    const song = buildSong({ tracks: [{ measures: [[{ voice: { ...buildVoice([buildNote(3, 2)]), isSlashed: true } }, { voice: buildVoice([buildNote(3, 2)]) }]] }] });

    // Act
    const again = roundTrip(song);

    // Assert
    expect(firstVoices(again).map((voice) => voice.isSlashed)).toEqual([true, undefined]);
    expect(child(childList(scoreXml(song), 'Beats', 'Beat')[0], 'Slashed')).toBeDefined();
    expect(songDifference(expectedAfterGp(song), again)).toBeUndefined();
  });

  it('keeps every beam to the next beat', () => {
    // Arrange
    const song = beamedSong(['join', 'break', 'breakSecondary', undefined]);

    // Act
    const again = roundTrip(song);

    // Assert
    expect(firstVoices(again).map((voice) => voice.beamToNext)).toEqual(['join', 'break', 'breakSecondary', undefined, undefined]);
    expect(songDifference(expectedAfterGp(song), again)).toBeUndefined();
  });

  it('writes the beam modes as Guitar Pro’s beat XProperties', () => {
    // Arrange
    const song = beamedSong(['join', 'break', 'breakSecondary']);

    // Act
    const beats = childList(scoreXml(song), 'Beats', 'Beat');

    // Assert
    const xProperties = beats.slice(0, 3).map((beat) =>
      childList(beat, 'XProperties', 'XProperty').map((property) => [attribute(property, 'id'), childText(property, 'Int')]),
    );
    expect(xProperties).toEqual([[['1124204546', '1']], [['1124204546', '2']], [['1124204552', '1']]]);
  });

  it('keeps a bar’s beam groups as master bar XProperties, and writes none for the time signature’s own', () => {
    // Arrange
    const song = buildSong({
      headers: [{ beamGrouping: { unit: 8, groups: [3, 3, 2] } }, {}],
      tracks: [{ measures: [[{ voice: buildVoice([buildNote(1, 0)]) }], [{ voice: buildVoice([buildNote(1, 0)]) }]] }],
    });

    // Act
    const again = roundTrip(song);
    const masterBars = childList(scoreXml(song), 'MasterBars', 'MasterBar');

    // Assert
    expect(again.measureHeaders.map((header) => header.beamGrouping)).toEqual([{ unit: 8, groups: [3, 3, 2] }, undefined]);
    const properties = childList(masterBars[0], 'XProperties', 'XProperty').map((property) => [attribute(property, 'id'), childText(property, 'Int')]);
    expect(properties).toEqual([['1124139010', '8'], ['1124139264', '3'], ['1124139265', '3'], ['1124139266', '2']]);
    expect(child(masterBars[1], 'XProperties')).toBeUndefined();
    expect(songDifference(expectedAfterGp(song), again)).toBeUndefined();
  });
});

describe('writeSong gp: slash notation of a track', () => {
  it('sets the slash flag of the track in the PartConfiguration and reads it back', () => {
    // Arrange
    const song = buildSong({ tracks: [{ measures: [[{ voice: buildVoice([buildNote(1, 0)]) }]], hasSlashNotation: true }, { measures: [] }] });

    // Act
    const again = roundTrip(song);

    // Assert
    expect(again.tracks.map((track) => track.hasSlashNotation)).toEqual([true, undefined]);
    expect(readPartConfiguration(entries(song)['Content/PartConfiguration'])).toEqual([{ hasSlash: true }, { hasSlash: false }]);
  });

  it('adds slash (4) to the notation and tablature flags of the track’s views', () => {
    // Act
    const bytes = partConfigurationOf([false, true], [true, true]);

    // Assert: 3 views — both tracks, track 1, track 2 — the drum track without tablature
    expect([...bytes]).toEqual([0, 0, 0, 3, 0, 0, 0, 0, 2, 7, 5, 0, 0, 0, 0, 1, 7, 0, 0, 0, 0, 1, 5, 0, 0, 0, 0]);
  });
});

describe('writeSong gp: what GPIF cannot hold', () => {
  it('drops a cautionary or forced accidental (no Guitar Pro file holds one)', () => {
    // Arrange
    const song = buildSong({ tracks: [{ measures: [[{ voice: buildVoice([buildNote(2, 1, { accidentalDisplay: 'cautionary' })]) }]] }] });

    // Act
    const again = roundTrip(song);

    // Assert
    expect(firstVoices(again)[0]?.notes[0]).not.toHaveProperty('accidentalDisplay');
    expect(songDifference(expectedAfterGp(song), again)).toBeUndefined();
  });
});
