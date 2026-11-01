import { type Dispatch, type MutableRefObject, type SetStateAction, useCallback, useEffect, useMemo, useRef, useState } from 'react';
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

/** What an AI Wizard panel shows for the shown tab: a run started in another tab — or by the other tool — is `elsewhere`. */
export type TabRunStatus<R> =
  | { readonly kind: 'idle' }
  /** `startedAt`: Date.now() when the run began, for the elapsed seconds. */
  | ({ readonly kind: 'running'; readonly startedAt: number } & RunProgress)
  /** Stopped: the answer already asked for is still coming (and costs its tokens); nothing will be written. */
  | { readonly kind: 'stopping' }
  /** Claude is working for another tab, or (`isOtherTool`) for the other AI Wizard panel. */
  | { readonly kind: 'elsewhere'; readonly isOtherTool?: true }
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

/** One Claude run at a time across the AI Wizard's panels (Compose from Here, AI Edit): who holds it now. */
export interface RunGuard {
  /** The tool whose run is under way (or still waiting for its stopped answer); undefined when none. */
  readonly holder?: string;
  /** Takes the guard for `owner`; false when another tool holds it. */
  readonly claim: (owner: string) => boolean;
  readonly release: (owner: string) => void;
}

/** The window's one guard: claimed at once (a ref), shown to every panel (state). */
export function useRunGuard(): RunGuard {
  const [holder, setHolder] = useState<string | undefined>(undefined);
  const held = useRef<string | undefined>(undefined);
  const claim = useCallback((owner: string) => {
    if (held.current !== undefined && held.current !== owner) {
      return false;
    }
    held.current = owner;
    setHolder(owner);
    return true;
  }, []);
  const release = useCallback((owner: string) => {
    if (held.current === owner) {
      held.current = undefined;
      setHolder(undefined);
    }
  }, []);
  return useMemo(() => ({ ...(holder === undefined ? {} : { holder }), claim, release }), [holder, claim, release]);
}

/** Which tool a run is (its guard's owner), and the guard it shares with the other AI Wizard panel. */
export interface TabRunOptions {
  readonly owner: string;
  readonly guard?: RunGuard;
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
  /** Runs `task` on the shown tab's score unless a run (or a stopped run's answer) is under way, here or in the other tool. */
  readonly start: (task: RunTask<R>) => void;
  readonly cancel: () => void;
  /** Forgets a run that failed or is done (its panel opened again). */
  readonly reset: () => void;
}

const IDLE = { kind: 'idle' } as const;

/** The song a tab holds now. */
export function tabSong(workspace: WorkspaceState, tabId: string): Song | undefined {
  return workspace.tabs.find((tab) => tab.id === tabId)?.editor.document?.song;
}

function isUnderWay<R>(run: Run<R>): boolean {
  return run.kind === 'running' || run.kind === 'stopping' || run.kind === 'applying';
}

/** The run as the shown tab sees it. */
export function runStatusIn<R>(run: Run<R>, activeTabId: string | undefined): TabRunStatus<R> {
  if (run.kind === 'idle') {
    return IDLE;
  }
  if (run.tabId !== activeTabId) {
    return isUnderWay(run) ? { kind: 'elsewhere' } : IDLE;
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

/** The run in flight: its number, and whether it was stopped (its answer still coming, never written). */
interface Flight {
  readonly id: number;
  readonly isStopped: boolean;
}

/** What the run's callbacks share: its state setter, the latest workspace, the flight, the wording, the dispatch. */
interface RunRefs<R> {
  readonly setRun: Dispatch<SetStateAction<Run<R>>>;
  readonly latest: MutableRefObject<WorkspaceState>;
  readonly flight: MutableRefObject<Flight | undefined>;
  readonly wording: RunWording;
  readonly dispatch: Dispatch<WorkspaceAction>;
}

/** The answer of flight `id` turned into the run's end: stopped, failed, or the edit dispatched. */
function settleRun<R>(refs: RunRefs<R>, id: number, tabId: string, startedAt: number, finish: () => RunFinish<R>): void {
  const current = refs.flight.current;
  if (current?.id !== id) {
    return;
  }
  refs.flight.current = undefined;
  if (current.isStopped) {
    refs.setRun({ kind: 'failed', tabId, message: refs.wording.cancelled() });
    return;
  }
  const finished = finish();
  if (finished.kind === 'failed') {
    refs.setRun({ kind: 'failed', tabId, message: finished.message });
    return;
  }
  refs.dispatch(finished.action);
  refs.setRun({ kind: 'applying', tabId, basis: finished.basis, written: finished.written, result: finished.result, startedAt });
}

/** Flight `id` started on the shown tab: the task run (a throw, even before its first await, fails the run). */
function launch<R>(refs: RunRefs<R>, id: number, task: RunTask<R>): void {
  const tabId = refs.latest.current.activeTabId as string;
  const editor = activeEditor(refs.latest.current);
  const song = editor.document?.song as Song;
  const startedAt = Date.now();
  const isCancelled = () => refs.flight.current?.id !== id || refs.flight.current.isStopped;
  refs.setRun({ kind: 'running', tabId, attempt: 1, startedAt });
  const onProgress = (progress: RunProgress) =>
    refs.setRun((current) => (current.kind === 'running' && refs.flight.current?.id === id ? { kind: 'running', tabId: current.tabId, startedAt: current.startedAt, ...progress } : current));
  let answer: ReturnType<RunTask<R>>;
  try {
    answer = task({ tabId, editor, song, isCancelled, onProgress });
  } catch (error: unknown) {
    answer = Promise.reject(error);
  }
  answer
    .then((finish) => settleRun(refs, id, tabId, startedAt, () => finish(refs.latest.current)))
    .catch((error: unknown) => settleRun(refs, id, tabId, startedAt, () => ({ kind: 'failed', message: errorMessage(error) })));
}

/** The editor wrote the edit (the tab holds the written song), or refused it (the score had changed). */
function useApplied<R>(run: Run<R>, workspace: WorkspaceState, setRun: RunRefs<R>['setRun'], wording: RunWording): void {
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
  }, [run, workspace, setRun, wording]);
}

/** The guard held while this tool's run is under way, given back when it is not. */
function useGuardRelease<R>(run: Run<R>, options: TabRunOptions): void {
  const { guard, owner } = options;
  const isBusy = isUnderWay(run);
  useEffect(() => {
    if (!isBusy) {
      guard?.release(owner);
    }
  }, [isBusy, guard, owner]);
}

/** The shown tab's status, `elsewhere` while the other tool holds the guard and this one has nothing under way. */
function shownStatus<R>(run: Run<R>, activeTabId: string | undefined, options: TabRunOptions): TabRunStatus<R> {
  const holder = options.guard?.holder;
  return holder !== undefined && holder !== options.owner && !isUnderWay(run) ? { kind: 'elsewhere', isOtherTool: true } : runStatusIn(run, activeTabId);
}

/**
 * One AI Wizard run at a time on the shown score (Compose from Here, AI Edit; with a shared guard, one across both): the
 * run's status per tab, Stop, and the edit dispatched to the tab the run began in — the task decides, against that
 * tab's score when the answer comes, whether there is one (one undo step) —; `done` once the editor has written it. A
 * stopped run's answer still comes: no other run starts before it has.
 */
export function useTabRun<R>(workspace: WorkspaceState, dispatch: Dispatch<WorkspaceAction>, wording: RunWording, options: TabRunOptions = { owner: 'run' }): TabRun<R> {
  const [run, setRun] = useState<Run<R>>(IDLE);
  const latest = useRef(workspace);
  latest.current = workspace;
  const flight = useRef<Flight | undefined>(undefined);
  const nextId = useRef(0);
  const refs = useMemo<RunRefs<R>>(() => ({ setRun, latest, flight, wording, dispatch }), [wording, dispatch]);
  useApplied(run, workspace, setRun, wording);
  useGuardRelease(run, options);
  const { guard, owner } = options;
  const start = useCallback(
    (task: RunTask<R>) => {
      const hasScore = latest.current.activeTabId !== undefined && activeEditor(latest.current).document !== undefined;
      if (flight.current !== undefined || run.kind === 'applying' || !hasScore || guard?.claim(owner) === false) {
        return;
      }
      nextId.current += 1;
      flight.current = { id: nextId.current, isStopped: false };
      launch(refs, nextId.current, task);
    },
    [run.kind, refs, guard, owner],
  );
  const cancel = useCallback(() => {
    const current = flight.current;
    if (current !== undefined && !current.isStopped) {
      flight.current = { ...current, isStopped: true };
      setRun((state) => (state.kind === 'running' ? { kind: 'stopping', tabId: state.tabId } : state));
    }
  }, []);
  const reset = useCallback(() => setRun((current) => (current.kind === 'failed' || current.kind === 'done' ? IDLE : current)), []);
  return { status: shownStatus(run, workspace.activeTabId, options), start, cancel, reset };
}
