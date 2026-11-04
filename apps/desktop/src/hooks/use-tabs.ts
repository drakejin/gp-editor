import { type Dispatch, type RefObject, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { finishQuit, setHasEditedDocuments, subscribeQuitRequests, subscribeTabRequests } from '../native/gp-files';
import { isEdited } from '../state/editor';
import { type TabLabel, type WorkspaceAction, type WorkspaceState, tabLabels, tabTitle } from '../state/workspace';

/** An edited tab waiting for Save / Don't Save / Cancel before it closes. */
export interface TabClosing {
  readonly tabId: string;
  /** What the question calls it: the tab's title. */
  readonly name: string;
  /** Asked while the app quits (⌘Q, the window's close button): the next edited tab comes after it; Cancel stops the quit. */
  readonly isQuitting?: boolean;
}

/** The tab strip's clicks and File ▸ Close Tab / Next Tab / Previous Tab. */
export interface Tabs {
  /** The question shown over the window, when an edited tab is being closed. */
  readonly closing?: TabClosing;
  readonly switchTo: (tabId: string) => void;
  /** Closes a tab; an edited one asks first (`closing`). */
  readonly requestClose: (tabId: string) => void;
  /** Save: saves the tab (⌘S's way), then closes it (quitting: goes on); a cancelled save panel keeps it (and the app) open. */
  readonly saveAndClose: () => void;
  /** Don't Save: closes the tab, its changes lost (quitting: goes on to the next edited tab). */
  readonly discardAndClose: () => void;
  /** Cancel (also Esc): keeps the tab (and the app); false when no question was open, so Esc goes on to other overlays. */
  readonly cancelClose: () => boolean;
}

/** The quit under way: the edited tabs answered so far, asked about one after the other. */
interface QuitReview {
  /** A tab was saved or its changes let go: the next edited tab is asked about, or the app quits. */
  readonly answered: (tabId: string) => void;
  /** Cancel, or a save that did not happen: the app stays open. */
  readonly stop: () => void;
}

/**
 * Switching and closing tabs; `saveTab` saves one tab and says whether it was saved (useDocument); `beforeQuit` runs
 * once every edited tab is answered, before the app quits (the autosave's last marks: useAutosave's endSession).
 */
export function useTabs(
  workspace: WorkspaceState,
  dispatch: Dispatch<WorkspaceAction>,
  saveTab: (tabId: string, saveAs: boolean) => Promise<boolean>,
  beforeQuit?: () => Promise<void>,
): Tabs {
  const [closing, setClosing] = useState<TabClosing | undefined>(undefined);
  // The latest tabs and question, read through refs so the menu listeners are not re-added on every edit.
  const latest = useRef(workspace);
  latest.current = workspace;
  const shownQuestion = useRef(closing);
  shownQuestion.current = closing;
  const quit = useQuitReview(latest, shownQuestion, dispatch, setClosing, beforeQuit);

  const switchTo = useCallback((tabId: string) => dispatch({ type: 'switchTab', tabId }), [dispatch]);
  const requestClose = useCallback(
    (tabId: string) => {
      const editor = latest.current.tabs.find((tab) => tab.id === tabId)?.editor;
      if (editor?.document !== undefined && isEdited(editor)) {
        // A quit's question replaced by this tab's own (⌘W over it): the quit is given up, as Cancel does.
        quit.stop();
        setClosing({ tabId, name: tabTitle(editor.document) });
      } else if (editor !== undefined) {
        dispatch({ type: 'closeTab', tabId });
      }
    },
    [dispatch, quit],
  );
  useTabMenu(latest, requestClose, dispatch);
  useEditedDocuments(workspace);

  const answers = useAnswers(closing, setClosing, saveTab, dispatch, quit);
  return { closing, switchTo, requestClose, ...answers };
}

type Answers = Pick<Tabs, 'saveAndClose' | 'discardAndClose' | 'cancelClose'>;

/** Save, Don't Save and Cancel of the question shown: a tab closing, or the app quitting (`quit` goes on or stops). */
function useAnswers(
  closing: TabClosing | undefined,
  setClosing: (closing: TabClosing | undefined) => void,
  saveTab: (tabId: string, saveAs: boolean) => Promise<boolean>,
  dispatch: Dispatch<WorkspaceAction>,
  quit: QuitReview,
): Answers {
  const saveAndClose = useCallback(() => {
    if (closing === undefined) {
      return;
    }
    setClosing(undefined);
    void saveTab(closing.tabId, false).then((isSaved) => {
      if (closing.isQuitting === true) {
        return isSaved ? quit.answered(closing.tabId) : quit.stop();
      }
      return isSaved && dispatch({ type: 'closeTab', tabId: closing.tabId });
    });
  }, [closing, setClosing, saveTab, dispatch, quit]);
  const discardAndClose = useCallback(() => {
    if (closing !== undefined) {
      setClosing(undefined);
      return closing.isQuitting === true ? quit.answered(closing.tabId) : dispatch({ type: 'closeTab', tabId: closing.tabId });
    }
  }, [closing, setClosing, dispatch, quit]);
  const cancelClose = useCallback(() => {
    setClosing(undefined);
    // Esc while a quit's save is written (no question shown) leaves the quit going on.
    if (closing?.isQuitting === true) {
      quit.stop();
    }
    return closing !== undefined;
  }, [closing, setClosing, quit]);

  return { saveAndClose, discardAndClose, cancelClose };
}

/**
 * Quitting with edited tabs (⌘Q, the window's close button; the native side asks JS first while a tab is edited): each
 * edited tab is shown and asked about — Save, Don't Save or Cancel —, then the app quits (`finishQuit`).
 */
function useQuitReview(
  latest: RefObject<WorkspaceState>,
  shownQuestion: RefObject<TabClosing | undefined>,
  dispatch: Dispatch<WorkspaceAction>,
  setClosing: (closing: TabClosing | undefined) => void,
  beforeQuit: (() => Promise<void>) | undefined,
): QuitReview {
  // The tabs answered in the quit under way; undefined while none is.
  const answeredTabs = useRef<ReadonlySet<string> | undefined>(undefined);
  const askNext = useCallback(() => {
    const answered = answeredTabs.current;
    if (answered === undefined) {
      return;
    }
    const next = latest.current.tabs.find((tab) => tab.editor.document !== undefined && isEdited(tab.editor) && !answered.has(tab.id));
    if (next?.editor.document === undefined) {
      answeredTabs.current = undefined;
      if (beforeQuit === undefined) {
        finishQuit();
      } else {
        void beforeQuit().finally(finishQuit);
      }
      return;
    }
    dispatch({ type: 'switchTab', tabId: next.id });
    setClosing({ tabId: next.id, name: tabTitle(next.editor.document), isQuitting: true });
  }, [latest, dispatch, setClosing, beforeQuit]);
  // Each quit asks from the first edited tab again, unless its question is on screen already.
  const start = useCallback(() => {
    if (shownQuestion.current?.isQuitting !== true) {
      answeredTabs.current = new Set();
      askNext();
    }
  }, [shownQuestion, askNext]);
  useEffect(() => subscribeQuitRequests(start), [start]);
  const answered = useCallback(
    (tabId: string) => {
      answeredTabs.current = answeredTabs.current === undefined ? undefined : new Set([...answeredTabs.current, tabId]);
      askNext();
    },
    [askNext],
  );
  const stop = useCallback(() => {
    answeredTabs.current = undefined;
  }, []);
  return useMemo(() => ({ answered, stop }), [answered, stop]);
}

/** Tells the native side whether a tab has unsaved changes: the window's close button shows it, and quitting asks first. */
function useEditedDocuments(workspace: WorkspaceState): void {
  const hasEdited = workspace.tabs.some((tab) => isEdited(tab.editor));
  useEffect(() => setHasEditedDocuments(hasEdited), [hasEdited]);
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
