import ReactTestRenderer from 'react-test-renderer';
import { type EditorCommands, useEditorCommands } from '../src/hooks/use-editor-commands';
import type { Playback } from '../src/hooks/use-playback';
import { INITIAL_EDITOR_STATE } from '../src/state/editor';

jest.mock('../src/native/focus-view', () => ({ focusView: () => undefined }));

interface Sources {
  readonly dispatch: jest.Mock;
  readonly create: jest.Mock;
  readonly openDialog: jest.Mock;
  readonly importPdf: jest.Mock;
  readonly exportPdf: jest.Mock;
  readonly save: jest.Mock;
}

function renderCommands(): { commands: EditorCommands; sources: Sources } {
  const sources: Sources = {
    dispatch: jest.fn(),
    create: jest.fn(),
    openDialog: jest.fn(),
    importPdf: jest.fn(),
    exportPdf: jest.fn(),
    save: jest.fn(),
  };
  const playback = { isPlaying: false, start: jest.fn(), stop: jest.fn() } as unknown as Playback;
  let commands: EditorCommands | undefined;
  function Probe() {
    commands = useEditorCommands({ ...sources, state: INITIAL_EDITOR_STATE, playback, openPath: jest.fn(), keyboardView: { current: null } });
    return null;
  }
  ReactTestRenderer.act(() => {
    ReactTestRenderer.create(<Probe />);
  });
  if (commands === undefined) {
    throw new Error('the hook did not run');
  }
  return { commands, sources };
}

describe('useEditorCommands: toolbar routing', () => {
  it('opens the export panel for the Export… button', () => {
    // Arrange
    const { commands, sources } = renderCommands();

    // Act
    commands.runCommand({ type: 'exportPdf' });

    // Assert
    expect(sources.exportPdf).toHaveBeenCalledTimes(1);
    expect(sources.dispatch).not.toHaveBeenCalled();
  });

  it('keeps routing the file buttons to their own commands', () => {
    const { commands, sources } = renderCommands();
    commands.runCommand({ type: 'importPdf' });
    commands.runCommand({ type: 'saveFile' });
    expect(sources.importPdf).toHaveBeenCalledTimes(1);
    expect(sources.save).toHaveBeenCalledWith(false);
    expect(sources.exportPdf).not.toHaveBeenCalled();
  });
});
