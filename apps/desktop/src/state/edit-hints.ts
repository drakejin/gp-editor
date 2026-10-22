import type { Song, StringAddress } from '@gp-editor/core';
import type { SongEdit } from './song-edits';

/** The note values a time signature's beat can be, in order (÷ steps through them). */
const DENOMINATORS: readonly number[] = [1, 2, 4, 8, 16, 32, 64];

/**
 * Why an edit at the cursor left the song as it was, when the reason is not obvious from the screen — so a button
 * never seems to do nothing. Undefined when there is nothing to explain.
 */
export function refusalHint(song: Song, cursor: StringAddress, edit: SongEdit): string | undefined {
  if (edit.type !== 'shiftTimeSignature') {
    return undefined;
  }
  const header = song.measureHeaders[cursor.measureIndex];
  if (header === undefined) {
    return undefined;
  }
  const { numerator, denominator } = header.timeSignature;
  const denominatorIndex = DENOMINATORS.indexOf(denominator);
  const next =
    edit.part === 'numerator'
      ? { numerator: numerator + edit.delta, denominator }
      : { numerator, denominator: DENOMINATORS[denominatorIndex + edit.delta] ?? denominator };
  const isShorter = next.numerator / next.denominator < numerator / denominator;
  return isShorter ? `Bar ${header.number} is full: its notes do not fit in ${next.numerator}/${next.denominator}. Delete or shorten beats first.` : undefined;
}
