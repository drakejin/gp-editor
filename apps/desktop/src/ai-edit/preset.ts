import { type EasyTransposition, type FingeringAdoption, type Song, adoptFingering, easyTranspose, fingeringCost } from '@gp-editor/core';
import type { ScoreText } from '../compose/score-text';
import type { ClaudeDeps } from '../lib/ask-tool';
import { NO_USAGE, type TokenUsage } from '../lib/tool-answer';
import { type AiEditRange, fingeringTracks } from './ai-edit-scope';
import { planChunks } from './chunks';
import { type AiEditStep, runAiEdit } from './run-ai-edit';
import { presetSummary } from './summary';

/** The exact result, and the semitones it moved by. */
export interface LoweredKey extends EasyTransposition {
  readonly semitones: number;
}

/** "Lower the key and make it easy to play", exactly: the range transposed by `semitones` (drums stay) and re-fingered. */
export function lowerKey(song: Song, range: AiEditRange, semitones: number): LoweredKey {
  return { ...easyTranspose(song, range.scope, semitones), semitones };
}

/** The preset with Claude's polish: the song to write, what to say, what Claude's answer cost and what it read. */
export interface PolishedFingering {
  readonly song: Song;
  readonly summary: string;
  /** Claude's answer as checked; undefined when no answer came. */
  readonly adoption?: FingeringAdoption;
  readonly warnings: readonly string[];
  readonly usage: TokenUsage;
  readonly score?: ScoreText;
}

/**
 * Claude's polish of the exact result: the range's fretted tracks asked for again with easier positions (runAiEdit,
 * part after part), each answer checked note by note (gp-core adoptFingering: another pitch or rhythm rejected, a
 * position no hand can play there not taken). When no answer comes the exact result stays, and the summary says why.
 */
export async function polishFingering(easy: LoweredKey, range: AiEditRange, model: string, deps: ClaudeDeps, onStep: (step: AiEditStep) => void): Promise<PolishedFingering> {
  const tracks = fingeringTracks(easy.song, range);
  const exact = (failure?: string, usage: TokenUsage = NO_USAGE): PolishedFingering => ({
    song: easy.song,
    summary: presetSummary(easy, easy.semitones, easy.refingering.after, undefined, failure),
    warnings: [],
    usage,
  });
  if (tracks.length === 0) {
    return exact();
  }
  const plan = { mode: { kind: 'fingering' } as const, chunks: planChunks(easy.song, range.firstBar, range.lastBar, tracks), trackIndexes: tracks };
  const answer = await runAiEdit(easy.song, plan, model, deps, onStep);
  if (!answer.isOk) {
    return exact(answer.message, answer.usage);
  }
  const adoption = adoptFingering(easy.song, answer.song, range.scope);
  const after = fingeringCost(adoption.song, range.scope);
  return {
    song: adoption.song,
    summary: presetSummary(easy, easy.semitones, after, adoption),
    adoption,
    warnings: answer.warnings,
    usage: answer.usage,
    ...(answer.score === undefined ? {} : { score: answer.score }),
  };
}
