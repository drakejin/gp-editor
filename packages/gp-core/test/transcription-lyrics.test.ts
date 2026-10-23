import { describe, expect, it } from 'vitest';
import { TranscriptionError } from '../src/errors';
import { buildSongFromTranscription } from '../src/transcription/build-song';
import { parseTranscriptionPage } from '../src/transcription/parse-page';
import { TRANSCRIPTION_TOOL } from '../src/transcription/tool';
import { MAX_TRANSCRIBED_BEATS, MAX_TRANSCRIBED_SYLLABLE_LENGTH, type TranscriptionPage } from '../src/transcription/types';
import { assertEditInvariants, deepFreeze } from './helpers/edit-songs';
import { BASS, GUITAR, bar, page, play, rest, tab } from './helpers/transcription-pages';

function build(...pages: TranscriptionPage[]) {
  const result = buildSongFromTranscription(deepFreeze(pages));
  assertEditInvariants(result.song);
  return result;
}

describe('parseTranscriptionPage: lyrics', () => {
  it('reads a measure’s syllables and the song’s lyrics track', () => {
    // Act
    const parsed = parseTranscriptionPage({
      song: { lyricsTrack: 1 },
      measures: [{ parts: [], lyrics: [' Hel- ', 'lo', '', 'my love', 7, 'x'.repeat(MAX_TRANSCRIBED_SYLLABLE_LENGTH + 5)] }],
    });

    // Assert
    expect(parsed.song?.lyricsTrack).toBe(1);
    expect(parsed.measures[0]?.lyrics).toEqual(['Hel-', 'lo', '', 'my love', '', 'x'.repeat(MAX_TRANSCRIBED_SYLLABLE_LENGTH)]);
  });

  it('leaves out an empty syllable list and refuses an endless one', () => {
    expect(parseTranscriptionPage({ measures: [{ parts: [], lyrics: [] }] }).measures[0]?.lyrics).toBeUndefined();
    expect(() => parseTranscriptionPage({ measures: [{ parts: [], lyrics: Array.from({ length: MAX_TRANSCRIBED_BEATS + 1 }, () => 'la') }] })).toThrow(TranscriptionError);
  });

  it('offers lyrics and the lyrics track in the tool’s schema', () => {
    const schema = JSON.stringify(TRANSCRIPTION_TOOL.input_schema);
    expect(schema).toContain('"lyrics"');
    expect(schema).toContain('"lyricsTrack"');
  });
});

describe('buildSongFromTranscription: lyrics', () => {
  it('gives the lyrics track one syllable per beat that has notes, rests taking none', () => {
    // Act
    const { song, warnings } = build(
      page(
        [
          bar([play('quarter', tab(1, 0)), rest('quarter'), play('quarter', tab(1, 2)), play('quarter', tab(1, 3))], { lyrics: ['Hel-', 'lo', 'world'] }),
          bar([play('whole', tab(1, 5))]),
          bar([play('half', tab(1, 7)), play('half', tab(1, 5))], { lyrics: ['', 'yeah'] }),
        ],
        { tracks: [GUITAR] },
      ),
    );

    // Assert
    expect(song.tracks[0]?.lyrics).toEqual({ from: 1, text: 'Hel- lo world   yeah' });
    expect(warnings).toEqual([]);
  });

  it('puts the lyrics on the track the song names, and warns about syllables with no note to sing them on', () => {
    // Act
    const { song, warnings } = build(
      page(
        [
          {
            parts: [
              { track: 0, beats: [play('whole', tab(1, 0))] },
              { track: 1, beats: [play('half', tab(1, 0)), play('half', tab(1, 2))] },
            ],
            lyrics: ['one', 'two', 'three'],
          },
        ],
        { song: { lyricsTrack: 1 }, tracks: [GUITAR, BASS] },
      ),
    );

    // Assert
    expect(song.tracks[0]?.lyrics).toBeUndefined();
    expect(song.tracks[1]?.lyrics).toEqual({ from: 1, text: 'one two' });
    expect(warnings).toEqual(['Bar 1: 3 syllables for 2 notes; the last 1 was left out']);
  });

  it('leaves the tracks without lyrics when no measure has any', () => {
    const { song } = build(page([bar([play('whole', tab(1, 0))])]));
    expect(song.tracks[0]?.lyrics).toBeUndefined();
  });
});
