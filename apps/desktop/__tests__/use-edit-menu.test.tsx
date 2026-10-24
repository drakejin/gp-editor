import ReactTestRenderer from 'react-test-renderer';
import { useEditMenu } from '../src/hooks/use-edit-menu';
import type { UndoEventHandlers } from '../src/native/gp-files';

const mockMenu: { handlers?: UndoEventHandlers; states: (readonly [boolean, boolean])[] } = { states: [] };

jest.mock('../src/native/gp-files', () => ({
  setUndoState: (canUndo: boolean, canRedo: boolean) => mockMenu.states.push([canUndo, canRedo]),
  subscribeUndoRequests: (handlers: UndoEventHandlers) => {
    mockMenu.handlers = handlers;
    return () => {
      mockMenu.handlers = undefined;
    };
  },
}));

function Probe({ canUndo, canRedo, runCommand }: { readonly canUndo: boolean; readonly canRedo: boolean; readonly runCommand: jest.Mock }) {
  useEditMenu(canUndo, canRedo, runCommand);
  return null;
}

beforeEach(() => {
  mockMenu.states = [];
  mockMenu.handlers = undefined;
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
});
