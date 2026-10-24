import { type Dispatch, type RefObject, useCallback, useEffect, useRef, useState } from 'react';
import { subscribeTabRequests } from '../native/gp-files';
import { isEdited } from '../state/editor';
import { type TabLabel, type WorkspaceAction, type WorkspaceState, tabLabels, tabTitle } from '../state/workspace';

/** An edited tab waiting for Save / Don't Save / Cancel before it closes. */
export interface TabClosing {
  readonly tabId: string;
  /** What the question calls it: the tab's title. */
  readonly name: string;
}

/** The tab strip's clicks and File ▸ Close Tab / Next Tab / Previous Tab. */
export interface Tabs {
  /** The question shown over the window, when an edited tab is being closed. */
  readonly closing?: TabClosing;
  readonly switchTo: (tabId: string) => void;
  /** Closes a tab; an edited one asks first (`closing`). */
  readonly requestClose: (tabId: string) => void;
  /** Save: saves the tab (⌘S's way), then closes it; a cancelled save panel keeps it open. */
  readonly saveAndClose: () => void;
  /** Don't Save: closes the tab, its changes lost. */
  readonly discardAndClose: () => void;
  /** Cancel (also Esc): keeps the tab; false when no question was open, so Esc goes on to other overlays. */
  readonly cancelClose: () => boolean;
}

/** Switching and closing tabs; `saveTab` saves one tab and says whether it was saved (useDocument). */
export function useTabs(
  workspace: WorkspaceState,
  dispatch: Dispatch<WorkspaceAction>,
  saveTab: (tabId: string, saveAs: boolean) => Promise<boolean>,
): Tabs {
  const [closing, setClosing] = useState<TabClosing | undefined>(undefined);
  // The latest tabs, read through a ref so the menu listeners are not re-added on every edit.
  const latest = useRef(workspace);
  latest.current = workspace;

  const switchTo = useCallback((tabId: string) => dispatch({ type: 'switchTab', tabId }), [dispatch]);
  const requestClose = useCallback(
    (tabId: string) => {
      const editor = latest.current.tabs.find((tab) => tab.id === tabId)?.editor;
      if (editor?.document !== undefined && isEdited(editor)) {
        setClosing({ tabId, name: tabTitle(editor.document) });
      } else if (editor !== undefined) {
        dispatch({ type: 'closeTab', tabId });
      }
    },
    [dispatch],
  );
  useTabMenu(latest, requestClose, dispatch);

  const saveAndClose = useCallback(() => {
    if (closing !== undefined) {
      setClosing(undefined);
      void saveTab(closing.tabId, false).then((isSaved) => isSaved && dispatch({ type: 'closeTab', tabId: closing.tabId }));
    }
  }, [closing, saveTab, dispatch]);
  const discardAndClose = useCallback(() => {
    if (closing !== undefined) {
      setClosing(undefined);
      dispatch({ type: 'closeTab', tabId: closing.tabId });
    }
  }, [closing, dispatch]);
  const cancelClose = useCallback(() => {
    setClosing(undefined);
    return closing !== undefined;
  }, [closing]);

  return { closing, switchTo, requestClose, saveAndClose, discardAndClose, cancelClose };
}

/** File ▸ Close Tab (⌘W) closes the shown tab; Next Tab (⌃Tab) / Previous Tab (⌃⇧Tab) go round the tabs. */
function useTabMenu(latest: RefObject<WorkspaceState>, requestClose: (tabId: string) => void, dispatch: Dispatch<WorkspaceAction>): void {
  useEffect(
    () =>
      subscribeTabRequests({
        onCloseTabRequested: () => {
          const { activeTabId } = latest.current;
          if (activeTabId !== undefined) {
            requestClose(activeTabId);
          }
        },
        onNextTabRequested: () => dispatch({ type: 'cycleTab', step: 1 }),
        onPreviousTabRequested: () => dispatch({ type: 'cycleTab', step: -1 }),
      }),
    [latest, requestClose, dispatch],
  );
}

function isSameTabLabel(label: TabLabel, other: TabLabel | undefined): boolean {
  return other !== undefined && label.id === other.id && label.title === other.title && label.fileName === other.fileName && label.isEdited === other.isEdited;
}

/** The tab strip's labels: the same array while none of them changed, so a cursor move or an edit does not redraw it. */
export function useTabLabels(workspace: WorkspaceState): readonly TabLabel[] {
  const labels = tabLabels(workspace);
  const kept = useRef(labels);
  if (labels.length !== kept.current.length || !labels.every((label, index) => isSameTabLabel(label, kept.current[index]))) {
    kept.current = labels;
  }
  return kept.current;
}
