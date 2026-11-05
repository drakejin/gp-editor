import { type Song, type StringAddress, type TimeSignature, findNote, otherVoiceOnString } from '@gp-editor/core';
import { t } from '../lib/i18n/i18n';
import { trackLabel } from '../lib/track-label';
import { needsNote } from './note-edits';
import { type SongEdit, cursorVoice, insertedBarIndex, isInTuplet } from './song-edits';
import { voiceMoveHint } from './voice-edits';

/**
 * What a bar inserted into or deleted from one track did, for the hint strip — so it is plain the other tracks were left
 * as they were; undefined for any other edit. `cursor` and `song` as before the edit.
 */
export function trackBarHint(song: Song, cursor: StringAddress, edit: SongEdit): string | undefined {
  const track = song.tracks[cursor.trackIndex];
  if (track === undefined || (edit.type !== 'insertTrackMeasure' && edit.type !== 'deleteTrackMeasure')) {
    return undefined;
  }
  const name = trackLabel(track);
  if (edit.type === 'insertTrackMeasure') {
    return t('palette.hint.trackBarInserted', { number: insertedBarIndex(cursor.measureIndex, edit.position) + 1, track: name });
  }
  const from = edit.from?.measureIndex ?? cursor.measureIndex;
  const [first, last] = [Math.min(from, cursor.measureIndex), Math.max(from, cursor.measureIndex)];
  return first === last
    ? t('palette.hint.trackBarDeleted', { number: first + 1, track: name })
    : t('palette.hint.trackBarsDeleted', { first: first + 1, last: last + 1, count: last - first + 1, track: name });
}

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
  if (edit.type === 'deleteTrackMeasure') {
    return t('palette.hint.trackRests', { number: Math.min(cursor.measureIndex, edit.from?.measureIndex ?? cursor.measureIndex) + 1 });
  }
  if (edit.type === 'deleteNotes') {
    return edit.from === undefined ? noNoteHint(cursor.string) : t('palette.hint.noSelectedNotes');
  }
  const header = song.measureHeaders[cursor.measureIndex];
  const next = header === undefined ? undefined : nextTimeSignature(header.timeSignature, edit);
  if (header === undefined || next === undefined) {
    return undefined;
  }
  const { numerator, denominator } = header.timeSignature;
  const isShorter = next.numerator / next.denominator < numerator / denominator;
  return isShorter ? t('palette.hint.barFull', { number: header.number, meter: `${next.numerator}/${next.denominator}` }) : undefined;
}

/** The time signature a time signature edit asks for; undefined for any other edit. */
function nextTimeSignature(current: TimeSignature, edit: SongEdit): TimeSignature | undefined {
  if (edit.type === 'setTimeSignature') {
    return { numerator: edit.numerator, denominator: edit.denominator };
  }
  if (edit.type !== 'shiftTimeSignature') {
    return undefined;
  }
  const { numerator, denominator } = current;
  return edit.part === 'numerator'
    ? { numerator: numerator + edit.delta, denominator }
    : { numerator, denominator: DENOMINATORS[DENOMINATORS.indexOf(denominator) + edit.delta] ?? denominator };
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

/**
 * Why ⌥↑ / ⌥↓ left the note at the cursor where it was: the string it would go to holds a note on this beat (in any
 * voice), or cannot play its pitch on the neck. Undefined without a note, or past the first or last string.
 */
export function stringMoveHint(song: Song, cursor: StringAddress, string: number): string | undefined {
  const stringCount = song.tracks[cursor.trackIndex]?.strings.length ?? 0;
  if (findNote(song, cursor) === undefined || string < 1 || string > stringCount) {
    return undefined;
  }
  const target = { ...cursor, string };
  const isTaken = findNote(song, target) !== undefined || otherVoiceOnString(song, target) !== undefined;
  return t(isTaken ? 'palette.hint.stringTaken' : 'palette.hint.offNeck', { number: string });
}

/** Why a fret typed at the cursor made no note: another voice sounds that string on the beat; undefined otherwise. */
export function heldStringHint(song: Song, cursor: StringAddress): string | undefined {
  const voiceIndex = findNote(song, cursor) === undefined ? otherVoiceOnString(song, cursor) : undefined;
  return voiceIndex === undefined ? undefined : t('palette.hint.stringInVoice', { voice: voiceIndex + 1, number: cursor.string });
}
