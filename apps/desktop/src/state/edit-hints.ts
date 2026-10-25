import { type Song, type StringAddress, findNote } from '@gp-editor/core';
import { t } from '../lib/i18n/i18n';
import { needsNote } from './note-edits';
import { type SongEdit, cursorVoice, isInTuplet } from './song-edits';
import { voiceMoveHint } from './voice-edits';

/** The note values a time signature's beat can be, in order (÷ steps through them). */
const DENOMINATORS: readonly number[] = [1, 2, 4, 8, 16, 32, 64];

/**
 * Why an edit at the cursor left the song as it was, when the reason is not obvious from the screen — so a button
 * never seems to do nothing. Undefined when there is nothing to explain.
 */
export function refusalHint(song: Song, cursor: StringAddress, edit: SongEdit): string | undefined {
  if (needsNote(edit) && findNote(song, cursor) === undefined) {
    return noNoteHint(cursor.string);
  }
  if (edit.type === 'setInnerTuplet' || edit.type === 'toggleInnerTriplet') {
    return innerTupletHint(song, cursor);
  }
  if (edit.type === 'moveToVoice') {
    return voiceMoveHint(song, cursor, edit);
  }
  if (edit.type === 'deleteMeasure') {
    // − Bar changes nothing only where it would delete every bar.
    return t('palette.hint.lastBar');
  }
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
  return isShorter ? t('palette.hint.barFull', { number: header.number, meter: `${next.numerator}/${next.denominator}` }) : undefined;
}

/** An inner tuplet on a beat that is in no tuplet (or has no beat in the cursor's voice). */
function innerTupletHint(song: Song, cursor: StringAddress): string | undefined {
  const voice = cursorVoice(song, cursor);
  return voice === undefined || voice.isEmpty || isInTuplet(voice.duration) ? undefined : t('palette.hint.innerTuplet');
}

/** A note key (R, S, H … B, C) on a string with no note at the cursor. */
export function noNoteHint(stringNumber: number): string {
  return t('palette.hint.noNote', { number: stringNumber });
}
