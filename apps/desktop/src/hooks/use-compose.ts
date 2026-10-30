import { type Dispatch, useCallback, useRef, useState } from 'react';
import {
  MAX_COMPOSED_BARS,
  type Song,
  applyComposedBars,
} from '@gp-editor/core';
import type { ComposeIdea, ComposeTracks } from '../compose/request';
import { runCompose } from '../compose/run-compose';
import type { ScoreText } from '../compose/score-text';
import { composeSummary } from '../compose/summary';
import { t } from '../lib/i18n/i18n';
import type { TokenUsage } from '../lib/tool-answer';
import { sendMessages } from '../native/anthropic';
import type { EditorState } from '../state/editor';
import {
  type WorkspaceAction,
  type WorkspaceState,
  activeEditor,
} from '../state/workspace';

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

export const INITIAL_COMPOSE_DRAFT: ComposeDraft = {
  startBar: 1,
  scope: 'track',
  prompt: '',
  allowsNewTracks: true,
  isLimited: false,
  barLimit: 8,
};

/** What was written, for the panel's result. */
export interface ComposeResultView {
  readonly summary: string;
  /** What Claude read of the score: all of it, or which bars note for note. */
  readonly reading: string;
  readonly warnings: readonly string[];
  readonly usage: TokenUsage;
}

export type ComposeStatus =
  | { readonly kind: 'idle' }
  /** `startedAt`: Date.now() when the run began, for the elapsed seconds. */
  | {
      readonly kind: 'running';
      readonly attempt: number;
      readonly startedAt: number;
    }
  | { readonly kind: 'failed'; readonly message: string }
  | { readonly kind: 'done'; readonly result: ComposeResultView };

export interface Compose {
  readonly isOpen: boolean;
  /** Opens the panel with the start bar at the cursor's bar. */
  readonly open: () => void;
  /** Closes the panel; a run going on is stopped. */
  readonly close: () => void;
  readonly draft: ComposeDraft;
  readonly changeDraft: (change: Partial<ComposeDraft>) => void;
  readonly status: ComposeStatus;
  /** Asks `model` for the bars and writes them into the shown score as one undo step. */
  readonly compose: (model: string) => void;
  readonly cancel: () => void;
}

const IDLE: ComposeStatus = { kind: 'idle' };

/** The request a draft makes for `song`: the start within the bars and one after, the bar limit within the tool's. */
export function composeIdeaOf(
  draft: ComposeDraft,
  song: Song,
  trackIndex: number,
): ComposeIdea {
  const startIndex = Math.max(
    0,
    Math.min(Math.round(draft.startBar) - 1, song.measureHeaders.length),
  );
  const maxBars = draft.isLimited
    ? Math.max(1, Math.min(Math.round(draft.barLimit), MAX_COMPOSED_BARS))
    : undefined;
  return {
    prompt: draft.prompt,
    startIndex,
    scope: draft.scope,
    trackIndex,
    allowsNewTracks: draft.allowsNewTracks,
    ...(maxBars === undefined ? {} : { maxBars }),
  };
}

/** "Claude read all 224 bars" or "Claude read bars 75–131 note for note, the rest summarised". */
export function readingText(score: ScoreText, barCount: number): string {
  return score.isSummarized
    ? t('tools.compose.scorePart', {
        first: score.detailFirst + 1,
        last: score.detailLast + 1,
      })
    : t('tools.compose.scoreWhole', {
        bars: t('common.bars', { count: barCount }),
      });
}

const wait = (milliseconds: number) =>
  new Promise<void>(resolve => setTimeout(resolve, milliseconds));

function tabSong(workspace: WorkspaceState, tabId: string): Song | undefined {
  return workspace.tabs.find(tab => tab.id === tabId)?.editor.document?.song;
}

interface ComposeSources {
  readonly workspace: WorkspaceState;
  readonly dispatch: Dispatch<WorkspaceAction>;
}

/**
 * Edit ▸ AI Wizard ▸ Compose from Here… (and the palette's AI Compose): the panel's draft and a run of runCompose on the
 * shown score. The bars go into the tab the run began in — only if its score is still the one Claude read — as one
 * editor action (one undo step); the panel stays open with what was written.
 */
export function useCompose({ workspace, dispatch }: ComposeSources): Compose {
  const [isOpen, setIsOpen] = useState(false);
  const [draft, setDraft] = useState<ComposeDraft>(INITIAL_COMPOSE_DRAFT);
  const [status, setStatus] = useState<ComposeStatus>(IDLE);
  const latest = useRef(workspace);
  latest.current = workspace;
  // Each run's number; cancelling or another run moves it on, so a late answer is dropped.
  const run = useRef(0);
  const isRunning = status.kind === 'running';

  const finish = useCallback(
    (
      tabId: string,
      song: Song,
      idea: ComposeIdea,
      result: Awaited<ReturnType<typeof runCompose>>,
    ) => {
      if (!result.isOk) {
        setStatus({ kind: 'failed', message: result.message });
        return;
      }
      if (tabSong(latest.current, tabId) !== song) {
        setStatus({ kind: 'failed', message: t('tools.compose.changed') });
        return;
      }
      dispatch({
        type: 'inTab',
        tabId,
        action: {
          type: 'applyComposedBars',
          basis: song,
          composed: result.composed,
          startIndex: idea.startIndex,
        },
      });
      const outcome = applyComposedBars(song, result.composed, idea.startIndex);
      const summary = composeSummary(
        outcome,
        Math.min(idea.startIndex, song.measureHeaders.length),
      );
      setStatus({
        kind: 'done',
        result: {
          summary,
          reading: readingText(result.score, song.measureHeaders.length),
          warnings: outcome.warnings,
          usage: result.usage,
        },
      });
    },
    [dispatch],
  );

  const compose = useCallback(
    (model: string) => {
      const tabId = latest.current.activeTabId;
      const editor: EditorState = activeEditor(latest.current);
      const song = editor.document?.song;
      if (isRunning || song === undefined || tabId === undefined) {
        return;
      }
      const idea = composeIdeaOf(
        draft,
        song,
        editor.cursor?.trackIndex ?? editor.trackIndex,
      );
      run.current += 1;
      const id = run.current;
      const deps = {
        send: sendMessages,
        wait,
        isCancelled: () => run.current !== id,
      };
      setStatus({ kind: 'running', attempt: 1, startedAt: Date.now() });
      void runCompose(song, idea, model, deps, step =>
        setStatus(current =>
          current.kind === 'running' && run.current === id
            ? { ...current, attempt: step.attempt }
            : current,
        ),
      ).then(result => run.current === id && finish(tabId, song, idea, result));
    },
    [draft, finish, isRunning],
  );

  const cancel = useCallback(() => {
    run.current += 1;
    setStatus(current =>
      current.kind === 'running'
        ? { kind: 'failed', message: t('tools.compose.cancelled') }
        : current,
    );
  }, []);

  const open = useCallback(() => {
    const cursorBar =
      (activeEditor(latest.current).cursor?.measureIndex ?? 0) + 1;
    setDraft(current => ({ ...current, startBar: cursorBar }));
    setStatus(current => (current.kind === 'running' ? current : IDLE));
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
    changeDraft: useCallback(
      (change: Partial<ComposeDraft>) =>
        setDraft(current => ({ ...current, ...change })),
      [],
    ),
    status,
    compose,
    cancel,
  };
}
