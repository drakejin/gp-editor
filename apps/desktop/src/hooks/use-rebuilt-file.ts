import { type Dispatch, type RefObject, useCallback, useState } from 'react';
import { type OpenedFile, readFile } from '../native/gp-files';
import { type OpenDocument, isEdited } from '../state/editor';
import { type WorkspaceAction, type WorkspaceState, tabTitle } from '../state/workspace';
import type { OpenResult } from './use-document';

/** An edited tab whose file was rebuilt on disk (a resumed PDF import), waiting for Show Rebuilt Song / Keep My Changes. */
export interface RebuiltQuestion {
  readonly tabId: string;
  /** What the question calls it: the tab's title. */
  readonly name: string;
}

/** A file rebuilt on disk, shown in the tab that holds it (asking first when that tab is edited). */
export interface RebuiltFile {
  /** Reads the rebuilt file: the tab holding it shows it afresh (a new tab when none does); an edited one asks first. */
  readonly openRebuilt: (path: string) => Promise<OpenResult>;
  /** The question over the window while an edited tab's file was rebuilt. */
  readonly rebuilt?: RebuiltQuestion;
  /** Show Rebuilt Song: the tab shows the rebuilt song, its changes lost. */
  readonly showRebuilt: () => void;
  /** Keep My Changes (also Esc): the tab stays as it is; false when no question was open, so Esc goes on. */
  readonly keepEdited: () => boolean;
}

/** How a file is read into the window (useDocument's open), handing the song to `deliver`. */
type OpenWith = (load: () => Promise<OpenedFile | null>, recentPath: undefined, deliver: (document: OpenDocument) => void) => Promise<OpenResult>;

interface Pending {
  readonly question: RebuiltQuestion;
  readonly document: OpenDocument;
}

/**
 * A PDF import that finished (or resumed) rebuilds its .gp5: a tab still showing the old one would save it over the
 * complete file. The tab is reloaded at once when it has no changes, else the user chooses.
 */
export function useRebuiltFile(latest: RefObject<WorkspaceState>, dispatch: Dispatch<WorkspaceAction>, open: OpenWith): RebuiltFile {
  const [pending, setPending] = useState<Pending | undefined>(undefined);
  const deliver = useCallback(
    (document: OpenDocument) => {
      const holding = latest.current.tabs.find((tab) => tab.editor.document?.path === document.path);
      if (holding?.editor.document === undefined || !isEdited(holding.editor)) {
        dispatch({ type: 'reloadTab', document });
        return;
      }
      dispatch({ type: 'loadCancelled' });
      setPending({ question: { tabId: holding.id, name: tabTitle(holding.editor.document) }, document });
    },
    [latest, dispatch],
  );
  const openRebuilt = useCallback((path: string) => open(() => readFile(path), undefined, deliver), [open, deliver]);
  const showRebuilt = useCallback(() => {
    if (pending !== undefined) {
      setPending(undefined);
      dispatch({ type: 'reloadTab', document: pending.document });
    }
  }, [pending, dispatch]);
  const keepEdited = useCallback(() => {
    setPending(undefined);
    return pending !== undefined;
  }, [pending]);
  return { openRebuilt, rebuilt: pending?.question, showRebuilt, keepEdited };
}
