import { type Song, type TranscribedTrack, adoptFingering, buildSongFromTranscription, fingeringCost, readSong } from '@gp-editor/core';
import type { AiEditRange } from '../src/ai-edit/ai-edit-scope';
import { lowerKey, polishFingering } from '../src/ai-edit/preset';
import { presetSummary, rewriteSummary } from '../src/ai-edit/summary';
import type { ClaudeDeps } from '../src/lib/ask-tool';
import type { ApiResponse } from '../src/native/anthropic';
import { readFixture } from '../test-support/fixtures';
import { cutStream, streamedMessage, toolMessage } from '../test-support/message-stream';

const GUITAR: TranscribedTrack = { name: 'Lead', instrument: 'guitar', tuning: [], capo: 0 };

/** One bar of a guitar: four quarter notes, each E4 on the open high E string. */
function openEs(): Song {
  const quarter = { duration: 'quarter' as const, notes: [{ string: 1, fret: 0 }] };
  return buildSongFromTranscription([{ tracks: [GUITAR], measures: [{ parts: [{ track: 0, beats: [quarter, quarter, quarter, quarter] }] }] }]).song;
}

const WHOLE_TRACK: AiEditRange = { scope: { kind: 'track', trackIndex: 0 }, firstBar: 0, lastBar: 0, trackIndexes: [0] };

function claude(answers: readonly ApiResponse[]): ClaudeDeps {
  let next = 0;
  return {
    send: () => {
      const answer = answers[Math.min(next, answers.length - 1)] as ApiResponse;
      next += 1;
      return Promise.resolve(answer);
    },
    wait: () => Promise.resolve(),
    isCancelled: () => false,
  };
}

const at = (string: number, fret: number) => ({ duration: 'quarter', notes: [{ string, fret }] });

/** Each beat's string/fret in bar 1 of track 0. */
function places(song: Song): readonly string[] {
  return song.tracks[0]?.measures[0]?.beats.map((beat) => beat.voices[0]?.notes.map((note) => `${note.string}/${note.fret}`).join(',') ?? '') ?? [];
}

describe('lowerKey + presetSummary', () => {
  it('transposes and re-fingers the scope, and says what moved and how much easier it is', () => {
    // Arrange
    const song = readSong(readFixture('guitarpro5', 'canon.gp5'));
    const range: AiEditRange = { scope: { kind: 'song' }, firstBar: 0, lastBar: song.measureHeaders.length - 1, trackIndexes: [] };

    // Act
    const easy = lowerKey(song, range, -2);
    const summary = presetSummary(easy, -2, { song: easy.song, cost: easy.refingering.after });

    // Assert
    expect(easy.song).not.toBe(song);
    expect(summary).toMatch(/^Transposed \d+ notes down 2 semitones\./);
    expect(summary).toMatch(/Fingering: \d+ notes on other strings, the hand travelling \d+ → \d+ frets \(cost [\d.]+ → [\d.]+\)/);
  });

  it('says when the fingering is already the easiest', () => {
    const easy = lowerKey(openEs(), WHOLE_TRACK, 0);
    expect(presetSummary(easy, 0, { song: easy.song, cost: easy.refingering.after })).toBe('Fingering: already the easiest');
  });

  it('counts the notes on other strings from the song written, Claude’s too, and says why suggestions were not taken', () => {
    // Arrange: the optimizer moved nothing; Claude's E4 at the 5th fret of string 2 was taken, two others were not.
    const easy = lowerKey(openEs(), WHOLE_TRACK, 0);
    const proposal = buildSongFromTranscription([{ tracks: [GUITAR], measures: [{ parts: [{ track: 0, beats: [at(2, 5), at(1, 0), at(1, 0), at(1, 0)] as never }] }] }]).song;
    const adoption = adoptFingering(easy.song, proposal, WHOLE_TRACK.scope);
    const notTaken = { ...adoption, suggested: adoption.suggested + 2, notTaken: { ...adoption.notTaken, occupied: 1, harder: 1 } };

    // Act
    const summary = presetSummary(easy, 0, { song: adoption.song, cost: fingeringCost(adoption.song, WHOLE_TRACK.scope) }, notTaken);

    // Assert
    expect(summary).not.toContain('already the easiest');
    expect(summary).toMatch(/^Fingering: 1 note on another string/);
    expect(summary).toContain('Claude: 1 of 3 suggested positions taken (not taken: 1 on a string another note holds, 1 harder to play than the optimizer’s)');
  });
});

describe('polishFingering', () => {
  it('checks Claude’s positions note by note: rejects a changed pitch, and keeps the optimizer’s where Claude’s are harder', async () => {
    // Arrange: E4 on strings 2 and 3 (same pitch, harder than the open string), then F4 (rejected), then E4 as it was.
    const answer = { bars: [{ parts: [{ track: 0, beats: [at(2, 5), at(3, 9), at(2, 6), at(1, 0)] }] }] };
    const easy = lowerKey(openEs(), WHOLE_TRACK, 0);

    // Act
    const polished = await polishFingering(easy, WHOLE_TRACK, 'claude-opus-5-5', claude([streamedMessage(toolMessage('write_bars', answer))]), () => undefined);

    // Assert
    expect(polished.song).toBe(easy.song);
    expect(places(polished.song)).toEqual(['1/0', '1/0', '1/0', '1/0']);
    expect(polished.adoption).toMatchObject({ suggested: 2, taken: 0, rejected: 1, notTaken: { harder: 2 } });
    expect(polished.summary).toBe(
      'Fingering: already the easiest · Claude: 0 of 2 suggested positions taken (not taken: 2 harder to play than the optimizer’s) · 1 note rejected (pitch or rhythm changed)',
    );
    expect(polished.usage).toEqual({ inputTokens: 1000, outputTokens: 200 });
  });

  it('keeps the exact result when Claude’s polish does not come, and says why', async () => {
    // Arrange
    const cut = cutStream(toolMessage('write_bars', { bars: [] }), 5);
    const easy = lowerKey(openEs(), WHOLE_TRACK, 0);

    // Act
    const polished = await polishFingering(easy, WHOLE_TRACK, 'claude-opus-5-5', claude([cut]), () => undefined);

    // Assert
    expect(polished.song).toBe(easy.song);
    expect(polished.summary).toMatch(/Claude’s polish did not come \(.+\): the optimizer’s fingering was kept/);
  });
});

describe('rewriteSummary', () => {
  it('counts the bars Claude changed, the notes before and after, and the highest fret', () => {
    // Arrange
    const before = openEs();
    const after = buildSongFromTranscription([{ tracks: [GUITAR], measures: [{ parts: [{ track: 0, beats: [{ duration: 'whole', notes: [{ string: 1, fret: 7 }] }] }] }] }]).song;

    // Act
    const summary = rewriteSummary(before, after, WHOLE_TRACK, 0);

    // Assert
    expect(summary).toBe('Rewrote bar 1 · 1 bar changed · notes 4 → 1 · highest fret 0 → 7');
  });
});
