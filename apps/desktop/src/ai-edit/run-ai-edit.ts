import { type ComposedBars, type Song, WRITE_BARS_TOOL, applyComposedBars, parseComposedBars } from '@gp-editor/core';
import type { ScoreText } from '../compose/score-text';
import { type AskWording, type ClaudeDeps, askTool } from '../lib/ask-tool';
import { t } from '../lib/i18n/i18n';
import { NO_USAGE, type TokenUsage, addUsage } from '../lib/tool-answer';
import type { BarChunk } from './chunks';
import { type AiEditMode, type AiEditPart, aiEditScopeOf, buildAiEditRequest } from './request';

/** What a run asks for: the instruction or the fingering, the bars in parts, and the tracks Claude may write. */
export interface AiEditPlan {
  readonly mode: AiEditMode;
  readonly chunks: readonly BarChunk[];
  readonly trackIndexes: readonly number[];
}

/** Where a run is, for the progress line: the part (0-based, of `parts`) and the attempt (1–3) at it. */
export interface AiEditStep {
  readonly attempt: number;
  readonly part: number;
  readonly parts: number;
}

/** What Claude wrote: the song with its bars in, part after part, and what to tell the user. */
export interface AiEditAnswer {
  readonly song: Song;
  readonly partsWritten: number;
  readonly barsAdded: number;
  /** The parts left as they were and why, then the answers' and the check's warnings. */
  readonly warnings: readonly string[];
  readonly usage: TokenUsage;
  /** What Claude read of the score for the first part written. */
  readonly score?: ScoreText;
}

export type AiEditRunResult = ({ readonly isOk: true } & AiEditAnswer) | { readonly isOk: false; readonly message: string; readonly usage: TokenUsage };

const aiEditWording = (): AskWording => ({
  tooLong: t('aiEdit.tooLong'),
  what: t('aiEdit.theBars'),
  cancelled: t('aiEdit.cancelled'),
  didNotFit: (detail) => t('aiEdit.didNotFit', { detail }),
});

/** One part's answer: the checked bars and the score text Claude read, or why there are none — fatal when all must stop. */
type PartAnswer =
  | { readonly isOk: true; readonly composed: ComposedBars; readonly score: ScoreText; readonly usage: TokenUsage }
  | { readonly isOk: false; readonly isFatal: boolean; readonly message: string; readonly usage: TokenUsage };

async function askPart(song: Song, part: AiEditPart, model: string, deps: ClaudeDeps, onStep: (step: AiEditStep) => void): Promise<PartAnswer> {
  const { body, score } = buildAiEditRequest(song, model, part);
  const scope = aiEditScopeOf(song, part);
  const asked = await askTool(deps, JSON.stringify(body), WRITE_BARS_TOOL.name, aiEditWording(), (input) => parseComposedBars(input, scope), (attempt) =>
    onStep({ attempt, part: part.index, parts: part.count }),
  );
  if (!asked.isOk) {
    return asked;
  }
  if (asked.value.bars.length === 0) {
    const reasons = asked.value.warnings.join(' ').trim();
    return { isOk: false, isFatal: false, message: t('aiEdit.noBars', { detail: reasons === '' ? t('aiEdit.noReason') : reasons }), usage: asked.usage };
  }
  return { isOk: true, composed: asked.value, score, usage: asked.usage };
}

interface Progress {
  readonly song: Song;
  readonly partsWritten: number;
  readonly barsAdded: number;
  readonly leftOut: readonly string[];
  readonly warnings: readonly string[];
  readonly usage: TokenUsage;
  readonly score?: ScoreText;
  readonly lastFailure: string;
}

/** The progress with a part's bars written in. */
function withPart(progress: Progress, chunk: BarChunk, answer: Extract<PartAnswer, { isOk: true }>): Progress {
  const outcome = applyComposedBars(progress.song, answer.composed, chunk.first);
  return {
    ...progress,
    song: outcome.song,
    partsWritten: progress.partsWritten + 1,
    barsAdded: progress.barsAdded + outcome.barsAdded,
    warnings: [...progress.warnings, ...outcome.warnings],
    usage: addUsage(progress.usage, answer.usage),
    score: progress.score ?? answer.score,
  };
}

/**
 * AI Edit with Claude: one write_bars request per part, in order (each asked again on a cut-off, overloaded or
 * unreadable answer, up to three times), its bars written into the song as they come — an instruction's next part reads
 * the song with them, a re-fingering's every part reads `song` as it is. A part that fails is left as it was and said
 * so; a refused key, a refusal or stopping fails the run, as does a run that wrote no part. The song given is never
 * changed: the editor applies the result as one undo step.
 */
export async function runAiEdit(song: Song, plan: AiEditPlan, model: string, deps: ClaudeDeps, onStep: (step: AiEditStep) => void): Promise<AiEditRunResult> {
  // The score's text takes a moment on a long score: the panel shows the run first.
  await deps.wait(0);
  let progress: Progress = { song, partsWritten: 0, barsAdded: 0, leftOut: [], warnings: [], usage: NO_USAGE, lastFailure: '' };
  for (const [index, chunk] of plan.chunks.entries()) {
    const reads = plan.mode.kind === 'instruction' ? progress.song : song;
    const answer = await askPart(reads, { mode: plan.mode, chunk, trackIndexes: plan.trackIndexes, index, count: plan.chunks.length }, model, deps, onStep);
    if (answer.isOk) {
      progress = withPart(progress, chunk, answer);
      continue;
    }
    const usage = addUsage(progress.usage, answer.usage);
    if (answer.isFatal) {
      return { isOk: false, message: answer.message, usage };
    }
    const leftOut = t('aiEdit.partLeft', { first: chunk.first + 1, last: chunk.last + 1, reason: answer.message });
    progress = { ...progress, usage, leftOut: [...progress.leftOut, leftOut], lastFailure: answer.message };
  }
  if (progress.partsWritten === 0) {
    return { isOk: false, message: plan.chunks.length === 1 ? progress.lastFailure : progress.leftOut.join(' '), usage: progress.usage };
  }
  const { partsWritten, barsAdded, usage, score } = progress;
  return { isOk: true, song: progress.song, partsWritten, barsAdded, usage, warnings: [...progress.leftOut, ...progress.warnings], ...(score === undefined ? {} : { score }) };
}
