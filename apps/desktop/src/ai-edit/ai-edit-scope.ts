import { MAX_TRANSCRIBED_TRACKS, type NoteScope, type Song, isFrettedInstrument, trackInstrumentOf } from '@gp-editor/core';
import type { EditorState } from '../state/editor';
import { transpositionScope } from '../state/transposition';

/** What AI Edit works on: the selected beats, the cursor's track, or every track. */
export type AiEditTarget = 'selection' | 'track' | 'song';

/** gp-core's scope for the exact path, and the bars and tracks Claude rewrites. */
export interface AiEditRange {
  readonly scope: NoteScope;
  /** 0-based, the first and last bar rewritten. */
  readonly firstBar: number;
  readonly lastBar: number;
  /** The tracks Claude may write: the selection's or the cursor's, or every track the contract can name. */
  readonly trackIndexes: readonly number[];
}

type RangeState = Pick<EditorState, 'cursor' | 'selectionAnchor' | 'trackIndex'>;

/** The range a target names in this score; undefined for the selection when nothing is selected. */
export function aiEditRangeOf(state: RangeState, song: Song, target: AiEditTarget): AiEditRange | undefined {
  const lastBar = Math.max(0, song.measureHeaders.length - 1);
  if (target === 'song') {
    const trackIndexes = song.tracks.map((_, trackIndex) => trackIndex).filter((trackIndex) => trackIndex < MAX_TRANSCRIBED_TRACKS);
    return { scope: { kind: 'song' }, firstBar: 0, lastBar, trackIndexes };
  }
  if (target === 'track') {
    const trackIndex = state.cursor?.trackIndex ?? state.trackIndex;
    return { scope: { kind: 'track', trackIndex }, firstBar: 0, lastBar, trackIndexes: [trackIndex] };
  }
  const scope = transpositionScope(state, 'selection');
  if (scope?.kind !== 'beats') {
    return undefined;
  }
  const bars = [scope.from.measureIndex, scope.to.measureIndex];
  return { scope, firstBar: Math.min(...bars), lastBar: Math.max(...bars), trackIndexes: [scope.from.trackIndex] };
}

/** The range's tracks Claude re-fingers: the guitars, basses, ukuleles and banjos. */
export function fingeringTracks(song: Song, range: AiEditRange): readonly number[] {
  return range.trackIndexes.filter((trackIndex) => {
    const instrument = trackInstrumentOf(song, trackIndex);
    return instrument !== undefined && isFrettedInstrument(instrument);
  });
}
