import { type Dispatch, useCallback, useEffect, useRef, useState } from 'react';
import type { Song } from '@gp-editor/core';
import { errorMessage } from '../lib/errors';
import type { EditorState } from '../state/editor';
import { type WorkspaceAction, type WorkspaceState, activeEditor } from '../state/workspace';

/** Which request of a run Claude is answering: the n-th of `count` (a long scope is asked for in parts). */
export interface RunPart {
  readonly index: number;
  readonly count: number;
}

/** A run's progress line: the attempt (1–3) at the request Claude is answering, and which part when there are several. */
export interface RunProgress {
  readonly attempt: number;
  readonly part?: RunPart;
}

/** What an AI Wizard panel shows for the shown tab: a run started in another tab is `elsewhere` there. */
export type TabRunStatus<R> =
  | { readonly kind: 'idle' }
  /** `startedAt`: Date.now() when the run began, for the elapsed seconds. */
  | ({ readonly kind: 'running'; readonly startedAt: number } & RunProgress)
  /** Stopped: the answer already asked for is still coming (and costs its tokens); nothing will be written. */
  | { readonly kind: 'stopping' }
  /** Claude is working for another tab. */
  | { readonly kind: 'elsewhere' }
  | { readonly kind: 'failed'; readonly message: string }
  | { readonly kind: 'done'; readonly result: R };

/** What a finished run leads to: a failure, or the edit to dispatch and the result to show once it is written. */
export type RunFinish<R> =
  | { readonly kind: 'failed'; readonly message: string }
  | { readonly kind: 'apply'; readonly action: WorkspaceAction; readonly basis: Song; readonly written: Song; readonly result: R };

/** What a run's task works from: the tab it began in, its editor and song then, and whether it was stopped since. */
export interface RunContext {
  readonly tabId: string;
  readonly editor: EditorState;
  readonly song: Song;
  readonly isCancelled: () => boolean;
  readonly onProgress: (progress: RunProgress) => void;
}

/** A run's work: its answer, then — against the workspace as it is when the answer comes — what to do with it. */
export type RunTask<R> = (context: RunContext) => Promise<(workspace: WorkspaceState) => RunFinish<R>>;

/** The run's wording, in the shown language: stopped, and the score changed while Claude worked. */
export interface RunWording {
  readonly cancelled: () => string;
  readonly changed: () => string;
}

/** A run and the tab it was started in. */
type Run<R> =
  | { readonly kind: 'idle' }
  | ({ readonly kind: 'running'; readonly tabId: string; readonly startedAt: number } & RunProgress)
  | { readonly kind: 'stopping'; readonly tabId: string }
  /** The edit is dispatched; `written` is the song the tab holds once the editor wrote it. */
  | { readonly kind: 'applying'; readonly tabId: string; readonly basis: Song; readonly written: Song; readonly result: R; readonly startedAt: number }
  | { readonly kind: 'failed'; readonly tabId: string; readonly message: string }
  | { readonly kind: 'done'; readonly tabId: string; readonly result: R };

export interface TabRun<R> {
  /** For the shown tab. */
  readonly status: TabRunStatus<R>;
  /** Runs `task` on the shown tab's score unless a run (or a stopped run's answer) is under way. */
  readonly start: (task: RunTask<R>) => void;
  readonly cancel: () => void;
  /** Forgets a run that failed or is done (its panel opened again). */
  readonly reset: () => void;
}

const IDLE = { kind: 'idle' } as const;

/** A real pause, for a run's retries (ClaudeDeps.wait). */
export const wait = (milliseconds: number): Promise<void> => new Promise<void>((resolve) => setTimeout(resolve, milliseconds));

/** The run as the shown tab sees it. */
export function runStatusIn<R>(run: Run<R>, activeTabId: string | undefined): TabRunStatus<R> {
  if (run.kind === 'idle') {
    return IDLE;
  }
  const isBusy = run.kind === 'running' || run.kind === 'stopping' || run.kind === 'applying';
  if (run.tabId !== activeTabId) {
    return isBusy ? { kind: 'elsewhere' } : IDLE;
  }
  switch (run.kind) {
    case 'running':
      return { kind: 'running', attempt: run.attempt, startedAt: run.startedAt, ...(run.part === undefined ? {} : { part: run.part }) };
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

/** The song a tab holds now. */
export function tabSong(workspace: WorkspaceState, tabId: string): Song | undefined {
  return workspace.tabs.find((tab) => tab.id === tabId)?.editor.document?.song;
}

/** The run in flight: its number, and whether it was stopped (its answer still coming, never written). */
interface Flight {
  readonly id: number;
  readonly isStopped: boolean;
}

/**
 * One AI Wizard run at a time on the shown score (Compose from Here, AI Edit): the run's status per tab, Stop, and the
 * edit dispatched to the tab the run began in — the task decides, against that tab's score when the answer comes,
 * whether there is one (one undo step) —; `done` once the editor has written it. A stopped run's answer still comes:
 * no other run starts before it has.
 */
export function useTabRun<R>(workspace: WorkspaceState, dispatch: Dispatch<WorkspaceAction>, wording: RunWording): TabRun<R> {
  const [run, setRun] = useState<Run<R>>(IDLE);
  const latest = useRef(workspace);
  latest.current = workspace;
  const flight = useRef<Flight | undefined>(undefined);
  const nextId = useRef(0);

  // The editor wrote the edit (the tab holds the written song), or refused it (the score had changed).
  useEffect(() => {
    if (run.kind !== 'applying') {
      return;
    }
    const song = tabSong(workspace, run.tabId);
    if (song === run.written) {
      setRun({ kind: 'done', tabId: run.tabId, result: run.result });
    } else if (song !== run.basis) {
      setRun({ kind: 'failed', tabId: run.tabId, message: wording.changed() });
    }
  }, [run, workspace, wording]);

  const settle = useCallback(
    (id: number, tabId: string, startedAt: number, finish: () => RunFinish<R>) => {
      const current = flight.current;
      if (current?.id !== id) {
        return;
      }
      flight.current = undefined;
      if (current.isStopped) {
        setRun({ kind: 'failed', tabId, message: wording.cancelled() });
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
    [dispatch, wording],
  );

  const start = useCallback(
    (task: RunTask<R>) => {
      const tabId = latest.current.activeTabId;
      const editor = activeEditor(latest.current);
      const song = editor.document?.song;
      if (flight.current !== undefined || run.kind === 'applying' || song === undefined || tabId === undefined) {
        return;
      }
      nextId.current += 1;
      const id = nextId.current;
      flight.current = { id, isStopped: false };
      const startedAt = Date.now();
      const isCancelled = () => flight.current?.id !== id || flight.current.isStopped;
      setRun({ kind: 'running', tabId, attempt: 1, startedAt });
      const onProgress = (progress: RunProgress) =>
        setRun((current) => (current.kind === 'running' && flight.current?.id === id ? { kind: 'running', tabId: current.tabId, startedAt: current.startedAt, ...progress } : current));
      task({ tabId, editor, song, isCancelled, onProgress })
        .then((finish) => settle(id, tabId, startedAt, () => finish(latest.current)))
        .catch((error: unknown) => settle(id, tabId, startedAt, () => ({ kind: 'failed', message: errorMessage(error) })));
    },
    [run.kind, settle],
  );

  const cancel = useCallback(() => {
    const current = flight.current;
    if (current === undefined || current.isStopped) {
      return;
    }
    flight.current = { ...current, isStopped: true };
    setRun((state) => (state.kind === 'running' ? { kind: 'stopping', tabId: state.tabId } : state));
  }, []);

  const reset = useCallback(() => setRun((current) => (current.kind === 'failed' || current.kind === 'done' ? IDLE : current)), []);

  return { status: runStatusIn(run, workspace.activeTabId), start, cancel, reset };
}
