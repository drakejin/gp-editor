import { useMemo } from 'react';
import type { Song } from '@gp-editor/core';
import { PREVIEW_NOTE, previewSound } from '../lib/note-preview';
import { previewNote } from '../native/player';

/**
 * "Preview on hover": what playing a hovered pitch does — a short note with the shown track's sound (its effects too),
 * through the player's engine — or undefined while the setting is off (the instrument views then have no hover areas).
 */
export function useNotePreview(song: Song | undefined, trackIndex: number, isEnabled: boolean): ((pitch: number) => void) | undefined {
  const sound = useMemo(() => (song === undefined ? undefined : previewSound(song, trackIndex)), [song, trackIndex]);
  const midiChannel = sound?.midiChannel;
  const program = sound?.program;
  return useMemo(() => {
    if (!isEnabled || midiChannel === undefined || program === undefined) {
      return undefined;
    }
    return (pitch: number) => {
      // A preview that cannot sound (no engine yet, a bank failing to load) is not worth an error banner.
      previewNote({ midiChannel, program, key: pitch, velocity: PREVIEW_NOTE.velocity, durationMs: PREVIEW_NOTE.durationMs, trackIndex }).catch(() => undefined);
    };
  }, [isEnabled, midiChannel, program, trackIndex]);
}
