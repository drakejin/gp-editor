import { MAX_COMPOSED_BARS, type Song } from '@gp-editor/core';
import { trackBarText, trackNotationOf } from '../compose/score-notation';

/** Bars one request rewrites, 0-based, first and last. */
export interface BarChunk {
  readonly first: number;
  readonly last: number;
}

/**
 * Characters of score text (the compose notation) one request rewrites at most: its answer, as write_bars' JSON, runs
 * about two tokens a character, so a part of this size asks for ~13,000 tokens of tool input — with the thinking,
 * well within the 64,000-token answer — and is written out whole within the score text's budget.
 */
export const CHUNK_TEXT_BUDGET = 6000;

/**
 * The range in parts, in order: each as many bars as fit in `budget` characters of the tracks' own score text (a bar
 * longer than that alone in its part), at most MAX_COMPOSED_BARS bars.
 */
export function planChunks(song: Song, firstBar: number, lastBar: number, trackIndexes: readonly number[], budget = CHUNK_TEXT_BUDGET): readonly BarChunk[] {
  const notations = trackIndexes.map((trackIndex) => trackNotationOf(song, trackIndex));
  const barLength = (measureIndex: number) => notations.reduce((sum, notation) => sum + (trackBarText(song, notation, measureIndex)?.length ?? 0), 0);
  const chunks: BarChunk[] = [];
  let first = firstBar;
  let length = 0;
  for (let measureIndex = firstBar; measureIndex <= lastBar; measureIndex++) {
    const added = barLength(measureIndex);
    const isFull = measureIndex > first && (length + added > budget || measureIndex - first >= MAX_COMPOSED_BARS);
    if (isFull) {
      chunks.push({ first, last: measureIndex - 1 });
      first = measureIndex;
      length = 0;
    }
    length += added;
  }
  return lastBar < firstBar ? [] : [...chunks, { first, last: lastBar }];
}
