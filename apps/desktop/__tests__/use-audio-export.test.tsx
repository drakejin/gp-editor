import { type Song, buildAudioTrack, renderMidi } from '@gp-editor/core';
import ReactTestRenderer from 'react-test-renderer';
import { DEFAULT_AUDIO_EXPORT, audioFormat } from '../src/export/audio-formats';
import { type AudioExport, useAudioExport } from '../src/hooks/use-audio-export';
import { base64ToBytes } from '../src/lib/base64';
import { mixOf } from '../src/lib/mix';
import type { AudioExportJob, AudioExportProgress, ChosenFolder, ExportedAudio } from '../src/native/audio-export';
import type { ChosenFile, SavePanelOptions } from '../src/native/gp-files';
import type { OpenDocument } from '../src/state/editor';
import type { PracticeSettings } from '../src/state/practice';
import { INITIAL_PRACTICE } from '../src/state/practice';
import { beat, makeSong, note } from '../test-support/songs';

const mockNative = {
  exportAudio: jest.fn<Promise<ExportedAudio | null>, [AudioExportJob]>(),
  cancelAudioExport: jest.fn<Promise<void>, []>(() => Promise.resolve()),
  chooseAudioFolder: jest.fn<Promise<ChosenFolder | null>, [readonly string[]]>(),
  showSavePanel: jest.fn<Promise<ChosenFile | null>, [SavePanelOptions]>(),
  progress: undefined as ((progress: AudioExportProgress) => void) | undefined,
  menu: undefined as (() => void) | undefined,
};

jest.mock('../src/native/audio-export', () => ({
  exportAudio: (job: AudioExportJob) => mockNative.exportAudio(job),
  cancelAudioExport: () => mockNative.cancelAudioExport(),
  chooseAudioFolder: (names: readonly string[]) => mockNative.chooseAudioFolder(names),
  subscribeAudioExportProgress: (listener: (progress: AudioExportProgress) => void) => {
    mockNative.progress = listener;
    return () => {
      mockNative.progress = undefined;
    };
  },
}));

/** The audio track files the native side keeps (native/audio-track's isAudioLoaded). */
const mockLoadedAudio = new Set<string>();

jest.mock('../src/native/audio-track', () => ({
  isAudioLoaded: (assetId: string) => mockLoadedAudio.has(assetId),
}));

jest.mock('../src/native/gp-files', () => ({
  showSavePanel: (options: SavePanelOptions) => mockNative.showSavePanel(options),
  subscribeExportAudioRequests: (listener: () => void) => {
    mockNative.menu = listener;
    return () => undefined;
  },
}));

const SONG: Song = makeSong([[beat(960, [note(1, 3)])], [beat(4800, [note(2, 5)])], [beat(8640, [note(3, 7)])]]);
const DOCUMENT: OpenDocument = { fileName: 'Song.gp5', path: '/scores/Song.gp5', song: SONG };
const LOOPING: PracticeSettings = { ...INITIAL_PRACTICE, isLooping: true, loop: { fromMeasureIndex: 1, toMeasureIndex: 2 } };

interface Hook {
  readonly current: () => AudioExport;
  readonly dispatch: jest.Mock;
}

function renderHook(document: OpenDocument | undefined, practice: PracticeSettings = INITIAL_PRACTICE): Hook {
  const dispatch = jest.fn();
  let latest: AudioExport | undefined;
  function Probe() {
    latest = useAudioExport(document, practice, dispatch);
    return null;
  }
  ReactTestRenderer.act(() => {
    ReactTestRenderer.create(<Probe />);
  });
  return { current: () => latest!, dispatch };
}

async function settle(action: () => void): Promise<void> {
  await ReactTestRenderer.act(async () => {
    action();
    await new Promise<void>((resolve) => setTimeout(resolve, 0));
  });
}

beforeEach(() => {
  jest.clearAllMocks();
  mockLoadedAudio.clear();
  mockNative.progress = undefined;
  mockNative.menu = undefined;
});

describe('useAudioExport: the panel', () => {
  it('opens from File ▸ Export Audio…, on the loop’s bars when the loop is on', async () => {
    // Arrange
    const hook = renderHook(DOCUMENT, LOOPING);

    // Act
    await settle(() => mockNative.menu?.());

    // Assert
    expect(hook.current().isOpen).toBe(true);
    expect(hook.current().options.range).toBe('loop');
  });

  it('stays closed without a document', async () => {
    // Arrange
    const hook = renderHook(undefined);

    // Act
    await settle(() => hook.current().open());

    // Assert
    expect(hook.current().isOpen).toBe(false);
  });
});

describe('useAudioExport: one file', () => {
  it('asks where to save in the format’s save panel, renders the song as played and says what was saved', async () => {
    // Arrange
    mockNative.showSavePanel.mockResolvedValueOnce({ name: 'Take.mp3', path: '/Music/Take.mp3', formatId: 'mp3' });
    mockNative.exportAudio.mockResolvedValueOnce({ files: [{ name: 'Take.mp3', path: '/Music/Take.mp3', seconds: 7.4 }] });
    const hook = renderHook(DOCUMENT);
    await settle(() => hook.current().open());
    await settle(() => hook.current().setOptions({ ...DEFAULT_AUDIO_EXPORT, formatId: 'mp3', mp3Bitrate: 256 }));

    // Act
    await settle(() => hook.current().start());

    // Assert
    expect(mockNative.showSavePanel).toHaveBeenCalledWith({ suggestedName: 'Song.mp3', formats: [audioFormat('mp3')], formatId: 'mp3' });
    const job = mockNative.exportAudio.mock.calls[0]?.[0];
    expect(job?.settings).toEqual({ format: 'mp3', sampleRate: 44100, bitDepth: 16, mp3Bitrate: 256, oggQuality: 6 });
    expect(job?.mix).toEqual(mixOf(SONG));
    expect(job?.files.map((file) => file.path)).toEqual(['/Music/Take.mp3']);
    expect(base64ToBytes(job?.files[0]?.midi ?? '')).toEqual(renderMidi(SONG).bytes);
    expect(job?.files[0]?.seconds).toBe(renderMidi(SONG).durationSeconds);
    expect(hook.dispatch).toHaveBeenCalledWith({ type: 'showHint', hint: 'Saved Take.mp3 (00:07, MP3, 256 kbps, 44.1 kHz) in “Music”.' });
    expect(hook.current().isOpen).toBe(false);
    expect(hook.current().status.kind).toBe('idle');
  });

  it('renders the song with its audio track under it, at the audio’s pace, when its file is loaded', async () => {
    // Arrange
    const song: Song = { ...SONG, audioTrack: buildAudioTrack({ assetId: 'take', syncPoints: [{ measureIndex: 1, occurrence: 0, position: 0, seconds: 2.5 }] }) };
    mockLoadedAudio.add('take');
    mockNative.showSavePanel.mockResolvedValueOnce({ name: 'Song.wav', path: '/Music/Song.wav', formatId: 'wav' });
    mockNative.exportAudio.mockResolvedValueOnce({ files: [{ name: 'Song.wav', path: '/Music/Song.wav', seconds: 9 }] });
    const hook = renderHook({ ...DOCUMENT, song });
    await settle(() => hook.current().open());

    // Act
    await settle(() => hook.current().start());

    // Assert
    const expected = renderMidi(song, { syncToAudioTrack: true });
    const file = mockNative.exportAudio.mock.calls[0]?.[0]?.files[0];
    expect(base64ToBytes(file?.midi ?? '')).toEqual(expected.bytes);
    expect(file?.audio?.assetId).toBe('take');
    expect(file?.audio?.runs).toEqual(expected.audioRuns);
  });

  it('renders nothing when the save panel is cancelled', async () => {
    // Arrange
    mockNative.showSavePanel.mockResolvedValueOnce(null);
    const hook = renderHook(DOCUMENT);
    await settle(() => hook.current().open());

    // Act
    await settle(() => hook.current().start());

    // Assert
    expect(mockNative.exportAudio).not.toHaveBeenCalled();
    expect(hook.current().isOpen).toBe(true);
    expect(hook.current().status.kind).toBe('idle');
  });

  it('reports a file that could not be written to the error banner and keeps the panel', async () => {
    // Arrange
    mockNative.showSavePanel.mockResolvedValueOnce({ name: 'Song.wav', path: '/Music/Song.wav', formatId: 'wav' });
    mockNative.exportAudio.mockRejectedValueOnce(new Error('disk full'));
    const hook = renderHook(DOCUMENT);
    await settle(() => hook.current().open());

    // Act
    await settle(() => hook.current().start());

    // Assert
    expect(hook.dispatch).toHaveBeenCalledWith({ type: 'exportFailed', what: 'the audio file', message: 'disk full' });
    expect(hook.current().isOpen).toBe(true);
  });
});

describe('useAudioExport: progress and Cancel', () => {
  it('follows the native progress, and Cancel stops the render and says so', async () => {
    // Arrange
    let finish: (result: ExportedAudio | null) => void = () => undefined;
    mockNative.showSavePanel.mockResolvedValueOnce({ name: 'Song.wav', path: '/Music/Song.wav', formatId: 'wav' });
    mockNative.exportAudio.mockReturnValueOnce(new Promise((resolve) => (finish = resolve)));
    const hook = renderHook(DOCUMENT);
    await settle(() => hook.current().open());
    await settle(() => hook.current().start());

    // Act
    await settle(() => mockNative.progress?.({ fileIndex: 0, fileCount: 1, fraction: 0.4 }));
    const during = hook.current().status;
    await settle(() => hook.current().cancel());
    const cancelling = hook.current().status.kind;
    await settle(() => finish(null));

    // Assert
    expect(during).toEqual({ kind: 'rendering', fileIndex: 0, fileCount: 1, fraction: 0.4 });
    expect(cancelling).toBe('cancelling');
    expect(mockNative.cancelAudioExport).toHaveBeenCalledTimes(1);
    expect(hook.dispatch).toHaveBeenCalledWith({ type: 'showHint', hint: 'The audio export was cancelled.' });
    expect(hook.current().status.kind).toBe('idle');
    expect(hook.current().isOpen).toBe(true);
  });

  it('cancels a running export when the panel closes', async () => {
    // Arrange
    mockNative.showSavePanel.mockResolvedValueOnce({ name: 'Song.wav', path: '/Music/Song.wav', formatId: 'wav' });
    mockNative.exportAudio.mockReturnValueOnce(new Promise(() => undefined));
    const hook = renderHook(DOCUMENT);
    await settle(() => hook.current().open());
    await settle(() => hook.current().start());

    // Act
    await settle(() => hook.current().close());

    // Assert
    expect(mockNative.cancelAudioExport).toHaveBeenCalledTimes(1);
    expect(hook.current().isOpen).toBe(false);
  });
});

describe('useAudioExport: one file per track', () => {
  it('asks for a folder and writes each playing track alone into it', async () => {
    // Arrange
    const [guitar] = SONG.tracks;
    const song: Song = guitar === undefined ? SONG : { ...SONG, tracks: [guitar, { ...guitar, number: 2, name: 'Bass' }] };
    mockNative.chooseAudioFolder.mockResolvedValueOnce({ folder: '/Stems', folderName: 'Stems' });
    mockNative.exportAudio.mockImplementationOnce((job) => Promise.resolve({ files: job.files.map((file) => ({ name: file.path.slice(7), path: file.path, seconds: 8 })) }));
    const hook = renderHook({ ...DOCUMENT, song }, LOOPING);
    await settle(() => hook.current().open());
    await settle(() => hook.current().setOptions({ ...hook.current().options, isPerTrack: true, formatId: 'ogg' }));

    // Act
    await settle(() => hook.current().start());

    // Assert
    const names = ['Song (bars 2–3) - 1 Guitar.ogg', 'Song (bars 2–3) - 2 Bass.ogg'];
    expect(mockNative.chooseAudioFolder).toHaveBeenCalledWith(names);
    const job = mockNative.exportAudio.mock.calls[0]?.[0];
    expect(job?.files.map((file) => file.path)).toEqual(names.map((name) => `/Stems/${name}`));
    expect(base64ToBytes(job?.files[1]?.midi ?? '')).toEqual(renderMidi(song, { fromHeaderIndex: 1, toHeaderIndex: 2, trackIndexes: [1] }).bytes);
    expect(hook.dispatch).toHaveBeenCalledWith({
      type: 'showHint',
      hint: 'Saved 2 audio files (Ogg Vorbis, quality 6 (about 192 kbps), 44.1 kHz), one per track, in “Stems”: Song (bars 2–3) - 1 Guitar.ogg, Song (bars 2–3) - 2 Bass.ogg.',
    });
  });

  it('reports a failure of several files as the audio files', async () => {
    // Arrange
    mockNative.chooseAudioFolder.mockRejectedValueOnce(new Error('no access'));
    const hook = renderHook(DOCUMENT);
    await settle(() => hook.current().open());
    await settle(() => hook.current().setOptions({ ...hook.current().options, isPerTrack: true }));

    // Act
    await settle(() => hook.current().start());

    // Assert
    expect(hook.dispatch).toHaveBeenCalledWith({ type: 'exportFailed', what: 'the audio files', message: 'no access' });
  });
});
