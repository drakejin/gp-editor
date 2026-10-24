import ReactTestRenderer from 'react-test-renderer';
import { type CommandPalette, type TransposePanel, commandStateOf, useCommandPalette, useTransposePanel } from '../src/hooks/use-command-palette';
import type { Command, CommandActions } from '../src/lib/command-types';
import { INITIAL_WORKSPACE, type WorkspaceAction, type WorkspaceState, workspaceReducer } from '../src/state/workspace';
import { beat, makeSong, note } from '../test-support/songs';

const mockEvents = {
  palette: jest.fn<() => void, [(mode: 'commands' | 'expression') => void]>(),
  transpose: jest.fn<() => void, [() => void]>(),
};

jest.mock('../src/native/gp-files', () => ({
  subscribeCommandPaletteRequests: (handler: (mode: 'commands' | 'expression') => void) => mockEvents.palette(handler),
  subscribeTransposeRequests: (handler: () => void) => mockEvents.transpose(handler),
}));

const SONG = makeSong([[beat(960, [note(1, 3)]), beat(1920, [note(2, 5)])]]);

function workspaceWith(...actions: WorkspaceAction[]): WorkspaceState {
  return actions.reduce(workspaceReducer, INITIAL_WORKSPACE);
}

function renderHook<T>(hook: () => T): { readonly current: () => T } {
  let latest: T | undefined;
  function Probe() {
    latest = hook();
    return null;
  }
  ReactTestRenderer.act(() => {
    ReactTestRenderer.create(<Probe />);
  });
  return {
    current: () => {
      if (latest === undefined) {
        throw new Error('hook did not render');
      }
      return latest;
    },
  };
}

beforeEach(() => {
  mockEvents.palette.mockReset().mockReturnValue(() => undefined);
  mockEvents.transpose.mockReset().mockReturnValue(() => undefined);
});

describe('useCommandPalette', () => {
  it('opens from Tools ▸ Command Palette… and runs a command after closing, remembering it', () => {
    // Arrange
    const onRan = jest.fn();
    const hook = renderHook<CommandPalette>(() => useCommandPalette(onRan));
    const run = jest.fn();
    const command: Command = { id: 'x', title: 'X', group: 'Test', keywords: [], isEnabled: () => true, run };
    const actions = {} as CommandActions;

    // Act
    ReactTestRenderer.act(() => mockEvents.palette.mock.calls[0]?.[0]('commands'));
    const wasOpen = hook.current().isOpen;
    ReactTestRenderer.act(() => hook.current().run(command, actions));

    // Assert
    expect(wasOpen).toBe(true);
    expect(hook.current().isOpen).toBe(false);
    expect(hook.current().recentIds).toEqual(['x']);
    expect(onRan).toHaveBeenCalled();
    expect(run).toHaveBeenCalledWith(actions);
  });

  it('opens Tools ▸ Expression Text… as the palette with “>” typed, a fresh field each time it opens', () => {
    // Arrange
    const hook = renderHook<CommandPalette>(() => useCommandPalette(() => undefined));
    const before = hook.current().session;

    // Act
    ReactTestRenderer.act(() => mockEvents.palette.mock.calls[0]?.[0]('expression'));
    const expression = hook.current().session;
    ReactTestRenderer.act(() => hook.current().open());

    // Assert
    expect(expression).toMatchObject({ initialQuery: '>' });
    expect(expression.id).not.toBe(before.id);
    expect(hook.current().session).toMatchObject({ initialQuery: '' });
    expect(hook.current().isOpen).toBe(true);
  });

  it('does not remember an expression it ran among the recent commands', () => {
    // Arrange
    const hook = renderHook<CommandPalette>(() => useCommandPalette(() => undefined));
    const command: Command = { id: 'expression.dynamic.ff', title: 'ff', group: 'Dynamic', keywords: [], isEnabled: () => true, run: jest.fn() };

    // Act
    ReactTestRenderer.act(() => hook.current().run(command, {} as CommandActions));

    // Assert
    expect(hook.current().recentIds).toEqual([]);
  });

  it('closes', () => {
    const hook = renderHook<CommandPalette>(() => useCommandPalette(() => undefined));
    ReactTestRenderer.act(() => hook.current().open());
    ReactTestRenderer.act(() => hook.current().close());
    expect(hook.current().isOpen).toBe(false);
  });
});

describe('useTransposePanel', () => {
  it('opens from Tools ▸ Transpose… only while a document is open', () => {
    const withDocument = renderHook<TransposePanel>(() => useTransposePanel(true));
    ReactTestRenderer.act(() => mockEvents.transpose.mock.calls[0]?.[0]());
    expect(withDocument.current().isOpen).toBe(true);
    ReactTestRenderer.act(() => withDocument.current().close());
    expect(withDocument.current().isOpen).toBe(false);

    const without = renderHook<TransposePanel>(() => useTransposePanel(false));
    ReactTestRenderer.act(() => without.current().open());
    expect(without.current().isOpen).toBe(false);
  });
});

describe('commandStateOf', () => {
  it('reads the start screen: no document, nothing to undo', () => {
    expect(commandStateOf(INITIAL_WORKSPACE)).toEqual({
      hasDocument: false,
      hasSelection: false,
      canUndo: false,
      canRedo: false,
      tabCount: 0,
      isPercussion: false,
      palette: { keySignature: 0 },
      tuning: [],
    });
  });

  it('reads the shown tab: its selection, history and the note at the cursor', () => {
    const workspace = workspaceWith(
      { type: 'loaded', document: { fileName: 'a.gp5', path: '/a.gp5', song: SONG } },
      { type: 'setNoteFret', fret: 7 },
      { type: 'extendSelection', step: 1 },
    );
    const state = commandStateOf(workspace);
    expect(state).toMatchObject({ hasDocument: true, hasSelection: true, canUndo: true, canRedo: false, tabCount: 1 });
    expect(state.palette.voice).toBeDefined();
  });
});
