import { MAX_COMPOSED_BARS, type Song, type TranscribedTrack, buildSongFromTranscription, readSong } from '@gp-editor/core';
import { aiEditRangeOf, fingeringTracks } from '../src/ai-edit/ai-edit-scope';
import { CHUNK_TEXT_BUDGET, planChunks } from '../src/ai-edit/chunks';
import { trackBarText, trackNotationOf } from '../src/compose/score-notation';
import { readFixture } from '../test-support/fixtures';

const GUITAR: TranscribedTrack = { name: 'Lead', instrument: 'guitar', tuning: [], capo: 0 };
const DRUMS: TranscribedTrack = { name: 'Drums', instrument: 'drums', tuning: [], capo: 0 };
const KEYS: TranscribedTrack = { name: 'Piano', instrument: 'keys', tuning: [], capo: 0, program: 0 };

/** `bars` bars of a guitar, drums and keys, a whole note each. */
function band(bars: number): Song {
  const bar = {
    parts: [
      { track: 0, beats: [{ duration: 'whole' as const, notes: [{ string: 2, fret: 5 }] }] },
      { track: 1, beats: [{ duration: 'whole' as const, notes: [{ drum: 'Bass Drum 1' }] }] },
      { track: 2, beats: [{ duration: 'whole' as const, notes: [{ pitch: 'C4' }] }] },
    ],
  };
  return buildSongFromTranscription([{ tracks: [GUITAR, DRUMS, KEYS], measures: Array.from({ length: bars }, () => bar) }]).song;
}

const at = (trackIndex: number, measureIndex: number) => ({ trackIndex, measureIndex, beatIndex: 0, voiceIndex: 0, string: 1 });

describe('aiEditRangeOf', () => {
  it('takes the selected beats, their bars and their track', () => {
    // Arrange
    const state = { cursor: at(0, 4), selectionAnchor: at(0, 2), trackIndex: 0 };

    // Act
    const range = aiEditRangeOf(state, band(8), 'selection');

    // Assert
    expect(range).toEqual({
      scope: { kind: 'beats', from: { trackIndex: 0, measureIndex: 2, beatIndex: 0, voiceIndex: 0 }, to: { trackIndex: 0, measureIndex: 4, beatIndex: 0, voiceIndex: 0 } },
      firstBar: 2,
      lastBar: 4,
      trackIndexes: [0],
    });
  });

  it('has no selection to take when nothing is selected', () => {
    expect(aiEditRangeOf({ cursor: at(0, 4), trackIndex: 0 }, band(8), 'selection')).toBeUndefined();
  });

  it('takes the cursor’s whole track, or every track over every bar', () => {
    // Arrange
    const song = band(8);
    const state = { cursor: at(2, 1), trackIndex: 0 };

    // Act + Assert
    expect(aiEditRangeOf(state, song, 'track')).toEqual({ scope: { kind: 'track', trackIndex: 2 }, firstBar: 0, lastBar: 7, trackIndexes: [2] });
    expect(aiEditRangeOf(state, song, 'song')).toEqual({ scope: { kind: 'song' }, firstBar: 0, lastBar: 7, trackIndexes: [0, 1, 2] });
  });

  it('gives Claude only the fretted tracks to re-finger', () => {
    // Arrange
    const song = band(2);
    const range = aiEditRangeOf({ trackIndex: 0 }, song, 'song');

    // Act + Assert
    expect(range === undefined ? [] : fingeringTracks(song, range)).toEqual([0]);
  });
});

describe('planChunks', () => {
  it('asks for a short range in one part', () => {
    expect(planChunks(band(8), 2, 6, [0])).toEqual([{ first: 2, last: 6 }]);
  });

  it('splits a long range into parts in order, each within the text budget and the tool’s bar limit', () => {
    // Arrange: 224 bars of 9 tracks.
    const canon = readSong(readFixture('guitarpro8', 'canon-audio-track.gp'));
    const tracks = canon.tracks.map((_, trackIndex) => trackIndex);
    const notations = tracks.map((trackIndex) => trackNotationOf(canon, trackIndex));

    // Act
    const chunks = planChunks(canon, 0, 223, tracks);

    // Assert
    expect(chunks.length).toBeGreaterThan(1);
    expect(chunks[0]?.first).toBe(0);
    expect(chunks[chunks.length - 1]?.last).toBe(223);
    chunks.forEach((chunk, index) => {
      expect(chunk.first).toBe(index === 0 ? 0 : (chunks[index - 1]?.last ?? 0) + 1);
      expect(chunk.last - chunk.first + 1).toBeLessThanOrEqual(MAX_COMPOSED_BARS);
      const text = Array.from({ length: chunk.last - chunk.first + 1 }, (_, offset) => notations.map((notation) => trackBarText(canon, notation, chunk.first + offset) ?? '').join('')).join('');
      expect(chunk.last === chunk.first || text.length <= CHUNK_TEXT_BUDGET).toBe(true);
    });
  });

  it('keeps one bar per part when a single bar is over the budget', () => {
    expect(planChunks(band(3), 0, 2, [0, 1, 2], 1)).toEqual([
      { first: 0, last: 0 },
      { first: 1, last: 1 },
      { first: 2, last: 2 },
    ]);
  });
});
