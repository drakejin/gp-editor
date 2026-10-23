import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { songChords } from '../src/chords/song-chords';
import { setBeatChord } from '../src/edit/beat-chord';
import { readSong } from '../src/read-song';
import { buildSong, n, play } from './helpers/edit-songs';

const fixture = (path: string) => readSong(new Uint8Array(readFileSync(new URL(`fixtures/${path}`, import.meta.url))));

describe('songChords', () => {
  it('lists the chords of a track once each, in the order they first appear', () => {
    // Act
    const chords = songChords(fixture('guitarpro7/chords.gp'), 0);

    // Assert
    expect(chords.map((chord) => `${chord.name} ${chord.firstFret}`)).toEqual(['C 1', 'Cm 1', 'C 1', 'Cm 1', 'D 1', 'Dm 1', 'D 5', 'Dm 5']);
  });

  it('keeps one copy of a chord used twice', () => {
    // Arrange
    const chord = { name: 'Am', firstFret: 1, frets: [0, 1, 2, 2, 0, -1] };
    const song = buildSong({ tracks: [[[[play(4, n(1, 0)), play(4, n(1, 0))]]]] });
    const first = setBeatChord(song, { trackIndex: 0, measureIndex: 0, beatIndex: 0, voiceIndex: 0 }, chord);

    // Act
    const twice = setBeatChord(first, { trackIndex: 0, measureIndex: 0, beatIndex: 1, voiceIndex: 0 }, { ...chord, frets: [...chord.frets] });

    // Assert
    expect(songChords(twice, 0)).toEqual([chord]);
  });

  it('is empty for a track without chords or a missing track', () => {
    expect(songChords(fixture('guitarpro5/chords.gp5'), 5)).toEqual([]);
    expect(songChords(buildSong({ tracks: [[[[play(4, n(1, 0))]]]] }), 0)).toEqual([]);
  });
});
