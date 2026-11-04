import { type Dispatch, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { readSongFile } from '@gp-editor/core';
import { oldestKeptDay } from '../autosave/autosave-days';
import type { AutosaveSession } from '../autosave/autosave-manifest';
import { type AutosaveEntry, type AutosavedWork, type IsRunning, keptWork, parseEntries, recoverableWork } from '../autosave/autosave-recovery';
import { withLoadedAudio } from '../lib/audio-track-files';
import { base64ToBytes } from '../lib/base64';
import { errorMessage } from '../lib/errors';
import { t } from '../lib/i18n/i18n';
import { currentSession, isAutosaveAvailable, listSnapshots, readSnapshot, removeDaysBefore, revealAutosaveFolder, runningProcesses } from '../native/autosave';
import type { WorkspaceAction } from '../state/workspace';
import type { Autosave } from './use-autosave';

/** `launch`: the question after a session ended with unsaved work; `list`: File ▸ Recover Autosaved Work…. */
export type RecoveryMode = 'launch' | 'list';

/** The panel over the window and the work it lists, the newest first. */
export interface RecoveryPanel {
  readonly mode: RecoveryMode;
  readonly works: readonly AutosavedWork[];
  /** Why the work could not be listed. */
  readonly error?: string;
}

export interface AutosaveRecovery {
  readonly panel?: RecoveryPanel;
  /** File ▸ Recover Autosaved Work…: the work kept, to restore one at a time. */
  readonly openList: () => void;
  /** Restore: every document the panel lists, each in a tab (the newest shown last). */
  readonly restoreAll: () => void;
  /** One document of the list, in a tab; the list goes on without it. */
  readonly restore: (documentId: string) => void;
  /** Don't Restore: the snapshots stay (the list shows them) and are not asked about again. */
  readonly decline: () => void;
  /** Esc, a click outside, Close: nothing answered (asked again at the next launch); false when it was not open. */
  readonly close: () => boolean;
  /** The autosave folder in Finder. */
  readonly showFolder: () => void;
}

/**
 * The snapshots on disk and which of their sessions still run: one of another boot does not (a power cut, a restart —
 * whatever process has its id now), one of this boot while its process does.
 */
async function readWork(): Promise<{ readonly entries: readonly AutosaveEntry[]; readonly isRunning: IsRunning }> {
  const entries = parseEntries(await listSnapshots());
  const { bootId } = await currentSession();
  const isThisBoot = (session: AutosaveSession) => session.bootId === undefined || session.bootId === bootId;
  const pids = [...new Set(entries.map((entry) => entry.manifest.session).filter(isThisBoot).map((session) => session.pid))];
  const running = await runningProcesses(pids);
  const runningPids = new Set(pids.filter((_, index) => running[index] === true));
  return { entries, isRunning: (session) => isThisBoot(session) && runningPids.has(session.pid) };
}

/** Reads a document's newest snapshot back and opens it in a tab, edited; its snapshots answer for the tab from now on. */
async function restoreWork(work: AutosavedWork, autosave: Autosave, dispatch: Dispatch<WorkspaceAction>): Promise<void> {
  const { newest } = work;
  try {
    const bytes = base64ToBytes(await readSnapshot(newest.folder));
    const { song, hint } = await withLoadedAudio(readSongFile(bytes));
    autosave.adoptRestored(song, newest);
    void autosave.markEntries(
      work.entries.filter((entry) => entry !== newest),
      'restored',
    );
    dispatch({ type: 'restoreTab', document: { fileName: newest.manifest.fileName, path: newest.manifest.path, song } });
    if (hint !== undefined) {
      dispatch({ type: 'showHint', hint });
    }
  } catch (error: unknown) {
    dispatch({ type: 'loadFailed', message: `${newest.manifest.title}: ${errorMessage(error, t('window.error.openUnexpected'))}` });
  }
}

/**
 * The work autosave kept: at launch, after removing the days kept long enough, the question about the unsaved work
 * sessions that are over left (a crash, a force quit, a power cut); File ▸ Recover Autosaved Work… lists it with the
 * work declined or let go.
 */
export function useAutosaveRecovery(dispatch: Dispatch<WorkspaceAction>, autosave: Autosave): AutosaveRecovery {
  const [panel, setPanel] = useState<RecoveryPanel | undefined>(undefined);
  const shown = useRef(panel);
  shown.current = panel;
  const { sessionId } = autosave;
  useEffect(() => {
    if (!isAutosaveAvailable()) {
      return;
    }
    void (async () => {
      // An old day that cannot be removed is tried again at the next launch; the work is still listed.
      await removeDaysBefore(oldestKeptDay(new Date())).catch(() => 0);
      const { entries, isRunning } = await readWork();
      const works = recoverableWork(entries, sessionId, isRunning);
      if (works.length > 0) {
        setPanel({ mode: 'launch', works });
      }
      // A list that cannot be read is not asked about at launch: File ▸ Recover Autosaved Work… reads it again and says why.
    })().catch(() => undefined);
  }, [sessionId]);
  const openList = useCallback(() => {
    if (!isAutosaveAvailable()) {
      setPanel({ mode: 'list', works: [] });
      return;
    }
    void readWork()
      .then(({ entries, isRunning }) => setPanel({ mode: 'list', works: keptWork(entries, sessionId, isRunning) }))
      .catch((error: unknown) => setPanel({ mode: 'list', works: [], error: t('window.recover.listFailed', { message: errorMessage(error, t('window.autosave.unknownError')) }) }));
  }, [sessionId]);
  const answers = useAnswers(shown, setPanel, autosave, dispatch);
  return useMemo(() => ({ panel, openList, ...answers }), [panel, openList, answers]);
}

type Answers = Omit<AutosaveRecovery, 'panel' | 'openList'>;

function useAnswers(
  shown: { readonly current: RecoveryPanel | undefined },
  setPanel: (panel: RecoveryPanel | undefined) => void,
  autosave: Autosave,
  dispatch: Dispatch<WorkspaceAction>,
): Answers {
  const restoreAll = useCallback(() => {
    const works = shown.current?.works ?? [];
    setPanel(undefined);
    void (async () => {
      for (const work of [...works].reverse()) {
        await restoreWork(work, autosave, dispatch);
      }
    })();
  }, [shown, setPanel, autosave, dispatch]);
  const restore = useCallback(
    (documentId: string) => {
      const current = shown.current;
      const work = current?.works.find((each) => each.documentId === documentId);
      if (current === undefined || work === undefined) {
        return;
      }
      setPanel({ ...current, works: current.works.filter((each) => each !== work) });
      void restoreWork(work, autosave, dispatch);
    },
    [shown, setPanel, autosave, dispatch],
  );
  const decline = useCallback(() => {
    const works = shown.current?.works ?? [];
    setPanel(undefined);
    void autosave.markEntries(
      works.flatMap((work) => work.entries),
      'declined',
    );
  }, [shown, setPanel, autosave]);
  const close = useCallback(() => {
    const wasOpen = shown.current !== undefined;
    setPanel(undefined);
    return wasOpen;
  }, [shown, setPanel]);
  const showFolder = useCallback(() => {
    revealAutosaveFolder().catch((error: unknown) => dispatch({ type: 'showHint', hint: t('window.recover.folderFailed', { message: errorMessage(error, t('window.autosave.unknownError')) }) }));
  }, [dispatch]);
  return useMemo(() => ({ restoreAll, restore, decline, close, showFolder }), [restoreAll, restore, decline, close, showFolder]);
}
