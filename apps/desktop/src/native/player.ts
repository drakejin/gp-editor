import { NativeModules } from 'react-native';

export interface PlayerPosition {
  readonly seconds: number;
  readonly isPlaying: boolean;
}

interface GPPlayerModule {
  play(base64Midi: string, fromSeconds: number): Promise<void>;
  stop(): Promise<void>;
  position(): Promise<PlayerPosition>;
}

/** JS side of macos/GPEditor-macOS/GPPlayer.m (AVMIDIPlayer with the macOS General MIDI sound bank). */
const native = NativeModules.GPPlayer as GPPlayerModule | undefined;

function requireNative(): GPPlayerModule {
  if (native === undefined) {
    throw new Error('GPPlayer native module is not available on this platform');
  }
  return native;
}

export function playMidi(base64Midi: string, fromSeconds = 0): Promise<void> {
  return requireNative().play(base64Midi, fromSeconds);
}

export function stopMidi(): Promise<void> {
  return native === undefined ? Promise.resolve() : native.stop();
}

export function playerPosition(): Promise<PlayerPosition> {
  return native === undefined ? Promise.resolve({ seconds: 0, isPlaying: false }) : native.position();
}
