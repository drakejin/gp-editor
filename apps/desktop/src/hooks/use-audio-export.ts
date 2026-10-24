import { type Dispatch, useCallback, useEffect, useRef, useState } from 'react';
import type { Song } from '@gp-editor/core';
import { type AudioExportFile, audioSavedHint, planAudioExport, renderAudioFile } from '../export/audio-export-plan';
import { type AudioExportOptions, DEFAULT_AUDIO_EXPORT, audioFileSettings, audioFormat } from '../export/audio-formats';
import { errorMessage } from '../lib/errors';
import { t } from '../lib/i18n/i18n';
import { mixOf } from '../lib/mix';
import { cancelAudioExport, chooseAudioFolder, exportAudio, subscribeAudioExportProgress } from '../native/audio-export';
import { isAudioLoaded } from '../native/audio-track';
import { showSavePanel, subscribeExportAudioRequests } from '../native/gp-files';
import type { EditorAction, OpenDocument } from '../state/editor';
import type { PracticeSettings } from '../state/practice';

/** Where the export stands: a save or folder panel up, files rendering (with their progress), stopping. */
export type AudioExportStatus =
  | { readonly kind: 'idle' }
  | { readonly kind: 'choosing' }
  | { readonly kind: 'rendering'; readonly fileIndex: number; readonly fileCount: number; readonly fraction: number }
  | { readonly kind: 'cancelling' };

export interface AudioExport {
  readonly isOpen: boolean;
  /** The panel's settings, kept for the session. */
  readonly options: AudioExportOptions;
  readonly status: AudioExportStatus;
  /** File ▸ Export Audio… and the command palette: the panel, on the loop's bars when the loop is on. */
  readonly open: () => void;
  /** Closes the panel, cancelling a running export. */
  readonly close: () => void;
  readonly setOptions: (options: AudioExportOptions) => void;
  /** Asks where to save, then renders and writes the files; the panel closes once they are written. */
  readonly start: () => void;
  readonly cancel: () => void;
}

const IDLE: AudioExportStatus = { kind: 'idle' };

/** The paths the files go to, and the folder the hint names; null when the panel was cancelled. */
interface Destination {
  readonly paths: readonly string[];
  readonly folderName: string;
}

function parentName(path: string): string {
  const parts = path.split('/').filter((part) => part !== '');
  return parts[parts.length - 2] ?? '/';
}

/** One file: the save panel with the format's extension. Several: a folder (the sandbox lets the app write only what the user chose). */
async function chooseDestination(files: readonly AudioExportFile[], options: AudioExportOptions): Promise<Destination | null> {
  if (options.isPerTrack) {
    const chosen = await chooseAudioFolder(files.map((file) => file.name));
    return chosen === null ? null : { paths: files.map((file) => `${chosen.folder}/${file.name}`), folderName: chosen.folderName };
  }
  const format = audioFormat(options.formatId);
  const chosen = await showSavePanel({ suggestedName: files[0]?.name ?? '', formats: [format], formatId: format.id });
  return chosen === null ? null : { paths: [chosen.path], folderName: parentName(chosen.path) };
}

/**
 * Renders the MIDI of each file (the whole mix with the audio track under it when its file is loaded) and sends the
 * job; resolves the hint to show, or undefined when cancelled.
 */
async function runExport(song: Song, files: readonly AudioExportFile[], options: AudioExportOptions, destination: Destination): Promise<string | undefined> {
  const hasAudio = song.audioTrack !== undefined && isAudioLoaded(song.audioTrack.assetId);
  const job = {
    files: files.map((file, index) => ({ ...renderAudioFile(song, file, hasAudio), path: destination.paths[index] ?? '' })),
    mix: mixOf(song),
    settings: audioFileSettings(options),
  };
  const written = await exportAudio(job);
  return written === null ? undefined : audioSavedHint(written.files, destination.folderName, options);
}

/**
 * File ▸ Export Audio… for the shown tab: the panel's settings, the save or folder panel, the native render with its
 * progress and Cancel, the hint strip saying what was written, and the error banner (`exportFailed`) when it fails.
 */
export function useAudioExport(document: OpenDocument | undefined, practice: PracticeSettings, dispatch: Dispatch<EditorAction>): AudioExport {
  const [isOpen, setIsOpen] = useState(false);
  const [options, setOptions] = useState<AudioExportOptions>(DEFAULT_AUDIO_EXPORT);
  const [status, setStatus] = useState<AudioExportStatus>(IDLE);
  // Read through refs, so a run keeps the song and settings it started with and the menu listener is added once.
  const latest = useRef({ document, practice, options });
  latest.current = { document, practice, options };
  const isRunning = useRef(false);
  const hasDocument = document !== undefined;

  const open = useCallback(() => {
    const { practice: current } = latest.current;
    setOptions((previous) => ({ ...previous, range: current.isLooping && current.loop !== undefined ? 'loop' : 'song' }));
    setIsOpen(latest.current.document !== undefined);
  }, []);
  useEffect(() => subscribeExportAudioRequests(open), [open]);

  const cancel = useCallback(() => {
    setStatus((previous) => (previous.kind === 'rendering' ? { kind: 'cancelling' } : previous));
    cancelAudioExport().catch(() => undefined);
  }, []);
  const close = useCallback(() => {
    if (isRunning.current) {
      cancel();
    }
    setIsOpen(false);
  }, [cancel]);

  const isRendering = status.kind === 'rendering';
  useEffect(() => {
    if (!isRendering) {
      return undefined;
    }
    return subscribeAudioExportProgress((progress) => setStatus((previous) => (previous.kind === 'rendering' ? { kind: 'rendering', ...progress } : previous)));
  }, [isRendering]);

  const start = useCallback(() => {
    const { document: current, practice: settings, options: chosen } = latest.current;
    const files = current === undefined ? [] : planAudioExport(current.song, current.fileName, chosen, settings.loop);
    if (current === undefined || files.length === 0 || isRunning.current) {
      return;
    }
    isRunning.current = true;
    setStatus({ kind: 'choosing' });
    const run = async () => {
      const destination = await chooseDestination(files, chosen);
      if (destination === null) {
        return;
      }
      setStatus({ kind: 'rendering', fileIndex: 0, fileCount: files.length, fraction: 0 });
      const hint = await runExport(current.song, files, chosen, destination);
      dispatch({ type: 'showHint', hint: hint ?? t('window.audioExport.cancelled') });
      if (hint !== undefined) {
        setIsOpen(false);
      }
    };
    run()
      .catch((error: unknown) => dispatch({ type: 'exportFailed', what: chosen.isPerTrack ? t('window.exportWhat.audioFiles') : t('window.exportWhat.audioFile'), message: errorMessage(error) }))
      .finally(() => {
        isRunning.current = false;
        setStatus(IDLE);
      });
  }, [dispatch]);

  return { isOpen: isOpen && hasDocument, options, status, open, close, setOptions, start, cancel };
}
