import { type Dispatch, useCallback, useEffect, useRef, useState } from 'react';
import { MAX_COMPOSED_BARS, type Song, applyComposedBars } from '@gp-editor/core';
import type { ComposeIdea, ComposeTracks } from '../compose/request';
import { type ComposeRunResult, runCompose } from '../compose/run-compose';
import type { ScoreText } from '../compose/score-text';
import { composeSummary } from '../compose/summary';
import { errorMessage } from '../lib/errors';
import { t } from '../lib/i18n/i18n';
import type { TokenUsage } from '../lib/tool-answer';
import { sendMessages } from '../native/anthropic';
import { type WorkspaceAction, type WorkspaceState, activeEditor } from '../state/workspace';

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
export type ComposeStatus =
  | { readonly kind: 'idle' }
  /** `startedAt`: Date.now() when the run began, for the elapsed seconds. */
  | { readonly kind: 'running'; readonly attempt: number; readonly startedAt: number }
  /** Stopped: the answer already asked for is still coming (and costs its tokens); nothing will be written. */
  | { readonly kind: 'stopping' }
  /** Claude is writing for another tab. */
  | { readonly kind: 'elsewhere' }
  | { readonly kind: 'failed'; readonly message: string }
  | { readonly kind: 'done'; readonly result: ComposeResultView };

/** A run and the tab it was started in. */
type Run =
  | { readonly kind: 'idle' }
  | { readonly kind: 'running'; readonly tabId: string; readonly attempt: number; readonly startedAt: number }
  | { readonly kind: 'stopping'; readonly tabId: string }
  /** The bars are dispatched; `written` is the song the tab holds once the editor wrote them. */
  | { readonly kind: 'applying'; readonly tabId: string; readonly basis: Song; readonly written: Song; readonly result: ComposeResultView; readonly startedAt: number }
  | { readonly kind: 'failed'; readonly tabId: string; readonly message: string }
  | { readonly kind: 'done'; readonly tabId: string; readonly result: ComposeResultView };

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

const IDLE: Run = { kind: 'idle' };

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

/** The run as the shown tab sees it. */
export function composeStatusIn(run: Run, activeTabId: string | undefined): ComposeStatus {
  if (run.kind === 'idle') {
    return { kind: 'idle' };
  }
  const isBusy = run.kind === 'running' || run.kind === 'stopping' || run.kind === 'applying';
  if (run.tabId !== activeTabId) {
    return isBusy ? { kind: 'elsewhere' } : { kind: 'idle' };
  }
  switch (run.kind) {
    case 'running':
      return { kind: 'running', attempt: run.attempt, startedAt: run.startedAt };
    case 'applying':
      return { kind: 'running', attempt: 1, startedAt: run.startedAt };
    case 'stopping':
      return { kind: 'stopping' };
    case 'failed':
      return { kind: 'failed', message: run.message };
    case 'done':
      return { kind: 'done', result: run.result };
  }
}

const wait = (milliseconds: number) => new Promise<void>((resolve) => setTimeout(resolve, milliseconds));

function tabSong(workspace: WorkspaceState, tabId: string): Song | undefined {
  return workspace.tabs.find((tab) => tab.id === tabId)?.editor.document?.song;
}

/** What a finished run leads to: a failure, or the bars to dispatch and the result to show once they are written. */
type Finish =
  | { readonly kind: 'failed'; readonly message: string }
  | { readonly kind: 'apply'; readonly action: WorkspaceAction; readonly basis: Song; readonly written: Song; readonly result: ComposeResultView };

/** A run's answer against the score of its tab now: nothing written, a changed score, or the bars to write. */
function finishRun(workspace: WorkspaceState, tabId: string, song: Song, idea: ComposeIdea, result: ComposeRunResult): Finish {
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
}

/** The run in flight: its number, and whether it was stopped (its answer still coming, never written). */
interface Flight {
  readonly id: number;
  readonly isStopped: boolean;
}

/**
 * Edit ▸ AI Wizard ▸ Compose from Here… (and the palette's AI Compose): the panel's draft and one run of runCompose at a
 * time, on the shown score. The bars go into the tab the run began in — only if its score is still the one Claude read —
 * as one editor action (one undo step); `done` once the editor has written them. A stopped run's answer still comes:
 * no other run starts before it has.
 */
export function useCompose({ workspace, dispatch }: ComposeSources): Compose {
  const [isOpen, setIsOpen] = useState(false);
  const [draft, setDraft] = useState<ComposeDraft>(INITIAL_COMPOSE_DRAFT);
  const [run, setRun] = useState<Run>(IDLE);
  const latest = useRef(workspace);
  latest.current = workspace;
  const flight = useRef<Flight | undefined>(undefined);
  const nextId = useRef(0);

  // The editor wrote the bars (the tab holds the written song), or refused them (the score had changed).
  useEffect(() => {
    if (run.kind !== 'applying') {
      return;
    }
    const song = tabSong(workspace, run.tabId);
    if (song === run.written) {
      setRun({ kind: 'done', tabId: run.tabId, result: run.result });
    } else if (song !== run.basis) {
      setRun({ kind: 'failed', tabId: run.tabId, message: t('tools.compose.changed') });
    }
  }, [run, workspace]);

  const settle = useCallback(
    (id: number, tabId: string, startedAt: number, finish: () => Finish) => {
      const current = flight.current;
      if (current?.id !== id) {
        return;
      }
      flight.current = undefined;
      if (current.isStopped) {
        setRun({ kind: 'failed', tabId, message: t('tools.compose.cancelled') });
        return;
      }
      const finished = finish();
      if (finished.kind === 'failed') {
        setRun({ kind: 'failed', tabId, message: finished.message });
        return;
      }
      dispatch(finished.action);
      setRun({ kind: 'applying', tabId, basis: finished.basis, written: finished.written, result: finished.result, startedAt });
    },
    [dispatch],
  );

  const compose = useCallback(
    (model: string) => {
      const tabId = latest.current.activeTabId;
      const editor = activeEditor(latest.current);
      const song = editor.document?.song;
      if (flight.current !== undefined || run.kind === 'applying' || song === undefined || tabId === undefined) {
        return;
      }
      const idea = composeIdeaOf(draft, song, editor.cursor?.trackIndex ?? editor.trackIndex);
      nextId.current += 1;
      const id = nextId.current;
      flight.current = { id, isStopped: false };
      const startedAt = Date.now();
      const isCancelled = () => flight.current?.id !== id || flight.current.isStopped;
      setRun({ kind: 'running', tabId, attempt: 1, startedAt });
      const onStep = (attempt: number) => setRun((current) => (current.kind === 'running' && flight.current?.id === id ? { ...current, attempt } : current));
      runCompose(song, idea, model, { send: sendMessages, wait, isCancelled }, (step) => onStep(step.attempt))
        .then((result) => settle(id, tabId, startedAt, () => finishRun(latest.current, tabId, song, idea, result)))
        .catch((error: unknown) => settle(id, tabId, startedAt, () => ({ kind: 'failed', message: errorMessage(error) })));
    },
    [draft, run.kind, settle],
  );

  const cancel = useCallback(() => {
    const current = flight.current;
    if (current === undefined || current.isStopped) {
      return;
    }
    flight.current = { ...current, isStopped: true };
    setRun((state) => (state.kind === 'running' ? { kind: 'stopping', tabId: state.tabId } : state));
  }, []);

  const open = useCallback(() => {
    const cursorBar = (activeEditor(latest.current).cursor?.measureIndex ?? 0) + 1;
    setDraft((current) => ({ ...current, startBar: cursorBar }));
    setRun((current) => (current.kind === 'failed' || current.kind === 'done' ? IDLE : current));
    setIsOpen(true);
  }, []);

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
    status: composeStatusIn(run, workspace.activeTabId),
    compose,
    cancel,
  };
}
