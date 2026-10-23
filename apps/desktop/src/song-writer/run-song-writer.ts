import {
  PLAN_SONG_TOOL,
  type Song,
  type SongPlan,
  type TranscriptionPage,
  WRITE_SECTION_TOOL,
  buildComposedSong,
  parseSongPlan,
  parseTranscriptionPage,
} from '@gp-editor/core';
import { errorMessage } from '../lib/errors';
import { NO_USAGE, type TokenUsage, type ToolAnswer, type ToolAnswerWording, addUsage, readToolAnswer } from '../lib/tool-answer';
import type { ApiResponse } from '../native/anthropic';
import { type SongIdea, buildPlanRequest, buildSectionRequest } from './request';

/** What a run needs from the outside world; injected so it can be tested without native code or network. */
export interface SongWriterDeps {
  readonly send: (body: string) => Promise<ApiResponse>;
  readonly wait: (milliseconds: number) => Promise<void>;
  readonly isCancelled: () => boolean;
}

/** Where a run is, for the progress line. */
export type SongWriterStep =
  | { readonly kind: 'planning' }
  /** `writing`: the names of the sections being written now. */
  | { readonly kind: 'writing'; readonly written: number; readonly total: number; readonly writing: readonly string[] };

export type SongWriterResult =
  | { readonly isOk: true; readonly song: Song; readonly plan: SongPlan; readonly warnings: readonly string[]; readonly usage: TokenUsage }
  | { readonly isOk: false; readonly message: string; readonly usage: TokenUsage };

const MAX_ATTEMPTS = 3;
const FIRST_RETRY_DELAY_MS = 2000;
/** Sections written at the same time, as the PDF import does pages. */
const CONCURRENT_SECTIONS = 3;
const CANCELLED = 'Cancelled';

type Asked<T> =
  | { readonly isOk: true; readonly value: T; readonly usage: TokenUsage }
  | { readonly isOk: false; readonly isFatal: boolean; readonly message: string; readonly usage: TokenUsage };

/** One forced tool call with retries (backing off 2 s, 4 s); an answer that does not parse is asked for again. */
async function askTool<T>(deps: SongWriterDeps, body: string, tool: string, wording: ToolAnswerWording, parse: (input: unknown) => T): Promise<Asked<T>> {
  let usage = NO_USAGE;
  let message = '';
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    if (deps.isCancelled()) {
      return { isOk: false, isFatal: true, message: CANCELLED, usage };
    }
    if (attempt > 0) {
      await deps.wait(FIRST_RETRY_DELAY_MS * 2 ** (attempt - 1));
    }
    const answer = await deps.send(body).then(
      (response) => readToolAnswer(response, tool, wording),
      (error: unknown): ToolAnswer => ({ isOk: false, isRetryable: true, message: errorMessage(error) }),
    );
    if (!answer.isOk) {
      if (!answer.isRetryable) {
        return { isOk: false, isFatal: answer.isFatal === true, message: answer.message, usage };
      }
      message = answer.message;
      continue;
    }
    usage = addUsage(usage, answer.usage);
    try {
      return { isOk: true, value: parse(answer.input), usage };
    } catch (error: unknown) {
      message = `The answer did not fit the format: ${errorMessage(error)}`;
    }
  }
  return { isOk: false, isFatal: false, message, usage };
}

const PLAN_WORDING: ToolAnswerWording = { tooLong: 'The plan was too long for one answer', what: 'a plan' };
const SECTION_WORDING: ToolAnswerWording = { tooLong: 'The section was too long for one answer', what: 'the section' };

/** A section that could not be written: its bars as rests, so the song keeps its length, and why (the build names the section). */
function restSection(bars: number, message: string): TranscriptionPage {
  return { measures: Array.from({ length: bars }, () => ({ parts: [] })), warnings: [`could not be written (${message}); its bars are rests`] };
}

interface Written {
  readonly pages: readonly TranscriptionPage[];
  readonly usage: TokenUsage;
  /** Set when everything must stop (a refused key, cancelled). */
  readonly fatal?: string;
}

/** Every section of the plan, CONCURRENT_SECTIONS at a time, in order. */
async function writeSections(idea: SongIdea, model: string, plan: SongPlan, deps: SongWriterDeps, onStep: (step: SongWriterStep) => void): Promise<Written> {
  const total = plan.sections.length;
  const pages: (TranscriptionPage | undefined)[] = plan.sections.map(() => undefined);
  let usage = NO_USAGE;
  for (let start = 0; start < total; start += CONCURRENT_SECTIONS) {
    const batch = plan.sections.slice(start, start + CONCURRENT_SECTIONS);
    onStep({ kind: 'writing', written: start, total, writing: batch.map((section) => section.name) });
    const answers = await Promise.all(
      batch.map((_, offset) => askTool(deps, JSON.stringify(buildSectionRequest(model, idea, plan, start + offset)), WRITE_SECTION_TOOL.name, SECTION_WORDING, parseTranscriptionPage)),
    );
    usage = answers.reduce((sum, answer) => addUsage(sum, answer.usage), usage);
    const fatal = answers.find((answer) => !answer.isOk && answer.isFatal);
    if (fatal !== undefined && !fatal.isOk) {
      return { pages: [], usage, fatal: fatal.message };
    }
    answers.forEach((answer, offset) => {
      const section = batch[offset];
      pages[start + offset] = answer.isOk ? answer.value : restSection(section?.bars ?? 1, answer.message);
    });
  }
  onStep({ kind: 'writing', written: total, total, writing: [] });
  return { pages: pages.flatMap((page) => page ?? []), usage };
}

/**
 * Writes a song with Claude: plan_song first (tempo, meter, key, tracks, sections with chords and lyrics), then each
 * section's measures with write_section, then the song built from them (buildComposedSong). A section that cannot be
 * written becomes rests with a warning; a refused key or account, or cancelling, stops the run.
 */
export async function writeSong(idea: SongIdea, model: string, deps: SongWriterDeps, onStep: (step: SongWriterStep) => void): Promise<SongWriterResult> {
  onStep({ kind: 'planning' });
  const planned = await askTool(deps, JSON.stringify(buildPlanRequest(model, idea)), PLAN_SONG_TOOL.name, PLAN_WORDING, parseSongPlan);
  if (!planned.isOk) {
    return { isOk: false, message: planned.message, usage: planned.usage };
  }
  const written = await writeSections(idea, model, planned.value, deps, onStep);
  const usage = addUsage(planned.usage, written.usage);
  if (written.fatal !== undefined) {
    return { isOk: false, message: written.fatal, usage };
  }
  try {
    const built = buildComposedSong(planned.value, written.pages, { genre: idea.genre, description: idea.description });
    return { isOk: true, song: built.song, plan: planned.value, warnings: built.warnings, usage };
  } catch (error: unknown) {
    return { isOk: false, message: `The song could not be built: ${errorMessage(error)}`, usage };
  }
}
