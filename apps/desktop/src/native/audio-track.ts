import { NativeEventEmitter, NativeModules } from 'react-native';

/** A kept audio file (GPAudioAssets.m): its id, length and format. */
export interface AudioFileInfo {
  readonly assetId: string;
  readonly durationSeconds: number;
  readonly sampleRate: number;
  readonly channelCount: number;
}

/** A file picked for Track ▸ Add Audio Track…, kept. */
export interface ChosenAudioFile extends AudioFileInfo {
  readonly fileName: string;
  /** Lower case, without the dot. */
  readonly extension: string;
}

/** The waveform as the native side sends it: min and max per bucket as signed bytes, base64. */
export interface NativeAudioPeaks {
  readonly bucketsPerSecond: number;
  readonly durationSeconds: number;
  readonly peaks: string;
}

interface GPAudioTrackModule {
  loadData(base64: string, extension: string): Promise<AudioFileInfo>;
  chooseFile(isReplacing: boolean): Promise<ChosenAudioFile | null>;
  data(assetId: string): Promise<string>;
  peaks(assetId: string): Promise<NativeAudioPeaks>;
}

/**
 * JS side of macos/GPEditor-macOS/GPAudioTrack.m: the audio track's files live natively, keyed by an id (the model holds
 * only the id); a .gp file's audio crosses the bridge once per document, and back once per save.
 */
const native = NativeModules.GPAudioTrack as GPAudioTrackModule | undefined;

/** The ids the native side keeps a file for in this run (playback sends only those: another one would fail). */
const loadedAssetIds = new Set<string>();

function remember<T extends AudioFileInfo | null>(info: T): T {
  if (info !== null) {
    loadedAssetIds.add(info.assetId);
  }
  return info;
}

/** Whether the native side keeps the file of this id (it was loaded or picked in this run of the app). */
export function isAudioLoaded(assetId: string): boolean {
  return loadedAssetIds.has(assetId);
}

function requireNative(): GPAudioTrackModule {
  if (native === undefined) {
    throw new Error('The audio track is not available on this platform');
  }
  return native;
}

/** Keeps a .gp file's audio (base64) natively; its id and format. Rejects when macOS cannot play it. */
export function loadAudioData(base64: string, extension: string): Promise<AudioFileInfo> {
  return native === undefined ? Promise.reject(new Error('The audio track is not available on this platform')) : native.loadData(base64, extension).then(remember);
}

/** Track ▸ Add Audio Track…: asks first when replacing, then an open panel; null when cancelled. */
export function chooseAudioFile(isReplacing: boolean): Promise<ChosenAudioFile | null> {
  return requireNative().chooseFile(isReplacing).then(remember);
}

/** A kept file's bytes as base64 (for a .gp save). */
export function audioData(assetId: string): Promise<string> {
  return native === undefined ? Promise.reject(new Error('The audio track is not available on this platform')) : native.data(assetId);
}

/** A kept file's waveform, computed once natively (untrusted until parseAudioPeaks checks it). */
export function audioPeaks(assetId: string): Promise<NativeAudioPeaks> {
  return native === undefined ? Promise.reject(new Error('The audio track is not available on this platform')) : native.peaks(assetId);
}

/** Track ▸ Add Audio Track… (the "addAudioTrackRequested" event); returns the unsubscribe function. */
export function subscribeAddAudioTrackRequests(listener: () => void): () => void {
  if (native === undefined) {
    return () => undefined;
  }
  const subscription = new NativeEventEmitter(NativeModules.GPAudioTrack).addListener('addAudioTrackRequested', listener);
  return () => subscription.remove();
}
