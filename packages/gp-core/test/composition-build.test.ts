import { describe, expect, it } from 'vitest';
import { buildComposedSong } from '../src/composition/build';
import type { SongPlan } from '../src/composition/types';
import type { TranscriptionPage } from '../src/transcription/types';
import { assertEditInvariants, deepFreeze } from './helpers/edit-songs';
import { BASS, GUITAR, bar, play, tab } from './helpers/transcription-pages';

const PLAN: SongPlan = {
  title: 'Paper Boats',
  tempo: 96,
  timeSignature: { numerator: 3, denominator: 4 },
  keySignature: -1,
  tracks: [GUITAR, BASS],
  lyricsTrack: 0,
  sections: [
    { name: 'Intro', bars: 1, chords: 'Dm', lyrics: '', idea: '' },
    { name: 'Verse', bars: 2, chords: 'Dm Bb', lyrics: 'Pa-per boats', idea: '' },
  ],
  warnings: [],
};

const threeQuarters = (fret: number) => [play('quarter', tab(1, fret)), play('quarter', tab(1, fret)), play('quarter', tab(1, fret))];

const SECTIONS: readonly TranscriptionPage[] = [
  { measures: [bar(threeQuarters(5))], warnings: ['kept it simple'] },
  { measures: [bar(threeQuarters(7), { lyrics: ['Pa-', 'per', 'boats'] }), bar(threeQuarters(8))] },
];

describe('buildComposedSong', () => {
  it('builds the planned song: its tracks, meter, key and tempo, and the sections one after another', () => {
    // Act
    const { song } = buildComposedSong(deepFreeze(PLAN), deepFreeze(SECTIONS), { genre: 'Indie folk', description: 'A quiet song' });

    // Assert
    assertEditInvariants(song);
    expect(song.tracks.map((track) => track.name)).toEqual(['Guitar', 'Bass']);
    expect(song.measureHeaders).toHaveLength(3);
    expect(song.measureHeaders[0]).toMatchObject({ tempo: 96, timeSignature: { numerator: 3, denominator: 4 } });
    expect(song.tracks[0]?.measures[0]?.keySignature).toBe(-1);
  });

  it('marks where each section starts, names the song and keeps the lyrics on the lyrics track', () => {
    // Act
    const { song } = buildComposedSong(PLAN, SECTIONS, { genre: 'Indie folk', description: 'A quiet song' });

    // Assert
    expect(song.measureHeaders.map((header) => header.marker?.title)).toEqual(['Intro', 'Verse', undefined]);
    expect(song.info).toMatchObject({ title: 'Paper Boats', subtitle: 'Indie folk', instructions: 'A quiet song' });
    expect(song.info.music).not.toBe('');
    expect(song.tracks[0]?.lyrics).toEqual({ from: 1, text: '   Pa- per boats' });
  });

  it('names a section’s warnings after the section', () => {
    const { warnings } = buildComposedSong(PLAN, SECTIONS, { genre: '', description: '' });
    expect(warnings).toContain('Intro: kept it simple');
  });
});
