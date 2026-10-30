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
import { type AskWording, type ClaudeDeps, askTool } from '../lib/ask-tool';
import { errorMessage } from '../lib/errors';
import { t } from '../lib/i18n/i18n';
import { NO_USAGE, type TokenUsage, addUsage } from '../lib/tool-answer';
import { type SongIdea, buildPlanRequest, buildSectionRequest } from './request';

/** What a run needs from the outside world; injected so it can be tested without native code or network. */
export type SongWriterDeps = ClaudeDeps;

/** Where a run is, for the progress line. */
export type SongWriterStep =
  | { readonly kind: 'planning' }
  /** `writing`: the names of the sections being written now. */
  | { readonly kind: 'writing'; readonly written: number; readonly total: number; readonly writing: readonly string[] };

export type SongWriterResult =
  | { readonly isOk: true; readonly song: Song; readonly plan: SongPlan; readonly warnings: readonly string[]; readonly usage: TokenUsage }
  | { readonly isOk: false; readonly message: string; readonly usage: TokenUsage };

/** Sections written at the same time, as the PDF import does pages. */
const CONCURRENT_SECTIONS = 3;

/** How the answers' messages name a plan and a section, in the shown language. */
const songWriterWording = (tooLong: string, what: string): AskWording => ({
  tooLong,
  what,
  cancelled: t('tools.songWriter.cancelled'),
  didNotFit: (detail) => t('tools.songWriter.didNotFit', { detail }),
});
const planWording = (): AskWording => songWriterWording(t('tools.songWriter.planTooLong'), t('tools.songWriter.aPlan'));
const sectionWording = (): AskWording => songWriterWording(t('tools.songWriter.sectionTooLong'), t('tools.songWriter.theSection'));

/** A section that could not be written: its bars as rests, so the song keeps its length, and why (the build names the section). */
function restSection(bars: number, message: string): TranscriptionPage {
  return { measures: Array.from({ length: bars }, () => ({ parts: [] })), warnings: [t('tools.songWriter.sectionAsRests', { detail: message })] };
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
      batch.map((_, offset) => askTool(deps, JSON.stringify(buildSectionRequest(model, idea, plan, start + offset)), WRITE_SECTION_TOOL.name, sectionWording(), parseTranscriptionPage)),
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
  const planned = await askTool(deps, JSON.stringify(buildPlanRequest(model, idea)), PLAN_SONG_TOOL.name, planWording(), parseSongPlan);
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
    return { isOk: false, message: t('tools.songWriter.buildFailed', { detail: errorMessage(error) }), usage };
  }
}
