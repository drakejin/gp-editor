import { type Song, type TranscribedTrack, buildSongFromTranscription } from '@gp-editor/core';
import { type AiEditPlan, type AiEditStep, runAiEdit } from '../src/ai-edit/run-ai-edit';
import type { ClaudeDeps } from '../src/lib/ask-tool';
import type { ApiResponse } from '../src/native/anthropic';
import { cutStream, streamedMessage, toolMessage } from '../test-support/message-stream';

const GUITAR: TranscribedTrack = { name: 'Lead', instrument: 'guitar', tuning: [], capo: 0 };

/** Four bars of a guitar, E4 at the 5th fret of string 2 for a whole note in each. */
function fourBars(): Song {
  const bar = { parts: [{ track: 0, beats: [{ duration: 'whole' as const, notes: [{ string: 2, fret: 5 }] }] }] };
  return buildSongFromTranscription([{ tracks: [GUITAR], measures: [bar, bar, bar, bar] }]).song;
}

/** write_bars' input: `count` bars of the guitar, a whole note at `fret` of string 1. */
function bars(count: number, fret: number): unknown {
  return { bars: Array.from({ length: count }, () => ({ parts: [{ track: 0, beats: [{ duration: 'whole', notes: [{ string: 1, fret }] }] }] })), warnings: [] };
}

interface Run {
  readonly deps: ClaudeDeps;
  readonly sent: string[];
  readonly steps: AiEditStep[];
}

function deps(answers: readonly ApiResponse[], isCancelled = () => false): Run {
  const sent: string[] = [];
  let next = 0;
  const send = (body: string) => {
    sent.push(body);
    const answer = answers[Math.min(next, answers.length - 1)] as ApiResponse;
    next += 1;
    return Promise.resolve(answer);
  };
  return { deps: { send, wait: () => Promise.resolve(), isCancelled }, sent, steps: [] };
}

function requestText(body: string | undefined): string {
  const parsed = JSON.parse(body ?? '{}') as { readonly messages?: readonly { readonly content: readonly { readonly text: string }[] }[] };
  return parsed.messages?.[0]?.content[0]?.text ?? '';
}

/** Fret on string 1 of each bar's first note. */
function frets(song: Song): readonly (number | undefined)[] {
  return song.tracks[0]?.measures.map((measure) => measure.beats[0]?.voices[0]?.notes[0]?.fret) ?? [];
}

const INSTRUCTION: AiEditPlan = { mode: { kind: 'instruction', prompt: 'up an octave' }, chunks: [{ first: 0, last: 1 }, { first: 2, last: 3 }], trackIndexes: [0] };

describe('runAiEdit', () => {
  it('asks for each part in turn and writes Claude’s bars into the score, part after part', async () => {
    // Arrange
    const run = deps([streamedMessage(toolMessage('write_bars', bars(2, 12))), streamedMessage(toolMessage('write_bars', bars(2, 7)))]);
    const steps: AiEditStep[] = [];

    // Act
    const result = await runAiEdit(fourBars(), INSTRUCTION, 'claude-opus-5-5', run.deps, (step) => steps.push(step));

    // Assert
    if (!result.isOk) {
      throw new Error(result.message);
    }
    expect(frets(result.song)).toEqual([12, 12, 7, 7]);
    expect(result.partsWritten).toBe(2);
    expect(result.usage).toEqual({ inputTokens: 2000, outputTokens: 400 });
    expect(steps).toEqual([{ attempt: 1, part: 0, parts: 2 }, { attempt: 1, part: 1, parts: 2 }]);
    expect(requestText(run.sent[1])).toContain('@1/12');
  });

  it('leaves a part that fails three times as it was, says so, and writes the others', async () => {
    // Arrange: the first part's answer is cut off every time.
    const cut = cutStream(toolMessage('write_bars', bars(2, 12)), 6);
    const run = deps([cut, cut, cut, streamedMessage(toolMessage('write_bars', bars(2, 7)))]);

    // Act
    const result = await runAiEdit(fourBars(), INSTRUCTION, 'claude-opus-5-5', run.deps, () => undefined);

    // Assert
    if (!result.isOk) {
      throw new Error(result.message);
    }
    expect(frets(result.song)).toEqual([5, 5, 7, 7]);
    expect(result.warnings[0]).toMatch(/^Bars 1–2 were left as they were: /);
    expect(run.sent).toHaveLength(4);
  });

  it('fails when no part could be written', async () => {
    // Arrange
    const cut = cutStream(toolMessage('write_bars', bars(2, 12)), 6);

    // Act
    const result = await runAiEdit(fourBars(), { ...INSTRUCTION, chunks: [{ first: 0, last: 3 }] }, 'claude-opus-5-5', deps([cut]).deps, () => undefined);

    // Assert
    expect(result.isOk).toBe(false);
  });

  it('stops at once when stopped, with nothing written', async () => {
    // Act
    const result = await runAiEdit(fourBars(), INSTRUCTION, 'claude-opus-5-5', deps([streamedMessage(toolMessage('write_bars', bars(2, 12)))], () => true).deps, () => undefined);

    // Assert
    expect(result).toMatchObject({ isOk: false, message: 'Stopped — the score was not changed' });
  });

  it('re-fingering, shows Claude the score as it is for every part', async () => {
    // Arrange
    const run = deps([streamedMessage(toolMessage('write_bars', bars(2, 0))), streamedMessage(toolMessage('write_bars', bars(2, 0)))]);

    // Act
    const result = await runAiEdit(fourBars(), { ...INSTRUCTION, mode: { kind: 'fingering' } }, 'claude-opus-5-5', run.deps, () => undefined);

    // Assert
    expect(result.isOk).toBe(true);
    expect(requestText(run.sent[1])).not.toContain('@1/0');
  });

  it('keeps the parts written before a later request is refused, and names the part left as it was', async () => {
    // Arrange: part 2's request is refused (400).
    const refused: ApiResponse = { status: 400, body: JSON.stringify({ type: 'error', error: { type: 'invalid_request_error', message: 'prompt is too long' } }) };
    const run = deps([streamedMessage(toolMessage('write_bars', bars(2, 12))), refused]);

    // Act
    const result = await runAiEdit(fourBars(), INSTRUCTION, 'claude-opus-5-5', run.deps, () => undefined);

    // Assert
    if (!result.isOk) {
      throw new Error(result.message);
    }
    expect(frets(result.song)).toEqual([12, 12, 5, 5]);
    expect(result.warnings[0]).toBe('Bars 3–4 were left as they were: prompt is too long');
  });

  it('writes nothing when the key is refused, even after a part was written', async () => {
    // Arrange
    const refusedKey: ApiResponse = { status: 401, body: JSON.stringify({ type: 'error', error: { type: 'authentication_error', message: 'invalid x-api-key' } }) };

    // Act
    const result = await runAiEdit(fourBars(), INSTRUCTION, 'claude-opus-5-5', deps([streamedMessage(toolMessage('write_bars', bars(2, 12))), refusedKey]).deps, () => undefined);

    // Assert
    expect(result.isOk).toBe(false);
  });
});
