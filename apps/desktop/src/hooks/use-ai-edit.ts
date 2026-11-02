import { type Dispatch, useCallback, useRef, useState } from 'react';
import { MAX_TRANSCRIBED_TRACKS, type Song } from '@gp-editor/core';
import { type AiEditRange, type AiEditTarget, aiEditRangeOf } from '../ai-edit/ai-edit-scope';
import { planChunks } from '../ai-edit/chunks';
import { lowerKey, polishFingering } from '../ai-edit/preset';
import { type AiEditStep, runAiEdit } from '../ai-edit/run-ai-edit';
import { changedBars, presetSummary, rewriteSummary } from '../ai-edit/summary';
import type { ScoreText } from '../compose/score-text';
import type { ClaudeDeps } from '../lib/ask-tool';
import { t } from '../lib/i18n/i18n';
import type { TokenUsage } from '../lib/tool-answer';
import { sendMessages } from '../native/anthropic';
import { type WorkspaceAction, type WorkspaceState, activeEditor } from '../state/workspace';
import { readingText } from './use-compose';
import { wait } from '../lib/wait';
import { type RunContext, type RunFinish, type RunGuard, type RunProgress, type RunWording, type TabRunStatus, tabSong, useTabRun } from './use-tab-run';

/** The preset (lower the key and make it easy to play) or the user's instruction to Claude. */
export type AiEditKind = 'lowerKey' | 'instruction';

/** What the AI Edit panel holds while it is filled in; kept when the panel closes. */
export interface AiEditDraft {
  readonly target: AiEditTarget;
  readonly kind: AiEditKind;
  /** The preset's amount, −MAX_AI_EDIT_SEMITONES … MAX_AI_EDIT_SEMITONES; 0 re-fingers only. */
  readonly semitones: number;
  /** After the preset, ask Claude for easier positions. */
  readonly isPolished: boolean;
  readonly prompt: string;
  /** An instruction may add bars after the score's last bar (its scope reaching it); else Claude rewrites the bars in place. */
  readonly mayAddBars: boolean;
}

/** The preset's stepper: an octave down to an octave up. */
export const MAX_AI_EDIT_SEMITONES = 12;

export const INITIAL_AI_EDIT_DRAFT: AiEditDraft = { target: 'track', kind: 'lowerKey', semitones: -2, isPolished: false, prompt: '', mayAddBars: false };

/** What was written, for the panel's result: the summary, what Claude read and cost (empty without Claude), warnings. */
export interface AiEditResultView {
  readonly summary: string;
  readonly detail: string;
  readonly warnings: readonly string[];
}

export type AiEditStatus = TabRunStatus<AiEditResultView>;

export interface AiEdit {
  readonly isOpen: boolean;
  /** Opens the panel on the selection when there is one. */
  readonly open: () => void;
  /** Closes the panel; a run going on is stopped. */
  readonly close: () => void;
  /** Closes the panel for another AI Wizard panel: a run going on goes on, and the other panel says Claude is busy. */
  readonly hide: () => void;
  readonly draft: AiEditDraft;
  readonly changeDraft: (change: Partial<AiEditDraft>) => void;
  /** For the shown tab. */
  readonly status: AiEditStatus;
  /** Runs the draft on the shown score (Claude through `model` when it needs it), one undo step. */
  readonly run: (model: string) => void;
  readonly cancel: () => void;
}

/** True when the draft asks Claude: an instruction, or the preset with its polish. */
export function needsClaude(draft: AiEditDraft): boolean {
  return draft.kind === 'instruction' || draft.isPolished;
}

/** The tracks a draft's scope may name: the selection's (none when nothing is selected) and the cursor's. */
export interface DraftTracks {
  readonly selection?: number;
  readonly current: number;
}

/** Why Claude cannot write the scope's track: past the tracks its answer can name (as Compose from Here). */
function trackOutOfReach(draft: AiEditDraft, tracks: DraftTracks): string | undefined {
  const trackIndex = draft.target === 'selection' ? tracks.selection : draft.target === 'track' ? tracks.current : undefined;
  return needsClaude(draft) && trackIndex !== undefined && trackIndex >= MAX_TRANSCRIBED_TRACKS
    ? t('aiEdit.trackOutOfReach', { max: MAX_TRANSCRIBED_TRACKS, track: trackIndex + 1 })
    : undefined;
}

/** Why the draft cannot run yet, in the shown language; undefined when it can. */
export function aiEditProblem(draft: AiEditDraft, tracks: DraftTracks): string | undefined {
  if (draft.target === 'selection' && tracks.selection === undefined) {
    return t('aiEdit.needsSelection');
  }
  return trackOutOfReach(draft, tracks) ?? (draft.kind === 'instruction' && draft.prompt.trim() === '' ? t('aiEdit.needsPrompt') : undefined);
}

/** The draft's tracks in an editor: the selection's and the cursor's. */
function draftTracksOf(editor: RunContext['editor']): DraftTracks {
  const current = editor.cursor?.trackIndex ?? editor.trackIndex;
  return editor.selectionAnchor === undefined ? { current } : { selection: editor.selectionAnchor.trackIndex, current };
}

/** The edit to write, with what to say, for the tab's score when the answer comes. */
interface Edit {
  readonly song: Song;
  readonly view: AiEditResultView;
  readonly keepsBeats: boolean;
  /** Said when the edit changes nothing. */
  readonly unchanged: string;
}

function finish(workspace: WorkspaceState, tabId: string, basis: Song, edit: Edit): RunFinish<AiEditResultView> {
  if (tabSong(workspace, tabId) !== basis) {
    return { kind: 'failed', message: t('aiEdit.changed') };
  }
  if (edit.song === basis) {
    return { kind: 'failed', message: edit.unchanged };
  }
  const action: WorkspaceAction = { type: 'inTab', tabId, action: { type: 'applyAiEdit', basis, song: edit.song, summary: edit.view.summary, keepsBeats: edit.keepsBeats } };
  return { kind: 'apply', action, basis, written: edit.song, result: edit.view };
}

/** "Claude read all 32 bars · 1200 tokens in, 400 out": what Claude read (one part) and what it cost. */
function detailOf(song: Song, score: ScoreText | undefined, usage: TokenUsage, parts: number): string {
  const reading = score === undefined || parts > 1 ? '' : readingText(score, song.measureHeaders.length);
  const tokens = usage.inputTokens + usage.outputTokens === 0 ? '' : t('tools.compose.tokens', { input: usage.inputTokens, output: usage.outputTokens });
  return [reading, tokens].filter((part) => part !== '').join(' · ');
}

function progressOf(step: AiEditStep): RunProgress {
  return step.parts > 1 ? { attempt: step.attempt, part: { index: step.part + 1, count: step.parts } } : { attempt: step.attempt };
}

function claudeDeps(context: RunContext): ClaudeDeps {
  return { send: sendMessages, wait, isCancelled: context.isCancelled };
}

/** The preset, exactly; then, when asked, Claude's polish (its answer checked note by note). */
async function presetEdit(context: RunContext, range: AiEditRange, draft: AiEditDraft, model: string): Promise<Edit> {
  // A long score takes a moment to re-finger: the panel shows the run first.
  await wait(0);
  const lowered = lowerKey(context.song, range, draft.semitones);
  const exact = { song: lowered.song, keepsBeats: true, unchanged: t('aiEdit.nothingToChange') };
  if (!draft.isPolished) {
    return { ...exact, view: { summary: presetSummary(lowered, draft.semitones, { song: lowered.song, cost: lowered.refingering.after }), detail: '', warnings: [] } };
  }
  const polished = await polishFingering(lowered, range, model, claudeDeps(context), (step) => context.onProgress(progressOf(step)));
  return { ...exact, song: polished.song, view: { summary: polished.summary, detail: detailOf(context.song, polished.score, polished.usage, 1), warnings: polished.warnings } };
}

/** Claude rewrites the range's bars as the user asks, part after part; why not, when nothing came. */
async function instructionEdit(context: RunContext, range: AiEditRange, draft: AiEditDraft, model: string): Promise<Edit | string> {
  const chunks = planChunks(context.song, range.firstBar, range.lastBar, range.trackIndexes);
  const plan = { mode: { kind: 'instruction', prompt: draft.prompt } as const, chunks, trackIndexes: range.trackIndexes, mayAddBars: draft.mayAddBars };
  const answer = await runAiEdit(context.song, plan, model, claudeDeps(context), (step) => context.onProgress(progressOf(step)));
  if (!answer.isOk) {
    return answer.message;
  }
  const summary = rewriteSummary(context.song, answer.song, range, answer.barsAdded);
  const reasons = answer.warnings.join(' ').trim();
  const unchanged = t('aiEdit.nothingChanged', { detail: reasons === '' ? t('aiEdit.noReason') : reasons });
  const isUnchanged = changedBars(context.song, answer.song, range, answer.barsAdded) === 0;
  return { song: isUnchanged ? context.song : answer.song, keepsBeats: false, unchanged, view: { summary, detail: detailOf(context.song, answer.score, answer.usage, chunks.length), warnings: answer.warnings } };
}

interface AiEditSources {
  readonly workspace: WorkspaceState;
  readonly dispatch: Dispatch<WorkspaceAction>;
  /** One Claude run at a time with the window's other AI Wizard panel. */
  readonly guard?: RunGuard;
}

const AI_EDIT_WORDING: RunWording = { cancelled: () => t('aiEdit.cancelled'), changed: () => t('aiEdit.changed') };

/**
 * Edit ▸ AI Wizard ▸ AI Edit… (and the palette's AI Edit): the panel's draft and one run at a time on the shown score
 * (useTabRun: per-tab status, Stop). The preset transposes and re-fingers exactly — at once, or with Claude's polish
 * checked note by note —; an instruction has Claude rewrite the range's bars. Either is written into the tab it began
 * in, if its score is still the one the run read, as one editor action (one undo step).
 */
export function useAiEdit({ workspace, dispatch, guard }: AiEditSources): AiEdit {
  const [isOpen, setIsOpen] = useState(false);
  const [draft, setDraft] = useState<AiEditDraft>(INITIAL_AI_EDIT_DRAFT);
  const { status, start, cancel, reset } = useTabRun<AiEditResultView>(workspace, dispatch, AI_EDIT_WORDING, { owner: 'aiEdit', guard });
  const latest = useRef(workspace);
  latest.current = workspace;

  const run = useCallback(
    (model: string) =>
      start(async (context) => {
        const range = aiEditRangeOf(context.editor, context.song, draft.target);
        const problem = aiEditProblem(draft, draftTracksOf(context.editor));
        if (range === undefined || problem !== undefined) {
          return () => ({ kind: 'failed', message: problem ?? t('aiEdit.needsSelection') });
        }
        const edit = draft.kind === 'lowerKey' ? await presetEdit(context, range, draft, model) : await instructionEdit(context, range, draft, model);
        return (now) => (typeof edit === 'string' ? { kind: 'failed', message: edit } : finish(now, context.tabId, context.song, edit));
      }),
    [draft, start],
  );

  const open = useCallback(() => {
    const hasSelection = activeEditor(latest.current).selectionAnchor !== undefined;
    // On the selection when there is one; off a selection that is gone.
    const targetOf = (current: AiEditTarget): AiEditTarget => (hasSelection ? 'selection' : current === 'selection' ? 'track' : current);
    setDraft((current) => ({ ...current, target: targetOf(current.target) }));
    reset();
    setIsOpen(true);
  }, [reset]);

  const close = useCallback(() => {
    cancel();
    setIsOpen(false);
  }, [cancel]);

  return {
    isOpen,
    open,
    close,
    hide: useCallback(() => setIsOpen(false), []),
    draft,
    changeDraft: useCallback((change: Partial<AiEditDraft>) => setDraft((current) => ({ ...current, ...change })), []),
    status,
    run,
    cancel,
  };
}
