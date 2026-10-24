import { DEFAULT_STYLESHEET, type Song, readSong, renderMidi, setStylesheet, writeAsciiTab, writeMusicXml } from '@gp-editor/core';
import ReactTestRenderer from 'react-test-renderer';
import { type SongExport, asciiTabTrackIndexes, useSongExport } from '../src/hooks/use-song-export';
import { base64ToBytes } from '../src/lib/base64';
import { ASCII_TAB_FILE, MIDI_FILE, MUSICXML_FILE, MXL_FILE } from '../src/lib/file-formats';
import type { ChosenFile, SavePanelOptions, SavedFile, SongExportHandlers } from '../src/native/gp-files';
import type { OpenDocument } from '../src/state/editor';
import { beat, makeSong, note } from '../test-support/songs';

const mockFiles = {
  showSavePanel: jest.fn<Promise<ChosenFile | null>, [SavePanelOptions]>(),
  writeFile: jest.fn<Promise<SavedFile>, [string, string]>(),
  writeTextFile: jest.fn<Promise<SavedFile>, [string, string]>(),
  unsubscribe: jest.fn<void, []>(),
  handlers: undefined as SongExportHandlers | undefined,
};

jest.mock('../src/native/gp-files', () => ({
  showSavePanel: (options: SavePanelOptions) => mockFiles.showSavePanel(options),
  writeFile: (path: string, base64: string) => mockFiles.writeFile(path, base64),
  writeTextFile: (path: string, text: string) => mockFiles.writeTextFile(path, text),
  subscribeSongExportRequests: (handlers: SongExportHandlers) => {
    mockFiles.handlers = handlers;
    return mockFiles.unsubscribe;
  },
}));

const SONG = makeSong([[beat(960, [note(1, 3)])], [beat(4800, [note(6, 0)])]]);

/** SONG with a drum track after its guitar. */
function withDrums(song: Song): Song {
  const [guitar] = song.tracks;
  return guitar === undefined ? song : { ...song, tracks: [guitar, { ...guitar, number: 2, name: 'Drums', isPercussion: true }] };
}

const DOCUMENT: OpenDocument = { fileName: 'Song.gp5', path: '/scores/Song.gp5', song: SONG };

function renderHook(document: OpenDocument | undefined): { current: () => SongExport; dispatch: jest.Mock; unmount: () => void } {
  const dispatch = jest.fn();
  let latest: SongExport | undefined;
  function Probe() {
    latest = useSongExport(document, dispatch);
    return null;
  }
  let renderer!: ReactTestRenderer.ReactTestRenderer;
  ReactTestRenderer.act(() => {
    renderer = ReactTestRenderer.create(<Probe />);
  });
  return { current: () => latest!, dispatch, unmount: () => ReactTestRenderer.act(() => renderer.unmount()) };
}

/** Runs `action`, then lets the native calls settle. */
async function settle(action: () => void): Promise<void> {
  await ReactTestRenderer.act(async () => {
    action();
    await new Promise<void>((resolve) => setTimeout(resolve, 0));
  });
}

beforeEach(() => {
  jest.clearAllMocks();
  mockFiles.handlers = undefined;
});

describe('useSongExport: Export MIDI…', () => {
  it('saves the song as played, from the File menu, to the .mid chosen in the save panel', async () => {
    // Arrange
    mockFiles.showSavePanel.mockResolvedValueOnce({ name: 'Song.mid', path: '/out/Song.mid', formatId: 'mid' });
    mockFiles.writeFile.mockResolvedValueOnce({ name: 'Song.mid', path: '/out/Song.mid' });
    renderHook(DOCUMENT);

    // Act
    await settle(() => mockFiles.handlers?.onExportMidiRequested());

    // Assert
    expect(mockFiles.showSavePanel).toHaveBeenCalledWith({ suggestedName: 'Song.mid', formats: [MIDI_FILE], formatId: 'mid' });
    const [path, base64] = mockFiles.writeFile.mock.calls[0] ?? [];
    expect(path).toBe('/out/Song.mid');
    expect(base64ToBytes(base64 ?? '')).toEqual(renderMidi(SONG).bytes);
  });

  it('writes nothing when the save panel is cancelled, and does nothing without a document', async () => {
    // Arrange
    mockFiles.showSavePanel.mockResolvedValueOnce(null);
    const hook = renderHook(DOCUMENT);
    const empty = renderHook(undefined);

    // Act
    await settle(() => hook.current().exportMidi());
    await settle(() => empty.current().exportMidi());

    // Assert
    expect(mockFiles.showSavePanel).toHaveBeenCalledTimes(1);
    expect(mockFiles.writeFile).not.toHaveBeenCalled();
    expect(hook.dispatch).not.toHaveBeenCalled();
  });

  it('reports a MIDI file that could not be written to the error banner', async () => {
    // Arrange
    mockFiles.showSavePanel.mockResolvedValueOnce({ name: 'Song.mid', path: '/out/Song.mid', formatId: 'mid' });
    mockFiles.writeFile.mockRejectedValueOnce(new Error('disk full'));
    const hook = renderHook(DOCUMENT);

    // Act
    await settle(() => hook.current().exportMidi());

    // Assert
    expect(hook.dispatch).toHaveBeenCalledWith({ type: 'exportFailed', what: 'the MIDI file', message: 'disk full' });
  });

  it('opens one save panel at a time', async () => {
    // Arrange
    let answer: (chosen: null) => void = () => undefined;
    mockFiles.showSavePanel.mockReturnValueOnce(new Promise((resolve) => (answer = resolve)));
    const hook = renderHook(DOCUMENT);

    // Act
    await settle(() => {
      hook.current().exportMidi();
      hook.current().exportAsciiTab();
    });
    await settle(() => answer(null));
    mockFiles.showSavePanel.mockResolvedValueOnce(null);
    await settle(() => hook.current().exportMidi());

    // Assert
    expect(mockFiles.showSavePanel).toHaveBeenCalledTimes(2);
  });
});

describe('useSongExport: Export ASCII Tab…', () => {
  it('saves the fretted tracks as ASCII tab to the .txt chosen in the save panel', async () => {
    // Arrange
    const song = withDrums(SONG);
    mockFiles.showSavePanel.mockResolvedValueOnce({ name: 'Song.txt', path: '/out/Song.txt', formatId: 'txt' });
    mockFiles.writeTextFile.mockResolvedValueOnce({ name: 'Song.txt', path: '/out/Song.txt' });
    renderHook({ ...DOCUMENT, song });

    // Act
    await settle(() => mockFiles.handlers?.onExportAsciiTabRequested());

    // Assert
    expect(mockFiles.showSavePanel).toHaveBeenCalledWith({ suggestedName: 'Song.txt', formats: [ASCII_TAB_FILE], formatId: 'txt' });
    expect(mockFiles.writeTextFile).toHaveBeenCalledWith('/out/Song.txt', writeAsciiTab(song, { trackIndexes: [0] }));
  });

  it('reports ASCII tab that could not be written to the error banner', async () => {
    // Arrange
    mockFiles.showSavePanel.mockResolvedValueOnce({ name: 'Song.txt', path: '/out/Song.txt', formatId: 'txt' });
    mockFiles.writeTextFile.mockRejectedValueOnce(new Error('read-only volume'));
    const hook = renderHook(DOCUMENT);

    // Act
    await settle(() => hook.current().exportAsciiTab());

    // Assert
    expect(hook.dispatch).toHaveBeenCalledWith({ type: 'exportFailed', what: 'the ASCII tab', message: 'read-only volume' });
  });

  it('stops listening to the File menu when it unmounts', () => {
    const hook = renderHook(DOCUMENT);
    hook.unmount();
    expect(mockFiles.unsubscribe).toHaveBeenCalled();
  });
});

describe('useSongExport: Export MusicXML… and Export Compressed MusicXML…', () => {
  it('saves the song as MusicXML text to the .musicxml chosen in the save panel', async () => {
    // Arrange
    mockFiles.showSavePanel.mockResolvedValueOnce({ name: 'Song.musicxml', path: '/out/Song.musicxml', formatId: 'musicxml' });
    mockFiles.writeTextFile.mockResolvedValueOnce({ name: 'Song.musicxml', path: '/out/Song.musicxml' });
    renderHook(DOCUMENT);

    // Act
    await settle(() => mockFiles.handlers?.onExportMusicXmlRequested());

    // Assert
    expect(mockFiles.showSavePanel).toHaveBeenCalledWith({ suggestedName: 'Song.musicxml', formats: [MUSICXML_FILE], formatId: 'musicxml' });
    expect(mockFiles.writeTextFile).toHaveBeenCalledWith('/out/Song.musicxml', writeMusicXml(SONG));
  });

  it('says in the hint strip that MusicXML keeps no stylesheet, when the song has one', async () => {
    // Arrange
    const styled = setStylesheet(SONG, { ...DEFAULT_STYLESHEET, lyrics: 'above' });
    mockFiles.showSavePanel.mockResolvedValueOnce({ name: 'Song.musicxml', path: '/out/Song.musicxml', formatId: 'musicxml' });
    mockFiles.writeTextFile.mockResolvedValueOnce({ name: 'Song.musicxml', path: '/out/Song.musicxml' });
    const hook = renderHook({ ...DOCUMENT, song: styled });

    // Act
    await settle(() => mockFiles.handlers?.onExportMusicXmlRequested());

    // Assert
    expect(hook.dispatch).toHaveBeenCalledWith({ type: 'showHint', hint: 'MusicXML keeps no stylesheet or Design Mode layout: save as Guitar Pro 7/8 (.gp) to keep them.' });
  });

  it('saves compressed MusicXML (.mxl) that reads back as the song', async () => {
    // Arrange
    mockFiles.showSavePanel.mockResolvedValueOnce({ name: 'Song.mxl', path: '/out/Song.mxl', formatId: 'mxl' });
    mockFiles.writeFile.mockResolvedValueOnce({ name: 'Song.mxl', path: '/out/Song.mxl' });
    const hook = renderHook(DOCUMENT);

    // Act
    await settle(() => mockFiles.handlers?.onExportCompressedMusicXmlRequested());

    // Assert
    expect(mockFiles.showSavePanel).toHaveBeenCalledWith({ suggestedName: 'Song.mxl', formats: [MXL_FILE], formatId: 'mxl' });
    const again = readSong(base64ToBytes(mockFiles.writeFile.mock.calls[0]?.[1] ?? ''));
    expect(again.source.format).toBe('musicxml');
    expect(again.tracks[0]?.measures[0]?.beats[0]?.voices[0]?.notes.map((n) => [n.string, n.fret])).toEqual([[1, 3]]);
    expect(hook.dispatch).not.toHaveBeenCalled();
  });

  it('reports MusicXML that could not be written to the error banner', async () => {
    // Arrange
    mockFiles.showSavePanel.mockResolvedValueOnce({ name: 'Song.musicxml', path: '/out/Song.musicxml', formatId: 'musicxml' });
    mockFiles.writeTextFile.mockRejectedValueOnce(new Error('disk full'));
    const hook = renderHook(DOCUMENT);

    // Act
    await settle(() => hook.current().exportMusicXml());

    // Assert
    expect(hook.dispatch).toHaveBeenCalledWith({ type: 'exportFailed', what: 'the MusicXML file', message: 'disk full' });
  });
});

describe('asciiTabTrackIndexes', () => {
  it('leaves the drum tracks out, unless the song has nothing else', () => {
    // Arrange
    const song = withDrums(SONG);
    const drumsOnly = { ...song, tracks: song.tracks.filter((track) => track.isPercussion) };

    // Act / Assert
    expect(asciiTabTrackIndexes(song)).toEqual([0]);
    expect(asciiTabTrackIndexes(drumsOnly)).toEqual([0]);
    expect(asciiTabTrackIndexes(SONG)).toEqual([0]);
  });
});
