import { useEffect, useRef } from 'react';
import { type Song, type TrackIndexMap, isIdentityTrackMap, matchTrackIndexes } from '@gp-editor/core';

interface Followed {
  readonly song?: Song;
  readonly tabId?: string;
}

/**
 * Calls `onRemap` when the shown tab's song gets tracks added, deleted, duplicated or moved (an edit, an undo or a redo),
 * not when another tab is shown: what the window keeps by track index outside the editor state (the line in's lock)
 * follows its track.
 */
export function useTrackRemaps(song: Song | undefined, tabId: string | undefined, onRemap: (map: TrackIndexMap) => void): void {
  const followed = useRef<Followed>({ song, tabId });
  // The latest callback, so an inline function does not run the effect again.
  const latest = useRef(onRemap);
  latest.current = onRemap;
  useEffect(() => {
    const before = followed.current;
    followed.current = { song, tabId };
    if (before.tabId !== tabId || before.song === undefined || song === undefined || before.song.tracks === song.tracks) {
      return;
    }
    const map = matchTrackIndexes(before.song, song);
    if (!isIdentityTrackMap(map, song.tracks.length)) {
      latest.current(map);
    }
  }, [song, tabId]);
}
