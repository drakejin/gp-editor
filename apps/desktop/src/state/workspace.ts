import {
  type EditorAction,
  type EditorState,
  INITIAL_EDITOR_STATE,
  type OpenDocument,
  editorReducer,
  isEdited,
  openFailedMessage,
} from './editor';

/** One open document, as a tab of the window: its own editor (song, file, undo, cursor, selection, view, hints). */
export interface DocumentTab {
  readonly id: string;
  readonly editor: EditorState;
}

/** Every document open in the window, as Guitar Pro 8's tabs. */
export interface WorkspaceState {
  /** Left to right, as the tab strip shows them. */
  readonly tabs: readonly DocumentTab[];
  /** The tab shown; undefined only while no tab is open (the start screen). */
  readonly activeTabId?: string;
  /** A file is being opened (the open panel is up or the file is being read). */
  readonly isLoading: boolean;
  /** Why the last file could not be opened, shown over whatever tab is shown. */
  readonly error?: string;
  /** Numbers the next tab's id, so a closed tab's id is never given again. */
  readonly nextTabNumber: number;
}

/** What a tab strip shows for a tab. */
export interface TabLabel {
  readonly id: string;
  readonly title: string;
  readonly fileName: string;
  readonly isEdited: boolean;
}

export type TabAction =
  /**
   * A document in a new tab, shown (Song Writer, and what `loaded` does for a file); the tab already holding its file
   * is shown instead. `isUnsaved`: no file holds it yet, so it counts as edited and closing it asks to save.
   */
  | { readonly type: 'openTab'; readonly document: OpenDocument; readonly isUnsaved?: boolean }
  | { readonly type: 'switchTab'; readonly tabId: string }
  /** Closes a tab at once (an edited one is asked about before, by the caller); its neighbour is shown. */
  | { readonly type: 'closeTab'; readonly tabId: string }
  /** ⌃Tab / ⌃⇧Tab: the next / previous tab, round from the last to the first. */
  | { readonly type: 'cycleTab'; readonly step: 1 | -1 }
  /** An editor action for one tab, shown or not (a save that ends after the user moved to another tab). */
  | { readonly type: 'inTab'; readonly tabId: string; readonly action: EditorAction };

/**
 * Tab actions, plus every editor action: opening (`loadStarted`, `loaded`, `created`, …) belongs to the window and
 * makes new tabs; anything else goes to the shown tab's editorReducer unchanged.
 */
export type WorkspaceAction = EditorAction | TabAction;

export const INITIAL_WORKSPACE: WorkspaceState = { tabs: [], isLoading: false, nextTabNumber: 1 };

export function workspaceReducer(state: WorkspaceState, action: WorkspaceAction): WorkspaceState {
  switch (action.type) {
    case 'loadStarted':
      return { ...state, isLoading: true, error: undefined };
    case 'loadCancelled':
      return { ...state, isLoading: false };
    case 'loadFailed':
      return { ...state, isLoading: false, error: openFailedMessage(action.message) };
    case 'loaded':
      return openDocumentTab(state, action.document, false);
    case 'openTab':
      return openDocumentTab(state, action.document, action.isUnsaved ?? false);
    case 'created':
      return addTab(state, editorReducer(INITIAL_EDITOR_STATE, action));
    case 'dismissError':
      return reduceShownTab(state.error === undefined ? state : { ...state, error: undefined }, action);
    case 'switchTab':
      return action.tabId === state.activeTabId || tabIndexOf(state, action.tabId) < 0 ? state : { ...state, activeTabId: action.tabId };
    case 'closeTab':
      return closeTab(state, action.tabId);
    case 'cycleTab':
      return cycleTab(state, action.step);
    case 'inTab':
      return reduceTab(state, action.tabId, action.action);
    default:
      return reduceShownTab(state, action);
  }
}

/** The shown tab, if any. */
export function activeTab(state: WorkspaceState): DocumentTab | undefined {
  return state.tabs.find((tab) => tab.id === state.activeTabId);
}

/** The shown tab's editor; with no tab open, an editor without a document (the start screen). */
export function activeEditor(state: WorkspaceState): EditorState {
  return activeTab(state)?.editor ?? INITIAL_EDITOR_STATE;
}

/** A tab's name: the song's title, else its file name. */
export function tabTitle(document: OpenDocument): string {
  const title = document.song.info.title.trim();
  return title.length > 0 ? title : document.fileName;
}

/** Every tab as the tab strip shows it. */
export function tabLabels(state: WorkspaceState): readonly TabLabel[] {
  return state.tabs.map(({ id, editor }) => ({
    id,
    title: editor.document === undefined ? '' : tabTitle(editor.document),
    fileName: editor.document?.fileName ?? '',
    isEdited: isEdited(editor),
  }));
}

/** A document in a new tab in the view of the tab shown before, or the tab that already holds its file. */
function openDocumentTab(state: WorkspaceState, document: OpenDocument, isUnsaved: boolean): WorkspaceState {
  const holding = document.path === '' ? undefined : state.tabs.find((tab) => tab.editor.document?.path === document.path);
  if (holding !== undefined) {
    return { ...state, activeTabId: holding.id, isLoading: false };
  }
  const opened = editorReducer({ ...INITIAL_EDITOR_STATE, mode: activeEditor(state).mode }, { type: 'loaded', document });
  return addTab(state, isUnsaved ? { ...opened, savedSong: undefined } : opened);
}

/** A tab after the others, shown. */
function addTab(state: WorkspaceState, editor: EditorState): WorkspaceState {
  const id = `tab-${state.nextTabNumber}`;
  return { ...state, tabs: [...state.tabs, { id, editor }], activeTabId: id, isLoading: false, nextTabNumber: state.nextTabNumber + 1 };
}

function tabIndexOf(state: WorkspaceState, tabId: string | undefined): number {
  return state.tabs.findIndex((tab) => tab.id === tabId);
}

/** Without the tab; when it was shown, the tab to its right is shown (else the one to its left, else none). */
function closeTab(state: WorkspaceState, tabId: string): WorkspaceState {
  const index = tabIndexOf(state, tabId);
  if (index < 0) {
    return state;
  }
  const tabs = state.tabs.filter((tab) => tab.id !== tabId);
  if (tabId !== state.activeTabId) {
    return { ...state, tabs };
  }
  return { ...state, tabs, activeTabId: (tabs[index] ?? tabs[index - 1])?.id };
}

function cycleTab(state: WorkspaceState, step: 1 | -1): WorkspaceState {
  const count = state.tabs.length;
  const index = tabIndexOf(state, state.activeTabId);
  if (index < 0 || count < 2) {
    return state;
  }
  return { ...state, activeTabId: state.tabs[(index + step + count) % count]?.id };
}

function reduceShownTab(state: WorkspaceState, action: EditorAction): WorkspaceState {
  return state.activeTabId === undefined ? state : reduceTab(state, state.activeTabId, action);
}

/** Runs one tab's editorReducer; the same state when its editor did not change. */
function reduceTab(state: WorkspaceState, tabId: string, action: EditorAction): WorkspaceState {
  const index = tabIndexOf(state, tabId);
  const tab = state.tabs[index];
  if (tab === undefined) {
    return state;
  }
  const editor = editorReducer(tab.editor, action);
  if (editor === tab.editor) {
    return state;
  }
  return { ...state, tabs: state.tabs.map((each, i) => (i === index ? { ...each, editor } : each)) };
}
