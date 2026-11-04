import { type Dispatch, type RefObject, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { Song } from '@gp-editor/core';
import { newSessionId } from '../autosave/autosave-days';
import type { AutosaveSession, AutosaveStatus } from '../autosave/autosave-manifest';
import type { AutosaveEntry } from '../autosave/autosave-recovery';
import { AUTOSAVE_IDLE_MS, AUTOSAVE_INTERVAL_MS, nextAutosaveStep } from '../autosave/autosave-schedule';
import { EMPTY_TRACKER, adopt, endMarks, marksDue, trackTabs } from '../autosave/autosave-tracker';
import { type AutosaveContext, dueTabs, rewriteManifest, writeMarks, writeTabSnapshot } from '../autosave/autosave-writes';
import { type SerialQueue, createSerialQueue } from '../autosave/serial-queue';
import { errorMessage } from '../lib/errors';
import { t } from '../lib/i18n/i18n';
import { isAutosaveAvailable, processId } from '../native/autosave';
import type { WorkspaceAction, WorkspaceState } from '../state/workspace';

/** The quit waits at most this long for the session's last marks. */
const END_SESSION_TIMEOUT_MS = 3_000;

/** Autosave of the open tabs (macOS; nothing on Windows yet). */
export interface Autosave {
  /** This run of the app: its snapshots are live work, never offered back while it runs. */
  readonly sessionId: string;
  /** Every edited tab answered and the app quitting: each snapshot marked as its tab was answered; nothing written after. */
  readonly endSession: () => Promise<void>;
  /** Restored work (`song` about to show in a tab): its snapshot becomes this session's, and that tab's marks answer for it. */
  readonly adoptRestored: (song: Song, entry: AutosaveEntry) => void;
  /** Snapshots answered otherwise (Don't Restore: `declined`; older days' of restored work: `restored`). */
  readonly markEntries: (entries: readonly AutosaveEntry[], status: AutosaveStatus) => Promise<void>;
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** The session (its process id known once the first task ran) and what the writes read and change. */
function useAutosaveContext(workspace: WorkspaceState): AutosaveContext & { readonly setProcessId: (pid: number) => void } {
  const [sessionId] = useState(() => newSessionId(new Date()));
  const session = useRef<AutosaveSession>({ id: sessionId, pid: 1 });
  const latest = useRef(workspace);
  latest.current = workspace;
  const tracker = useRef(EMPTY_TRACKER);
  return useMemo(
    () => ({
      session: () => session.current,
      setProcessId: (pid: number) => {
        if (pid > 0) {
          session.current = { id: sessionId, pid };
        }
      },
      workspace: () => latest.current,
      tracker: () => tracker.current,
      setTracker: (next) => {
        tracker.current = next;
      },
    }),
    [sessionId],
  );
}

/** The writes' failures: the hint strip says the first of a run of them (none again until one succeeds). */
function useFailureHint(dispatch: Dispatch<WorkspaceAction>): (task: Promise<void>) => Promise<void> {
  const isReported = useRef(false);
  return useCallback(
    (task: Promise<void>) =>
      task.then(
        () => {
          isReported.current = false;
        },
        (error: unknown) => {
          if (!isReported.current) {
            isReported.current = true;
            dispatch({ type: 'showHint', hint: t('window.autosave.writeFailed', { message: errorMessage(error, t('window.autosave.unknownError')) }) });
          }
        },
      ),
    [dispatch],
  );
}

interface SchedulerRefs {
  readonly context: AutosaveContext;
  readonly queue: SerialQueue;
  readonly isEnded: RefObject<boolean>;
  readonly lastActivity: RefObject<number>;
  readonly isPlaying: RefObject<boolean>;
  readonly reportFailure: (task: Promise<void>) => Promise<void>;
}

/** Every AUTOSAVE_INTERVAL_MS, the due tabs' snapshots, one at a time, each once the editing pauses (autosave-schedule.ts). */
function useScheduler({ context, queue, isEnded, lastActivity, isPlaying, reportFailure }: SchedulerRefs): void {
  useEffect(() => {
    if (!isAutosaveAvailable()) {
      return undefined;
    }
    let timer: ReturnType<typeof setTimeout> | undefined;
    let dueSince: number | undefined;
    let isStopped = false;
    const tick = (): void => {
      const due = isEnded.current ? [] : dueTabs(context);
      const tabId = due[0];
      if (tabId === undefined) {
        dueSince = undefined;
        timer = setTimeout(tick, AUTOSAVE_INTERVAL_MS);
        return;
      }
      const now = Date.now();
      dueSince = dueSince ?? now;
      const step = nextAutosaveStep({ now, dueSince, lastActivityAt: lastActivity.current, isPlaying: isPlaying.current });
      if (step.kind === 'wait') {
        timer = setTimeout(tick, step.ms);
        return;
      }
      // The next due tab waits for another pause; a tab done, the next round starts AUTOSAVE_INTERVAL_MS later.
      void reportFailure(queue.run(() => writeTabSnapshot(context, tabId))).then(() => {
        const isRoundDone = due.length <= 1;
        dueSince = isRoundDone ? undefined : dueSince;
        timer = isStopped ? undefined : setTimeout(tick, isRoundDone ? AUTOSAVE_INTERVAL_MS : AUTOSAVE_IDLE_MS);
      });
    };
    timer = setTimeout(tick, AUTOSAVE_INTERVAL_MS);
    return () => {
      isStopped = true;
      if (timer !== undefined) {
        clearTimeout(timer);
      }
    };
  }, [context, queue, isEnded, lastActivity, isPlaying, reportFailure]);
}

/**
 * Every 30 s, each edited tab whose song changed since its last snapshot is written to Application Support/GPEditor/
 * Autosave/<day>/<document>/ (GPAutosave.m) once the editing pauses; a tab saved or undone back to its file marks its
 * snapshot `saved`, one closed with Don't Save `discarded`, and the quit's answers (`endSession`) mark the rest.
 */
export function useAutosave(workspace: WorkspaceState, dispatch: Dispatch<WorkspaceAction>, isPlaying: boolean): Autosave {
  const context = useAutosaveContext(workspace);
  const [queue] = useState(createSerialQueue);
  const isEnded = useRef(false);
  const lastActivity = useRef(Date.now());
  const playing = useRef(isPlaying);
  playing.current = isPlaying;
  const reportFailure = useFailureHint(dispatch);
  useEffect(() => {
    if (isAutosaveAvailable()) {
      void queue.run(async () => context.setProcessId(await processId()));
    }
  }, [queue, context]);
  useEffect(() => {
    lastActivity.current = Date.now();
    const tracker = trackTabs(context.tracker(), workspace, context.session().id);
    context.setTracker(tracker);
    if (marksDue(tracker, workspace).length > 0) {
      void queue.run(() => writeMarks(context, marksDue(context.tracker(), context.workspace())));
    }
  }, [workspace, context, queue]);
  useScheduler({ context, queue, isEnded, lastActivity, isPlaying: playing, reportFailure });
  return useAutosaveActions(context, queue, isEnded);
}

function useAutosaveActions(context: AutosaveContext, queue: SerialQueue, isEnded: RefObject<boolean>): Autosave {
  const endSession = useCallback((): Promise<void> => {
    if (!isAutosaveAvailable()) {
      return Promise.resolve();
    }
    isEnded.current = true;
    const ended = queue.run(() => {
      const tracker = trackTabs(context.tracker(), context.workspace(), context.session().id);
      return writeMarks(context, endMarks(tracker, context.workspace()));
    });
    return Promise.race([ended.catch(() => undefined), delay(END_SESSION_TIMEOUT_MS)]);
  }, [context, queue, isEnded]);
  const adoptRestored = useCallback(
    (song: Song, entry: AutosaveEntry) => {
      context.setTracker(adopt(context.tracker(), song, entry));
      void queue.run(() => rewriteManifest(entry, { status: 'unsaved', session: context.session() }));
    },
    [context, queue],
  );
  const markEntries = useCallback(
    (entries: readonly AutosaveEntry[], status: AutosaveStatus) =>
      queue.run(async () => {
        for (const entry of entries) {
          await rewriteManifest(entry, { status });
        }
      }),
    [queue],
  );
  return useMemo(() => ({ sessionId: context.session().id, endSession, adoptRestored, markEntries }), [context, endSession, adoptRestored, markEntries]);
}
