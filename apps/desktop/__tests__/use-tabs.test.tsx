import ReactTestRenderer from 'react-test-renderer';
import { type Tabs, useTabs } from '../src/hooks/use-tabs';
import type { TabEventHandlers } from '../src/native/gp-files';
import { INITIAL_WORKSPACE, type WorkspaceAction, type WorkspaceState, workspaceReducer } from '../src/state/workspace';
import { beat, makeSong, note } from '../test-support/songs';

const mockTabEvents = {
  unsubscribe: jest.fn<void, []>(),
  subscribe: jest.fn<() => void, [TabEventHandlers]>(),
};

jest.mock('../src/native/gp-files', () => ({
  subscribeTabRequests: (handlers: TabEventHandlers) => mockTabEvents.subscribe(handlers),
}));

const SONG = makeSong([[beat(960, [note(1, 3)])]]);

/** Etude (tab-1, edited: fret 3 → 7) and Riff (tab-2, shown, not edited). */
function twoTabs(): WorkspaceState {
  const actions: WorkspaceAction[] = [
    { type: 'loaded', document: { fileName: 'Etude.gp5', path: '/scores/Etude.gp5', song: SONG } },
    { type: 'setNoteFret', fret: 7 },
    { type: 'loaded', document: { fileName: 'Riff.gp5', path: '/scores/Riff.gp5', song: { ...SONG, info: { ...SONG.info, title: 'Riff' } } } },
  ];
  return actions.reduce(workspaceReducer, INITIAL_WORKSPACE);
}

interface Probe {
  readonly current: () => Tabs;
  readonly dispatch: jest.Mock<void, [WorkspaceAction]>;
  readonly saveTab: jest.Mock<Promise<boolean>, [string, boolean]>;
  readonly unmount: () => void;
}

function renderTabs(workspace: WorkspaceState = twoTabs()): Probe {
  const dispatch = jest.fn<void, [WorkspaceAction]>();
  const saveTab = jest.fn<Promise<boolean>, [string, boolean]>();
  let latest: Tabs | undefined;
  function Hook() {
    latest = useTabs(workspace, dispatch, saveTab);
    return null;
  }
  let renderer!: ReactTestRenderer.ReactTestRenderer;
  ReactTestRenderer.act(() => {
    renderer = ReactTestRenderer.create(<Hook />);
  });
  return { current: () => latest!, dispatch, saveTab, unmount: () => ReactTestRenderer.act(() => renderer.unmount()) };
}

/** The tab handlers from the latest subscription. */
function menu(): TabEventHandlers {
  const handlers = mockTabEvents.subscribe.mock.calls.at(-1)?.[0];
  if (handlers === undefined) {
    throw new Error('useTabs did not subscribe to the tab menu items');
  }
  return handlers;
}

async function settle(action: () => void): Promise<void> {
  await ReactTestRenderer.act(async () => {
    action();
    await new Promise<void>((resolve) => setTimeout(resolve, 0));
  });
}

beforeEach(() => {
  jest.clearAllMocks();
  mockTabEvents.subscribe.mockReturnValue(mockTabEvents.unsubscribe);
});

describe('useTabs: switching', () => {
  it('shows the tab clicked', () => {
    const tabs = renderTabs();
    ReactTestRenderer.act(() => tabs.current().switchTo('tab-1'));
    expect(tabs.dispatch).toHaveBeenCalledWith({ type: 'switchTab', tabId: 'tab-1' });
  });

  it('goes to the next and previous tab from the menu (⌃Tab, ⌃⇧Tab)', () => {
    // Arrange
    const tabs = renderTabs();

    // Act
    ReactTestRenderer.act(() => menu().onNextTabRequested());
    ReactTestRenderer.act(() => menu().onPreviousTabRequested());

    // Assert
    expect(tabs.dispatch.mock.calls.map(([action]) => action)).toEqual([
      { type: 'cycleTab', step: 1 },
      { type: 'cycleTab', step: -1 },
    ]);
  });

  it('stops listening to the menu when it unmounts', () => {
    const tabs = renderTabs();
    tabs.unmount();
    expect(mockTabEvents.unsubscribe).toHaveBeenCalled();
  });
});

describe('useTabs: closing', () => {
  it('closes a tab that is not edited at once', () => {
    const tabs = renderTabs();
    ReactTestRenderer.act(() => tabs.current().requestClose('tab-2'));
    expect(tabs.dispatch).toHaveBeenCalledWith({ type: 'closeTab', tabId: 'tab-2' });
    expect(tabs.current().closing).toBeUndefined();
  });

  it('asks before closing an edited tab, naming it', () => {
    // Arrange
    const tabs = renderTabs();

    // Act
    ReactTestRenderer.act(() => tabs.current().requestClose('tab-1'));

    // Assert
    expect(tabs.dispatch).not.toHaveBeenCalled();
    expect(tabs.current().closing).toEqual({ tabId: 'tab-1', name: 'Test' });
  });

  it('closes the shown tab from File ▸ Close Tab (⌘W), asking first when it is edited', () => {
    // Arrange: Etude (edited) shown
    const tabs = renderTabs(workspaceReducer(twoTabs(), { type: 'switchTab', tabId: 'tab-1' }));

    // Act
    ReactTestRenderer.act(() => menu().onCloseTabRequested());

    // Assert
    expect(tabs.current().closing?.tabId).toBe('tab-1');
  });

  it('does nothing on ⌘W when no tab is open, or for a tab that is gone', () => {
    const tabs = renderTabs(INITIAL_WORKSPACE);
    ReactTestRenderer.act(() => menu().onCloseTabRequested());
    ReactTestRenderer.act(() => tabs.current().requestClose('tab-9'));
    expect(tabs.dispatch).not.toHaveBeenCalled();
    expect(tabs.current().closing).toBeUndefined();
  });

  it('closes without saving on Don’t Save', () => {
    // Arrange
    const tabs = renderTabs();
    ReactTestRenderer.act(() => tabs.current().requestClose('tab-1'));

    // Act
    ReactTestRenderer.act(() => tabs.current().discardAndClose());

    // Assert
    expect(tabs.saveTab).not.toHaveBeenCalled();
    expect(tabs.dispatch).toHaveBeenCalledWith({ type: 'closeTab', tabId: 'tab-1' });
    expect(tabs.current().closing).toBeUndefined();
  });

  it('saves, then closes, on Save', async () => {
    // Arrange
    const tabs = renderTabs();
    tabs.saveTab.mockResolvedValueOnce(true);
    ReactTestRenderer.act(() => tabs.current().requestClose('tab-1'));

    // Act
    await settle(() => tabs.current().saveAndClose());

    // Assert
    expect(tabs.saveTab).toHaveBeenCalledWith('tab-1', false);
    expect(tabs.dispatch).toHaveBeenCalledWith({ type: 'closeTab', tabId: 'tab-1' });
    expect(tabs.current().closing).toBeUndefined();
  });

  it('keeps the tab open when the save panel is cancelled', async () => {
    // Arrange
    const tabs = renderTabs();
    tabs.saveTab.mockResolvedValueOnce(false);
    ReactTestRenderer.act(() => tabs.current().requestClose('tab-1'));

    // Act
    await settle(() => tabs.current().saveAndClose());

    // Assert
    expect(tabs.dispatch).not.toHaveBeenCalled();
    expect(tabs.current().closing).toBeUndefined();
  });

  it('keeps the tab on Cancel; Cancel with no question open tells the caller so (Esc goes on)', () => {
    // Arrange
    const tabs = renderTabs();
    ReactTestRenderer.act(() => tabs.current().requestClose('tab-1'));
    let answers: boolean[] = [];

    // Act
    ReactTestRenderer.act(() => {
      answers = [tabs.current().cancelClose()];
    });
    ReactTestRenderer.act(() => {
      answers = [...answers, tabs.current().cancelClose()];
    });

    // Assert
    expect(answers).toEqual([true, false]);
    expect(tabs.dispatch).not.toHaveBeenCalled();
    expect(tabs.current().closing).toBeUndefined();
  });

  it('does nothing on Save or Don’t Save when no question is open', () => {
    const tabs = renderTabs();
    ReactTestRenderer.act(() => tabs.current().saveAndClose());
    ReactTestRenderer.act(() => tabs.current().discardAndClose());
    expect(tabs.saveTab).not.toHaveBeenCalled();
    expect(tabs.dispatch).not.toHaveBeenCalled();
  });
});
