import { NativeModules } from 'react-native';
import type { AudioFileSettings } from '../export/audio-formats';
import type { AudioPlayback } from '../lib/audio-track';
import type { MixLayout } from '../lib/mix';
import { subscribeNativeEvents } from './native-events';

/** One file to render and write: its MIDI (base64, gp-core's renderMidi), the song's length, the path chosen. */
export interface AudioExportJobFile {
  readonly midi: string;
  readonly seconds: number;
  readonly path: string;
  /** The audio track under it (GPAudioTrackPlayer's playback dictionary); absent without one. */
  readonly audio?: AudioPlayback;
}

export interface AudioExportJob {
  readonly files: readonly AudioExportJobFile[];
  /** The song's effects, as playback plays them. */
  readonly mix: MixLayout;
  readonly settings: AudioFileSettings;
}

/** What was written: each file with its length, the tail included. */
export interface ExportedAudio {
  readonly files: readonly { readonly name: string; readonly path: string; readonly seconds: number }[];
}

/** The file being rendered (0-based) and how much of its song is done (0–1). */
export interface AudioExportProgress {
  readonly fileIndex: number;
  readonly fileCount: number;
  readonly fraction: number;
}

/** The folder chosen for one file per track. */
export interface ChosenFolder {
  readonly folder: string;
  readonly folderName: string;
}

interface GPAudioExportModule {
  exportAudio(job: AudioExportJob): Promise<ExportedAudio | null>;
  cancelAudioExport(): Promise<void>;
  chooseFolder(fileNames: readonly string[]): Promise<ChosenFolder | null>;
}

/**
 * JS side of macos/GPEditor-macOS/GPAudioExport.m: renders each file offline through the playback graph and encodes
 * it (GPAudioExporter), sending "audioExportProgress" events.
 */
const native = NativeModules.GPAudioExport as GPAudioExportModule | undefined;

function requireNative(): GPAudioExportModule {
  if (native === undefined) {
    // i18n-exempt: a developer's diagnostic naming the native module
    throw new Error('GPAudioExport native module is not available on this platform');
  }
  return native;
}

/** Renders and writes the files; null when cancelled (the file being written is removed). */
export function exportAudio(job: AudioExportJob): Promise<ExportedAudio | null> {
  return requireNative().exportAudio(job);
}

export function cancelAudioExport(): Promise<void> {
  return native === undefined ? Promise.resolve() : native.cancelAudioExport();
}

/** An open panel for the folder of one file per track (asking before files there are replaced); null when cancelled. */
export function chooseAudioFolder(fileNames: readonly string[]): Promise<ChosenFolder | null> {
  return requireNative().chooseFolder(fileNames);
}

/** The progress events of the running export (the native values checked); returns the unsubscribe function. */
export function subscribeAudioExportProgress(listener: (progress: AudioExportProgress) => void): () => void {
  return subscribeNativeEvents(native, {
    audioExportProgress: (event: Partial<AudioExportProgress>) => {
      const { fileIndex, fileCount, fraction } = event;
      if (typeof fileIndex === 'number' && typeof fileCount === 'number' && typeof fraction === 'number') {
        listener({ fileIndex, fileCount, fraction: Math.min(1, Math.max(0, fraction)) });
      }
    },
  });
}
