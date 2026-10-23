import { NativeEventEmitter, NativeModules } from 'react-native';
import type { MixLayout } from '../lib/mix';

/** Where the line in plays: an input device (empty: the system's default), the track whose effects it goes through. */
export interface LineInSettings {
  readonly deviceId: string;
  readonly trackIndex: number;
  /** −24…+24 dB. */
  readonly gainDb: number;
  readonly isMonitoring: boolean;
}

interface GPPlayerEffectsModule {
  setMix(mix: MixLayout): Promise<void>;
  lineInDevices(): Promise<unknown>;
  startLineIn(settings: LineInSettings): Promise<void>;
  updateLineIn(settings: LineInSettings): Promise<void>;
  stopLineIn(): Promise<void>;
  lineInLevel(): Promise<number>;
}

/**
 * JS side of the effects and line in of macos/GPEditor-macOS/GPPlayer.m (GPMixGraph, GPLineIn on GPMidiEngine), and
 * the View ▸ Mixer ("mixerRequested") and Tools ▸ Line In… ("lineInRequested") menu commands.
 */
const native = NativeModules.GPPlayer as GPPlayerEffectsModule | undefined;

/** The song's effects, heard at once while it plays and kept for the next plays; a no-op without the native module. */
export function setPlayerMix(mix: MixLayout): Promise<void> {
  return native === undefined ? Promise.resolve() : native.setMix(mix);
}

/** The audio inputs (untrusted until parseLineInDevices checks them); none without the native module. */
export function loadLineInDevices(): Promise<unknown> {
  return native === undefined ? Promise.resolve({ devices: [], defaultId: '', isOutputBuiltIn: false }) : native.lineInDevices();
}

/** Starts the line in, asking for microphone access first; rejects when access is off or the input cannot open. */
export function startLineIn(settings: LineInSettings): Promise<void> {
  return native === undefined ? Promise.reject(new Error('The audio input is not available on this platform.')) : native.startLineIn(settings);
}

export function updateLineIn(settings: LineInSettings): Promise<void> {
  return native === undefined ? Promise.resolve() : native.updateLineIn(settings);
}

export function stopLineIn(): Promise<void> {
  return native === undefined ? Promise.resolve() : native.stopLineIn();
}

/** The input's peak since the last call, in dBFS (−120: silence or off). */
export function lineInLevel(): Promise<number> {
  return native === undefined ? Promise.resolve(-120) : native.lineInLevel();
}

function subscribe(event: string, listener: () => void): () => void {
  if (native === undefined) {
    return () => undefined;
  }
  const subscription = new NativeEventEmitter(NativeModules.GPPlayer).addListener(event, listener);
  return () => subscription.remove();
}

/** View ▸ Mixer; returns the unsubscribe function. */
export function subscribeMixerRequests(onMixerRequested: () => void): () => void {
  return subscribe('mixerRequested', onMixerRequested);
}

/** Tools ▸ Line In…; returns the unsubscribe function. */
export function subscribeLineInRequests(onLineInRequested: () => void): () => void {
  return subscribe('lineInRequested', onLineInRequested);
}
