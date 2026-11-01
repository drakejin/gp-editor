import { type Dispatch, useCallback, useRef, useState } from 'react';
import { MAX_COMPOSED_BARS, type Song, applyComposedBars } from '@gp-editor/core';
import type { ComposeIdea, ComposeTracks } from '../compose/request';
import { type ComposeRunResult, runCompose } from '../compose/run-compose';
import type { ScoreText } from '../compose/score-text';
import { composeSummary } from '../compose/summary';
import { t } from '../lib/i18n/i18n';
import type { TokenUsage } from '../lib/tool-answer';
import { sendMessages } from '../native/anthropic';
import { type WorkspaceAction, type WorkspaceState, activeEditor } from '../state/workspace';
import { wait } from '../lib/wait';
import { type RunFinish, type RunGuard, type RunWording, type TabRunStatus, tabSong, useTabRun } from './use-tab-run';

/** What the Compose from Here panel holds while it is filled in; kept when the panel closes. */
export interface ComposeDraft {
  /** 1-based; the score's bar count + 1 starts after its last bar. */
  readonly startBar: number;
  readonly scope: ComposeTracks;
  readonly prompt: string;
  readonly allowsNewTracks: boolean;
  /** Write at most `barLimit` bars; otherwise as many as the music needs. */
  readonly isLimited: boolean;
  readonly barLimit: number;
}

export const INITIAL_COMPOSE_DRAFT: ComposeDraft = { startBar: 1, scope: 'track', prompt: '', allowsNewTracks: true, isLimited: false, barLimit: 8 };

/** What was written, for the panel's result. */
export interface ComposeResultView {
  readonly summary: string;
  /** What Claude read of the score: all of it, or which bars note for note. */
  readonly reading: string;
  readonly warnings: readonly string[];
  readonly usage: TokenUsage;
}

/** The status the panel shows, for the shown tab: a run started in another tab is `elsewhere` there. */
export type ComposeStatus = TabRunStatus<ComposeResultView>;

export interface Compose {
  readonly isOpen: boolean;
  /** Opens the panel with the start bar at the cursor's bar. */
  readonly open: () => void;
  /** Closes the panel; a run going on is stopped. */
  readonly close: () => void;
  readonly draft: ComposeDraft;
  readonly changeDraft: (change: Partial<ComposeDraft>) => void;
  /** For the shown tab. */
  readonly status: ComposeStatus;
  /** Asks `model` for the bars and writes them into the shown score as one undo step. */
  readonly compose: (model: string) => void;
  readonly cancel: () => void;
}

/** The request a draft makes for `song`: the start within the bars and one after, the bar limit within the tool's. */
export function composeIdeaOf(draft: ComposeDraft, song: Song, trackIndex: number): ComposeIdea {
  const startIndex = Math.max(0, Math.min(Math.round(draft.startBar) - 1, song.measureHeaders.length));
  const maxBars = draft.isLimited ? Math.max(1, Math.min(Math.round(draft.barLimit), MAX_COMPOSED_BARS)) : undefined;
  return { prompt: draft.prompt, startIndex, scope: draft.scope, trackIndex, allowsNewTracks: draft.allowsNewTracks, ...(maxBars === undefined ? {} : { maxBars }) };
}

/** "Claude read all 224 bars" or "Claude read bars 75–131 note for note, the rest summarised". */
export function readingText(score: ScoreText, barCount: number): string {
  return score.isSummarized ? t('tools.compose.scorePart', { first: score.detailFirst + 1, last: score.detailLast + 1 }) : t('tools.compose.scoreWhole', { bars: t('common.bars', { count: barCount }) });
}

/** A run's answer against the score of its tab now: nothing written, a changed score, or the bars to write. */
function finishRun(workspace: WorkspaceState, tabId: string, song: Song, idea: ComposeIdea, result: ComposeRunResult): RunFinish<ComposeResultView> {
  if (!result.isOk) {
    return { kind: 'failed', message: result.message };
  }
  if (tabSong(workspace, tabId) !== song) {
    return { kind: 'failed', message: t('tools.compose.changed') };
  }
  const outcome = applyComposedBars(song, result.composed, idea.startIndex);
  if (outcome.song === song) {
    const reasons = outcome.warnings.join(' ').trim();
    return { kind: 'failed', message: t('tools.compose.nothingApplied', { detail: reasons === '' ? t('tools.compose.noReason') : reasons }) };
  }
  const view: ComposeResultView = {
    summary: composeSummary(outcome, Math.min(idea.startIndex, song.measureHeaders.length)),
    reading: readingText(result.score, song.measureHeaders.length),
    warnings: outcome.warnings,
    usage: result.usage,
  };
  const action: WorkspaceAction = { type: 'inTab', tabId, action: { type: 'applyComposedBars', basis: song, outcome, startIndex: idea.startIndex } };
  return { kind: 'apply', action, basis: song, written: outcome.song, result: view };
}

interface ComposeSources {
  readonly workspace: WorkspaceState;
  readonly dispatch: Dispatch<WorkspaceAction>;
  /** One Claude run at a time with the window's other AI Wizard panel. */
  readonly guard?: RunGuard;
}

const COMPOSE_WORDING: RunWording = { cancelled: () => t('tools.compose.cancelled'), changed: () => t('tools.compose.changed') };

/**
 * Edit ▸ AI Wizard ▸ Compose from Here… (and the palette's AI Compose): the panel's draft and one run of runCompose at a
 * time, on the shown score (useTabRun). The bars go into the tab the run began in — only if its score is still the one
 * Claude read — as one editor action (one undo step); `done` once the editor has written them.
 */
export function useCompose({ workspace, dispatch, guard }: ComposeSources): Compose {
  const [isOpen, setIsOpen] = useState(false);
  const [draft, setDraft] = useState<ComposeDraft>(INITIAL_COMPOSE_DRAFT);
  const run = useTabRun<ComposeResultView>(workspace, dispatch, COMPOSE_WORDING, { owner: 'compose', guard });
  const { start, cancel, reset } = run;
  const latest = useRef(workspace);
  latest.current = workspace;

  const compose = useCallback(
    (model: string) =>
      start(async ({ tabId, editor, song, isCancelled, onProgress }) => {
        const idea = composeIdeaOf(draft, song, editor.cursor?.trackIndex ?? editor.trackIndex);
        const result = await runCompose(song, idea, model, { send: sendMessages, wait, isCancelled }, (step) => onProgress({ attempt: step.attempt }));
        return (now) => finishRun(now, tabId, song, idea, result);
      }),
    [draft, start],
  );

  const open = useCallback(() => {
    const cursorBar = (activeEditor(latest.current).cursor?.measureIndex ?? 0) + 1;
    setDraft((current) => ({ ...current, startBar: cursorBar }));
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
    draft,
    changeDraft: useCallback((change: Partial<ComposeDraft>) => setDraft((current) => ({ ...current, ...change })), []),
    status: run.status,
    compose,
    cancel,
  };
}
