import ReactTestRenderer from 'react-test-renderer';
import { type EditorCommands, useEditorCommands } from '../src/hooks/use-editor-commands';
import type { Playback } from '../src/hooks/use-playback';
import { type EditorState, INITIAL_EDITOR_STATE, editorReducer } from '../src/state/editor';
import { INITIAL_PRACTICE } from '../src/state/practice';
import { beat, fromTux, makeSong } from '../test-support/songs';

jest.mock('../src/native/focus-view', () => ({ focusView: () => undefined }));

interface Sources {
  readonly dispatch: jest.Mock;
  readonly create: jest.Mock;
  readonly openDialog: jest.Mock;
  readonly importPdf: jest.Mock;
  readonly exportPdf: jest.Mock;
  readonly save: jest.Mock;
  readonly onZoom: jest.Mock;
  readonly onNotePanel: jest.Mock;
  readonly start: jest.Mock;
  readonly stop: jest.Mock;
  readonly closeOverlay: jest.Mock;
  readonly changePractice: jest.Mock;
  readonly clipboard: { readonly copy: jest.Mock; readonly cut: jest.Mock; readonly paste: jest.Mock };
}

/** A four-bar song open with the cursor in bar 3. */
function openSong(): EditorState {
  const song = makeSong([[beat(960, [])], [beat(4800, [])], [beat(8640, [])], [beat(12480, [])]]);
  const loaded = editorReducer(INITIAL_EDITOR_STATE, { type: 'loaded', document: { fileName: 'a.gp5', path: '/a.gp5', song } });
  return editorReducer(loaded, { type: 'placeCursor', cursor: { trackIndex: 0, measureIndex: 2, beatIndex: 0, voiceIndex: 0, string: 3 } });
}

function renderCommands(state: EditorState = INITIAL_EDITOR_STATE, isPlaying = false, isOverlayOpen = false): { commands: EditorCommands; sources: Sources } {
  const sources: Sources = {
    dispatch: jest.fn(),
    create: jest.fn(),
    openDialog: jest.fn(),
    importPdf: jest.fn(),
    exportPdf: jest.fn(),
    save: jest.fn(),
    onZoom: jest.fn(),
    onNotePanel: jest.fn(),
    start: jest.fn(),
    stop: jest.fn(),
    closeOverlay: jest.fn(() => isOverlayOpen),
    changePractice: jest.fn(),
    clipboard: { copy: jest.fn(), cut: jest.fn(), paste: jest.fn() },
  };
  const playback = { isPlaying, start: sources.start, stop: sources.stop, practice: INITIAL_PRACTICE, changePractice: sources.changePractice } as unknown as Playback;
  let commands: EditorCommands | undefined;
  function Probe() {
    commands = useEditorCommands({ ...sources, state, playback, openPath: jest.fn(), keyboardView: { current: null }, isOverlayOpen });
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

describe('useEditorCommands: note panels, playback tempo and the clipboard', () => {
  it('opens the vibrato and bend panels', () => {
    const { commands, sources } = renderCommands(openSong());
    commands.runCommand({ type: 'openNotePanel', panel: 'bend' });
    expect(sources.onNotePanel).toHaveBeenCalledWith('bend');
  });

  it('steps the playback tempo of the cursor’s bar with ] and [', () => {
    // Arrange: the cursor is in bar 3, written at 120 BPM
    const { commands, sources } = renderCommands(openSong());

    // Act
    commands.runCommand({ type: 'shiftPlaybackTempo', delta: 5 });

    // Assert
    expect(sources.changePractice).toHaveBeenCalledWith({ type: 'shiftTempo', delta: 5, writtenTempo: 120 });
    expect(sources.dispatch).not.toHaveBeenCalled();
  });

  it('copies, cuts and pastes through the clipboard', () => {
    const { commands, sources } = renderCommands(openSong());
    commands.runCommand({ type: 'copy' });
    commands.runCommand({ type: 'cut' });
    commands.runCommand({ type: 'paste' });
    expect([sources.clipboard.copy, sources.clipboard.cut, sources.clipboard.paste].map((fn) => fn.mock.calls.length)).toEqual([1, 1, 1]);
  });
});

describe('useEditorCommands: Esc', () => {
  it('closes an open panel instead of stopping playback', () => {
    // Arrange: playing, with the bend panel open
    const { commands, sources } = renderCommands(openSong(), true, true);

    // Act
    commands.runCommand({ type: 'stopPlayback' });

    // Assert
    expect(sources.closeOverlay).toHaveBeenCalledTimes(1);
    expect(sources.stop).not.toHaveBeenCalled();
  });

  it('stops playback when nothing is open', () => {
    const { commands, sources } = renderCommands(openSong(), true, false);
    commands.runCommand({ type: 'stopPlayback' });
    expect(sources.stop).toHaveBeenCalledTimes(1);
  });
});

describe('useEditorCommands: mouse selection', () => {
  const hit = { measureIndex: 3, beatIndex: 0, string: 2 };

  it('places the cursor where the mouse goes down, and extends the selection on a shift-click', () => {
    const { commands, sources } = renderCommands(openSong());
    commands.onPressBeat(hit, false);
    commands.onPressBeat(hit, true);
    expect(sources.dispatch.mock.calls.map(([action]) => action.type)).toEqual(['placeCursor', 'selectTo']);
  });

  it('selects to the beat a drag reaches, in the cursor’s voice', () => {
    // Act
    const { commands, sources } = renderCommands(openSong());
    commands.onDragBeat({ measureIndex: 3, beatIndex: 0 });

    // Assert
    expect(sources.dispatch).toHaveBeenCalledWith({ type: 'selectTo', cursor: { trackIndex: 0, measureIndex: 3, beatIndex: 0, voiceIndex: 0, string: 3 } });
  });
});

describe('useEditorCommands: keys while a popup is open', () => {
  const key = (k: string) => ({ nativeEvent: { key: k, metaKey: false, shiftKey: false, altKey: false } }) as never;

  it('leaves the score alone, whatever is typed', () => {
    // Arrange: the score with a popup over it
    const { commands, sources } = renderCommands(openSong(), true, true);

    // Act
    ['5', 'r', ' ', 'Backspace', 'ArrowRight'].forEach((k) => commands.onKeyDown(key(k)));

    // Assert
    expect(sources.dispatch).not.toHaveBeenCalled();
    expect(sources.stop).not.toHaveBeenCalled();
  });

  it('still closes the popup with Esc', () => {
    const { commands, sources } = renderCommands(openSong(), false, true);
    commands.onKeyDown(key('Escape'));
    expect(sources.closeOverlay).toHaveBeenCalledTimes(1);
  });

  it('handles the keys as usual with no popup', () => {
    const { commands, sources } = renderCommands(openSong());
    commands.onKeyDown(key('ArrowRight'));
    expect(sources.dispatch).toHaveBeenCalledWith({ type: 'moveCursorBeat', step: 1 });
  });
});

describe('useEditorCommands: playing a selection', () => {
  it('plays from the selection’s first beat, wherever the drag ended', () => {
    // Arrange: the cursor in bar 3, beats selected back to bar 2 (anchor) — the drag went backwards
    const selected = { ...openSong(), selectionAnchor: { trackIndex: 0, measureIndex: 1, beatIndex: 0, voiceIndex: 0, string: 3 } };
    const { commands, sources } = renderCommands(selected);

    // Act
    commands.runCommand({ type: 'togglePlayback' });

    // Assert: bar 2's first beat starts at tick 4800
    expect(sources.start).toHaveBeenCalledWith(1, fromTux(4800));
  });

  it('plays from the cursor’s bar without a selection', () => {
    const { commands, sources } = renderCommands(openSong());
    commands.runCommand({ type: 'togglePlayback' });
    expect(sources.start).toHaveBeenCalledWith(2);
  });
});
