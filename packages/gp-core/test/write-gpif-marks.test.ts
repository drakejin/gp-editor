/**
 * The GPIF writer's notation marks: directions, hairpins, fades, rasgueado and the sustain pedal, written as the
 * elements the reader reads (and Guitar Pro writes), and read back unchanged.
 */
import { describe, expect, it } from 'vitest';
import { measureTicks } from '../src/model/defaults';
import type { Song } from '../src/model/song';
import { readSong } from '../src/read-song';
import { buildGpifXml } from '../src/write/gpif/gpif-writer';
import { writeSong } from '../src/write/index';
import { songDifference } from './helpers/write-compare';
import { expectedAfterGp } from './helpers/write-expected-gpif';
import { buildNote, buildSong, buildVoice, restVoice } from './helpers/write-song-builder';

const BAR = measureTicks(4, 4);

/** Two bars: directions on both, a crescendo over two beats, a rasgueado, the three fades and pedals. */
function markedSong(): Song {
  return buildSong({
    headers: [{ directions: ['segno', 'coda', 'fine'] }, { directions: ['daSegnoAlCoda', 'daCoda'] }],
    tracks: [
      {
        measures: [
          [
            { voice: buildVoice([buildNote(1, 0, { effect: { fadeIn: true } })]), hairpin: 'crescendo' },
            { voice: buildVoice([buildNote(2, 1, { effect: { fadeOut: true } })]), hairpin: 'crescendo', rasgueado: 'peiAnapaest' },
            { voice: buildVoice([buildNote(3, 2, { effect: { volumeSwell: true } })]), hairpin: 'decrescendo' },
            { voice: restVoice() },
          ],
          [{ voice: buildVoice([buildNote(1, 3)]), rasgueado: 'eamii' }],
        ],
      },
    ],
  });
}

function withPedals(song: Song): Song {
  return {
    ...song,
    tracks: song.tracks.map((track) => ({
      ...track,
      measures: track.measures.map((measure, index) =>
        index === 0
          ? { ...measure, pedals: [{ offset: 0, action: 'down' as const }, { offset: BAR / 3, action: 'up' as const }, { offset: BAR / 3, action: 'down' as const }] }
          : { ...measure, pedals: [{ offset: BAR, action: 'up' as const }] },
      ),
    })),
  };
}

describe('GPIF writer: notation marks', () => {
  it('writes directions, hairpins, fades, rasgueado and pedals that read back unchanged', () => {
    // Arrange
    const song = withPedals(markedSong());

    // Act
    const again = readSong(writeSong(song, 'gp'));

    // Assert
    expect(songDifference(expectedAfterGp(song), again)).toBeUndefined();
    expect(again.measureHeaders.map((header) => header.directions)).toEqual([['coda', 'segno', 'fine'], ['daSegnoAlCoda', 'daCoda']]);
    expect(again.tracks[0]?.measures[0]?.beats.map((beat) => [beat.hairpin, beat.rasgueado])).toEqual([
      ['crescendo', undefined],
      ['crescendo', 'peiAnapaest'],
      ['decrescendo', undefined],
      [undefined, undefined],
    ]);
  });

  it('writes the elements Guitar Pro writes', () => {
    // Act
    const xml = buildGpifXml(withPedals(markedSong())).replace(/>\s+</g, '><');

    // Assert
    expect(xml).toContain('<Directions><Target>Coda</Target><Target>Segno</Target><Target>Fine</Target></Directions>');
    expect(xml).toContain('<Directions><Jump>DaSegnoAlCoda</Jump><Jump>DaCoda</Jump></Directions>');
    expect(xml).toContain('<Hairpin>Crescendo</Hairpin>');
    expect(xml).toContain('<Hairpin>Decrescendo</Hairpin>');
    expect(xml).toContain('<Fadding>FadeOut</Fadding>');
    expect(xml).toContain('<Fadding>VolumeSwell</Fadding>');
    expect(xml).toContain('<Property name="Rasgueado"><Rasgueado>pei_2</Rasgueado></Property>');
    expect(xml).toContain('<Type>SustainPedal</Type><Linear>false</Linear><Bar>1</Bar><Position>1</Position><Visible>true</Visible><Value>0 3</Value>');
  });

  it('keeps one fade per voice, as GPIF has one per beat: fade in before fade out before volume swell', () => {
    // Arrange
    const song = buildSong({
      tracks: [{ measures: [[{ voice: buildVoice([buildNote(1, 0, { effect: { volumeSwell: true } }), buildNote(2, 0, { effect: { fadeOut: true } })]) }]] }],
    });

    // Act
    const notes = readSong(writeSong(song, 'gp')).tracks[0]?.measures[0]?.beats[0]?.voices[0]?.notes ?? [];

    // Assert
    expect(notes.map((note) => [note.effect.fadeOut, note.effect.volumeSwell])).toEqual([
      [true, undefined],
      [true, undefined],
    ]);
    expect(songDifference(expectedAfterGp(song), readSong(writeSong(song, 'gp')))).toBeUndefined();
  });
});
