import ReactTestRenderer from 'react-test-renderer';
import { useEditMenu } from '../src/hooks/use-edit-menu';
import type { ClipboardCommand } from '../src/native/clipboard';
import type { UndoEventHandlers } from '../src/native/gp-files';

const mockMenu: {
  handlers?: UndoEventHandlers;
  onClipboardRequested?: (command: ClipboardCommand) => void;
  states: (readonly [boolean, boolean])[];
  subscriptions: number;
} = { states: [], subscriptions: 0 };

jest.mock('../src/native/gp-files', () => ({
  setUndoState: (canUndo: boolean, canRedo: boolean) => mockMenu.states.push([canUndo, canRedo]),
  subscribeUndoRequests: (handlers: UndoEventHandlers) => {
    mockMenu.handlers = handlers;
    return () => {
      mockMenu.handlers = undefined;
    };
  },
}));

jest.mock('../src/native/clipboard', () => ({
  subscribeClipboardRequests: (onClipboardRequested: (command: ClipboardCommand) => void) => {
    mockMenu.onClipboardRequested = onClipboardRequested;
    mockMenu.subscriptions += 1;
    return () => {
      mockMenu.onClipboardRequested = undefined;
    };
  },
}));

interface ProbeProps {
  readonly canUndo: boolean;
  readonly canRedo: boolean;
  readonly runCommand: jest.Mock;
  readonly isOverlayOpen?: boolean;
}

function Probe({ canUndo, canRedo, runCommand, isOverlayOpen }: ProbeProps) {
  useEditMenu(canUndo, canRedo, runCommand, isOverlayOpen);
  return null;
}

beforeEach(() => {
  mockMenu.states = [];
  mockMenu.handlers = undefined;
  mockMenu.onClipboardRequested = undefined;
  mockMenu.subscriptions = 0;
});

describe('useEditMenu', () => {
  it('tells the menu bar whether there is something to undo or redo, again when it changes', () => {
    // Arrange
    const runCommand = jest.fn();
    let renderer: ReactTestRenderer.ReactTestRenderer | undefined;

    // Act
    ReactTestRenderer.act(() => {
      renderer = ReactTestRenderer.create(<Probe canUndo={false} canRedo={false} runCommand={runCommand} />);
    });
    ReactTestRenderer.act(() => renderer?.update(<Probe canUndo canRedo={false} runCommand={runCommand} />));
    ReactTestRenderer.act(() => renderer?.update(<Probe canUndo canRedo={false} runCommand={runCommand} />));

    // Assert
    expect(mockMenu.states).toEqual([
      [false, false],
      [true, false],
    ]);
  });

  it('undoes and redoes the shown tab when Edit ▸ Undo / Redo (or ⌘Z / ⇧⌘Z) is chosen', () => {
    // Arrange
    const runCommand = jest.fn();
    ReactTestRenderer.act(() => {
      ReactTestRenderer.create(<Probe canUndo canRedo runCommand={runCommand} />);
    });

    // Act
    mockMenu.handlers?.onUndoRequested();
    mockMenu.handlers?.onRedoRequested();

    // Assert
    expect(runCommand.mock.calls).toEqual([[{ type: 'undo' }], [{ type: 'redo' }]]);
  });

  it('cuts, copies and pastes beats in the shown tab when Edit ▸ Cut / Copy / Paste (or ⌘X / ⌘C / ⌘V) is chosen for the score', () => {
    // Arrange
    const runCommand = jest.fn();
    ReactTestRenderer.act(() => {
      ReactTestRenderer.create(<Probe canUndo={false} canRedo={false} runCommand={runCommand} />);
    });

    // Act
    mockMenu.onClipboardRequested?.('copy');
    mockMenu.onClipboardRequested?.('cut');
    mockMenu.onClipboardRequested?.('paste');

    // Assert
    expect(runCommand.mock.calls).toEqual([[{ type: 'copy' }], [{ type: 'cut' }], [{ type: 'paste' }]]);
  });

  it('stops listening to the menu when it unmounts', () => {
    // Arrange
    const runCommand = jest.fn();
    let renderer: ReactTestRenderer.ReactTestRenderer | undefined;
    ReactTestRenderer.act(() => {
      renderer = ReactTestRenderer.create(<Probe canUndo canRedo runCommand={runCommand} />);
    });

    // Act
    ReactTestRenderer.act(() => renderer?.unmount());

    // Assert
    expect(mockMenu.onClipboardRequested).toBeUndefined();
    expect(mockMenu.handlers).toBeUndefined();
  });

  it('does nothing to the score while a panel, sheet or menu is over it, and again once it closes', () => {
    // Arrange
    const runCommand = jest.fn();
    let renderer: ReactTestRenderer.ReactTestRenderer | undefined;
    ReactTestRenderer.act(() => {
      renderer = ReactTestRenderer.create(<Probe canUndo={false} canRedo={false} runCommand={runCommand} isOverlayOpen />);
    });

    // Act
    mockMenu.onClipboardRequested?.('paste');
    ReactTestRenderer.act(() => renderer?.update(<Probe canUndo={false} canRedo={false} runCommand={runCommand} isOverlayOpen={false} />));
    mockMenu.onClipboardRequested?.('paste');

    // Assert
    expect(runCommand.mock.calls).toEqual([[{ type: 'paste' }]]);
  });

  it('listens once, running the latest command handler after a render brings a new one', () => {
    // Arrange
    const first = jest.fn();
    const second = jest.fn();
    let renderer: ReactTestRenderer.ReactTestRenderer | undefined;
    ReactTestRenderer.act(() => {
      renderer = ReactTestRenderer.create(<Probe canUndo canRedo runCommand={first} />);
    });

    // Act
    ReactTestRenderer.act(() => renderer?.update(<Probe canUndo canRedo runCommand={second} />));
    mockMenu.onClipboardRequested?.('copy');
    mockMenu.handlers?.onUndoRequested();

    // Assert
    expect(mockMenu.subscriptions).toBe(1);
    expect(first).not.toHaveBeenCalled();
    expect(second.mock.calls).toEqual([[{ type: 'copy' }], [{ type: 'undo' }]]);
  });
});
