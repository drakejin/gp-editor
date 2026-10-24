import { NativeEventEmitter, NativeModules } from 'react-native';

/** The Track menu's commands on the shown track (AppDelegate.swift, forwarded by GPAudioTrack.m with the audio track's). */
export type TrackMenuCommand = 'add' | 'duplicate' | 'delete' | 'moveUp' | 'moveDown';

const TRACK_MENU_COMMANDS: readonly TrackMenuCommand[] = ['add', 'duplicate', 'delete', 'moveUp', 'moveDown'];

/** The command a "trackCommandRequested" event names; undefined for anything else (the body is untrusted). */
export function parseTrackMenuCommand(body: unknown): TrackMenuCommand | undefined {
  const command: unknown = typeof body === 'object' && body !== null && 'command' in body ? body.command : undefined;
  return TRACK_MENU_COMMANDS.find((candidate) => candidate === command);
}

/** Track ▸ Add Track… (⌥⌘N), Duplicate Track, Delete Track (⌥⌘R), Move Track Up / Down; returns the unsubscribe function. */
export function subscribeTrackMenuCommands(listener: (command: TrackMenuCommand) => void): () => void {
  if (NativeModules.GPAudioTrack === undefined) {
    return () => undefined;
  }
  const subscription = new NativeEventEmitter(NativeModules.GPAudioTrack).addListener('trackCommandRequested', (body: unknown) => {
    const command = parseTrackMenuCommand(body);
    if (command !== undefined) {
      listener(command);
    }
  });
  return () => subscription.remove();
}
