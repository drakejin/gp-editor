import { useCallback, useEffect, useRef } from 'react';
import type { Song } from '@gp-editor/core';
import { type MixLayout, type MixPreview, isSameMixLayout, mixOf, withPreview } from '../lib/mix';
import { setPlayerMix } from '../native/audio-effects';

/**
 * Keeps the playback engine's effects on the shown song's (sent when a track's chain or the master changes, and when
 * another song is shown), and plays a slider's value while it is dragged: `preview` sends the mix with it in place,
 * `preview(undefined)` the song's own again (the drag ended on the value it started from).
 */
export function useMixSync(song: Song | undefined): (preview: MixPreview | undefined) => void {
  const sent = useRef<MixLayout | undefined>(undefined);
  useEffect(() => {
    if (song === undefined) {
      return;
    }
    const mix = mixOf(song);
    if (sent.current !== undefined && isSameMixLayout(sent.current, mix)) {
      return;
    }
    sent.current = mix;
    // The engine keeps playing as it was when this fails; nothing to tell the user beyond the sound.
    setPlayerMix(mix).catch(() => undefined);
  }, [song]);
  return useCallback((preview: MixPreview | undefined) => {
    const mix = sent.current;
    if (mix !== undefined) {
      setPlayerMix(preview === undefined ? mix : withPreview(mix, preview)).catch(() => undefined);
    }
  }, []);
}
