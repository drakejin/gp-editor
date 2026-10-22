import ReactTestRenderer from 'react-test-renderer';
import { type EditorCommands, useEditorCommands } from '../src/hooks/use-editor-commands';
import type { Playback } from '../src/hooks/use-playback';
import { type EditorState, INITIAL_EDITOR_STATE, editorReducer } from '../src/state/editor';
import { beat, makeSong } from '../test-support/songs';

jest.mock('../src/native/focus-view', () => ({ focusView: () => undefined }));

interface Sources {
  readonly dispatch: jest.Mock;
  readonly create: jest.Mock;
  readonly openDialog: jest.Mock;
  readonly importPdf: jest.Mock;
  readonly exportPdf: jest.Mock;
  readonly save: jest.Mock;
  readonly onZoom: jest.Mock;
  readonly start: jest.Mock;
}

/** A four-bar song open with the cursor in bar 3. */
function openSong(): EditorState {
  const song = makeSong([[beat(960, [])], [beat(4800, [])], [beat(8640, [])], [beat(12480, [])]]);
  const loaded = editorReducer(INITIAL_EDITOR_STATE, { type: 'loaded', document: { fileName: 'a.gp5', path: '/a.gp5', song } });
  return editorReducer(loaded, { type: 'placeCursor', cursor: { trackIndex: 0, measureIndex: 2, beatIndex: 0, voiceIndex: 0, string: 3 } });
}

function renderCommands(state: EditorState = INITIAL_EDITOR_STATE, isPlaying = false): { commands: EditorCommands; sources: Sources } {
  const sources: Sources = {
    dispatch: jest.fn(),
    create: jest.fn(),
    openDialog: jest.fn(),
    importPdf: jest.fn(),
    exportPdf: jest.fn(),
    save: jest.fn(),
    onZoom: jest.fn(),
    start: jest.fn(),
  };
  const playback = { isPlaying, start: sources.start, stop: jest.fn() } as unknown as Playback;
  let commands: EditorCommands | undefined;
  function Probe() {
    commands = useEditorCommands({ ...sources, state, playback, openPath: jest.fn(), keyboardView: { current: null } });
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

describe('useEditorCommands: transport and zoom', () => {
  it('moves the cursor to the first beat of the bar a transport button jumps to', () => {
    // Arrange
    const { commands, sources } = renderCommands(openSong());

    // Act
    commands.runCommand({ type: 'goToBar', jump: 'next' });

    // Assert
    expect(sources.dispatch).toHaveBeenCalledWith({ type: 'placeCursor', cursor: { trackIndex: 0, measureIndex: 3, beatIndex: 0, voiceIndex: 0, string: 3 } });
    expect(sources.start).not.toHaveBeenCalled();
  });

  it('plays on from the bar it jumps to while playing', () => {
    const { commands, sources } = renderCommands(openSong(), true);
    commands.runCommand({ type: 'goToBar', jump: 'first' });
    expect(sources.start).toHaveBeenCalledWith(0);
  });

  it('zooms with ⌘- / ⌘= and creates a sheet in the chosen view', () => {
    const { commands, sources } = renderCommands();
    commands.runCommand({ type: 'zoom', direction: -1 });
    commands.runCommand({ type: 'newFile', mode: 'tab' });
    expect(sources.onZoom).toHaveBeenCalledWith(-1);
    expect(sources.create).toHaveBeenCalledWith('tab');
  });
});
