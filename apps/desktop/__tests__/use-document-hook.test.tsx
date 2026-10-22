import { type Song, readSong, writeSong } from '@gp-editor/core';
import ReactTestRenderer from 'react-test-renderer';
import { type DocumentCommands, useDocument } from '../src/hooks/use-document';
import { base64ToBytes, bytesToBase64 } from '../src/lib/base64';
import type { FileEventHandlers, OpenedFile, SavedFile } from '../src/native/gp-files';
import { type EditorAction, type EditorState, INITIAL_EDITOR_STATE, editorReducer } from '../src/state/editor';
import { beat, makeSong, note } from '../test-support/songs';

const mockFiles = {
  showOpenDialog: jest.fn<Promise<OpenedFile | null>, []>(),
  readFile: jest.fn<Promise<OpenedFile>, [string]>(),
  showSaveDialog: jest.fn<Promise<SavedFile | null>, [string, string]>(),
  writeFile: jest.fn<Promise<SavedFile>, [string, string]>(),
  setDocumentTitle: jest.fn<void, [string]>(),
  unsubscribe: jest.fn<void, []>(),
  subscribe: jest.fn<() => void, [FileEventHandlers]>(),
};

jest.mock('../src/native/gp-files', () => ({
  showOpenDialog: () => mockFiles.showOpenDialog(),
  readFile: (pathOrUrl: string) => mockFiles.readFile(pathOrUrl),
  showSaveDialog: (base64: string, suggestedName: string) => mockFiles.showSaveDialog(base64, suggestedName),
  writeFile: (path: string, base64: string) => mockFiles.writeFile(path, base64),
  setDocumentTitle: (title: string) => mockFiles.setDocumentTitle(title),
  subscribeFileEvents: (handlers: FileEventHandlers) => mockFiles.subscribe(handlers),
}));

const SONG = makeSong([[beat(960, [note(1, 3)])]]);
const ETUDE: OpenedFile = { name: 'Etude.gp5', path: '/scores/Etude.gp5', base64: bytesToBase64(writeSong(SONG, 'gp5')) };

interface HookProbe {
  readonly current: () => DocumentCommands;
  readonly dispatch: jest.Mock<void, [EditorAction]>;
  readonly onOpenPdf: jest.Mock<void, [string]>;
  readonly setState: (next: EditorState) => void;
  readonly unmount: () => void;
}

function renderHook(state: EditorState = INITIAL_EDITOR_STATE): HookProbe {
  const dispatch = jest.fn<void, [EditorAction]>();
  const onOpenPdf = jest.fn<void, [string]>();
  let latest: DocumentCommands | undefined;
  function Probe({ editor }: { readonly editor: EditorState }) {
    latest = useDocument(editor, dispatch, onOpenPdf);
    return null;
  }
  let renderer!: ReactTestRenderer.ReactTestRenderer;
  ReactTestRenderer.act(() => {
    renderer = ReactTestRenderer.create(<Probe editor={state} />);
  });
  return {
    current: () => latest!,
    dispatch,
    onOpenPdf,
    setState: (next) => ReactTestRenderer.act(() => renderer.update(<Probe editor={next} />)),
    unmount: () => ReactTestRenderer.act(() => renderer.unmount()),
  };
}

/** Runs `action`, then lets every pending native call and dispatch settle. */
async function settle(action: () => void): Promise<void> {
  await ReactTestRenderer.act(async () => {
    action();
    await new Promise<void>((resolve) => setTimeout(resolve, 0));
  });
}

function opened(fileName: string, path: string, song: Song = SONG): EditorState {
  return editorReducer(INITIAL_EDITOR_STATE, { type: 'loaded', document: { fileName, path, song } });
}

/** The song in a GP5 file handed to the native side. */
function songIn(base64: string | undefined): Song {
  return readSong(base64ToBytes(base64 ?? ''));
}

/** The File-menu handlers from the latest subscription. */
function menu(): FileEventHandlers {
  const handlers = mockFiles.subscribe.mock.calls.at(-1)?.[0];
  if (handlers === undefined) {
    throw new Error('useDocument did not subscribe to the File menu');
  }
  return handlers;
}

beforeEach(() => {
  jest.clearAllMocks();
  mockFiles.subscribe.mockReturnValue(mockFiles.unsubscribe);
});

describe('useDocument opening', () => {
  it('dispatches loaded with the file name, path and song when the open panel returns a Guitar Pro file', async () => {
    // Arrange
    mockFiles.showOpenDialog.mockResolvedValueOnce(ETUDE);
    const hook = renderHook();

    // Act
    await settle(() => hook.current().openDialog());

    // Assert
    expect(hook.dispatch.mock.calls.map(([action]) => action.type)).toEqual(['loadStarted', 'loaded']);
    expect(hook.dispatch).toHaveBeenLastCalledWith({
      type: 'loaded',
      document: { fileName: 'Etude.gp5', path: '/scores/Etude.gp5', song: expect.objectContaining({ info: SONG.info }) },
    });
  });

  it('dispatches loadCancelled and reads nothing when the open panel is cancelled', async () => {
    // Arrange
    mockFiles.showOpenDialog.mockResolvedValueOnce(null);
    const hook = renderHook();

    // Act
    await settle(() => hook.current().openDialog());

    // Assert
    expect(hook.dispatch.mock.calls.map(([action]) => action.type)).toEqual(['loadStarted', 'loadCancelled']);
    expect(mockFiles.readFile).not.toHaveBeenCalled();
  });

  it('reads a path the system handed over (drop, Finder) and dispatches loaded', async () => {
    // Arrange
    mockFiles.readFile.mockResolvedValueOnce(ETUDE);
    const hook = renderHook();

    // Act
    await settle(() => hook.current().openPath('/scores/Etude.gp5'));

    // Assert
    expect(mockFiles.readFile).toHaveBeenCalledWith('/scores/Etude.gp5');
    expect(hook.dispatch).toHaveBeenLastCalledWith(expect.objectContaining({ type: 'loaded' }));
  });

  it('dispatches loadFailed with the error message when the file cannot be read', async () => {
    // Arrange
    mockFiles.readFile.mockRejectedValueOnce(new Error('The file “Etude.gp5” couldn’t be opened.'));
    const hook = renderHook();

    // Act
    await settle(() => hook.current().openPath('/scores/Etude.gp5'));

    // Assert
    expect(hook.dispatch).toHaveBeenLastCalledWith({ type: 'loadFailed', message: 'The file “Etude.gp5” couldn’t be opened.' });
  });

  it('dispatches loadFailed with the reader’s message when the bytes are not a Guitar Pro file', async () => {
    // Arrange
    mockFiles.readFile.mockResolvedValueOnce({ ...ETUDE, base64: bytesToBase64(new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8])) });
    const hook = renderHook();

    // Act
    await settle(() => hook.current().openPath('/scores/Etude.gp5'));

    // Assert
    expect(hook.dispatch).toHaveBeenLastCalledWith({ type: 'loadFailed', message: 'Not a Guitar Pro file (unknown header)' });
  });

  it('dispatches loadFailed with a generic message when the native side rejects with something other than an Error', async () => {
    mockFiles.readFile.mockRejectedValueOnce('nope');
    const hook = renderHook();
    await settle(() => hook.current().openPath('/scores/Etude.gp5'));
    expect(hook.dispatch).toHaveBeenLastCalledWith({ type: 'loadFailed', message: 'Unexpected error while opening the file' });
  });

  it('hands a PDF to onOpenPdf instead of reading it', async () => {
    // Arrange
    const hook = renderHook();

    // Act
    await settle(() => hook.current().openPath('file:///Users/me/My%20Song.PDF'));

    // Assert
    expect(hook.onOpenPdf).toHaveBeenCalledWith('file:///Users/me/My%20Song.PDF');
    expect(mockFiles.readFile).not.toHaveBeenCalled();
    expect(hook.dispatch).not.toHaveBeenCalled();
  });

  it('ignores a PDF when the caller gave no PDF handler', async () => {
    // Arrange
    const dispatch = jest.fn<void, [EditorAction]>();
    let latest: DocumentCommands | undefined;
    function Probe() {
      latest = useDocument(INITIAL_EDITOR_STATE, dispatch);
      return null;
    }
    ReactTestRenderer.act(() => {
      ReactTestRenderer.create(<Probe />);
    });

    // Act
    await settle(() => latest!.openPath('/scores/Etude.pdf'));

    // Assert
    expect(mockFiles.readFile).not.toHaveBeenCalled();
    expect(dispatch).not.toHaveBeenCalled();
  });

  it('dispatches created with the chosen mode for a new sheet', () => {
    const hook = renderHook();
    ReactTestRenderer.act(() => hook.current().create('tab'));
    expect(hook.dispatch).toHaveBeenCalledWith({ type: 'created', mode: 'tab' });
  });
});

describe('useDocument saving', () => {
  it('overwrites a .gp5 document with plain Save and dispatches saved', async () => {
    // Arrange
    mockFiles.writeFile.mockResolvedValueOnce({ name: 'Etude.gp5', path: '/scores/Etude.gp5' });
    const hook = renderHook(opened('Etude.gp5', '/scores/Etude.gp5'));

    // Act
    await settle(() => hook.current().save(false));

    // Assert
    expect(mockFiles.writeFile).toHaveBeenCalledWith('/scores/Etude.gp5', expect.any(String));
    expect(songIn(mockFiles.writeFile.mock.calls[0]?.[1]).tracks[0]?.measures[0]?.beats[0]?.voices[0]?.notes[0]?.fret).toBe(3);
    expect(mockFiles.showSaveDialog).not.toHaveBeenCalled();
    expect(hook.dispatch).toHaveBeenCalledWith({ type: 'saved', fileName: 'Etude.gp5', path: '/scores/Etude.gp5', song: SONG });
  });

  it('asks where to save a .gpx document with plain Save, suggesting the same name as .gp5', async () => {
    // Arrange
    mockFiles.showSaveDialog.mockResolvedValueOnce({ name: 'Etude.gp5', path: '/scores/Etude.gp5' });
    const hook = renderHook(opened('Etude.gpx', '/scores/Etude.gpx'));

    // Act
    await settle(() => hook.current().save(false));

    // Assert
    expect(mockFiles.writeFile).not.toHaveBeenCalled();
    expect(mockFiles.showSaveDialog).toHaveBeenCalledWith(expect.any(String), 'Etude.gp5');
    expect(hook.dispatch).toHaveBeenCalledWith({ type: 'saved', fileName: 'Etude.gp5', path: '/scores/Etude.gp5', song: SONG });
  });

  it('asks where to save a new sheet that has no path yet', async () => {
    // Arrange
    mockFiles.showSaveDialog.mockResolvedValueOnce(null);
    const hook = renderHook(editorReducer(INITIAL_EDITOR_STATE, { type: 'created', mode: 'notationAndTab' }));

    // Act
    await settle(() => hook.current().save(false));

    // Assert
    expect(mockFiles.writeFile).not.toHaveBeenCalled();
    expect(mockFiles.showSaveDialog).toHaveBeenCalledWith(expect.any(String), 'Untitled.gp5');
  });

  it('asks where to save with Save As even when the document is a .gp5', async () => {
    mockFiles.showSaveDialog.mockResolvedValueOnce({ name: 'Copy.gp5', path: '/scores/Copy.gp5' });
    const hook = renderHook(opened('Etude.gp5', '/scores/Etude.gp5'));
    await settle(() => hook.current().save(true));
    expect(mockFiles.writeFile).not.toHaveBeenCalled();
    expect(hook.dispatch).toHaveBeenCalledWith({ type: 'saved', fileName: 'Copy.gp5', path: '/scores/Copy.gp5', song: SONG });
  });

  it('dispatches nothing when the save panel is cancelled', async () => {
    mockFiles.showSaveDialog.mockResolvedValueOnce(null);
    const hook = renderHook(opened('Etude.gpx', '/scores/Etude.gpx'));
    await settle(() => hook.current().save(false));
    expect(hook.dispatch).not.toHaveBeenCalled();
  });

  it('dispatches saveFailed with the error message when the file cannot be written', async () => {
    // Arrange
    mockFiles.writeFile.mockRejectedValueOnce(new Error('The disk is full'));
    const hook = renderHook(opened('Etude.gp5', '/scores/Etude.gp5'));

    // Act
    await settle(() => hook.current().save(false));

    // Assert
    expect(hook.dispatch).toHaveBeenCalledWith({ type: 'saveFailed', message: 'The disk is full' });
  });

  it('does nothing when no document is open', async () => {
    const hook = renderHook();
    await settle(() => hook.current().save(false));
    expect(mockFiles.writeFile).not.toHaveBeenCalled();
    expect(mockFiles.showSaveDialog).not.toHaveBeenCalled();
    expect(hook.dispatch).not.toHaveBeenCalled();
  });

  it('saves the song as last edited when ⌘S comes from the File menu', async () => {
    // Arrange: open, then change the fret under the cursor from 3 to 7
    mockFiles.writeFile.mockResolvedValueOnce({ name: 'Etude.gp5', path: '/scores/Etude.gp5' });
    const start = opened('Etude.gp5', '/scores/Etude.gp5');
    const hook = renderHook(start);
    hook.setState(editorReducer(start, { type: 'setNoteFret', fret: 7 }));

    // Act
    await settle(() => menu().onSaveRequested(false));

    // Assert
    expect(songIn(mockFiles.writeFile.mock.calls[0]?.[1]).tracks[0]?.measures[0]?.beats[0]?.voices[0]?.notes[0]?.fret).toBe(7);
  });
});

describe('useDocument File menu and window title', () => {
  it('follows the File menu: New, Open…, a file from Finder and Save As…', async () => {
    // Arrange
    mockFiles.showOpenDialog.mockResolvedValueOnce(null);
    mockFiles.readFile.mockResolvedValueOnce(ETUDE);
    mockFiles.showSaveDialog.mockResolvedValueOnce(null);
    const hook = renderHook(opened('Etude.gp5', '/scores/Etude.gp5'));

    // Act
    await settle(() => menu().onNewRequested('notation'));
    await settle(() => menu().onOpenRequested());
    await settle(() => menu().onFileOpened('/scores/Etude.gp5'));
    await settle(() => menu().onSaveRequested(true));

    // Assert
    expect(hook.dispatch).toHaveBeenCalledWith({ type: 'created', mode: 'notation' });
    expect(mockFiles.showOpenDialog).toHaveBeenCalledTimes(1);
    expect(mockFiles.readFile).toHaveBeenCalledWith('/scores/Etude.gp5');
    expect(mockFiles.showSaveDialog).toHaveBeenCalledWith(expect.any(String), 'Etude.gp5');
  });

  it('stops listening to the File menu when it unmounts', () => {
    const hook = renderHook();
    hook.unmount();
    expect(mockFiles.unsubscribe).toHaveBeenCalled();
  });

  it('titles the window “GP Editor” with no document, then with the file name, marked while edited', () => {
    // Arrange
    const start = opened('Etude.gp5', '/scores/Etude.gp5');
    const hook = renderHook();
    const titles = () => mockFiles.setDocumentTitle.mock.calls.map(([title]) => title);

    // Act
    hook.setState(start);
    hook.setState(editorReducer(start, { type: 'setNoteFret', fret: 7 }));

    // Assert
    expect(titles()).toEqual(['GP Editor', 'Etude.gp5', 'Etude.gp5 — Edited']);
  });
});
