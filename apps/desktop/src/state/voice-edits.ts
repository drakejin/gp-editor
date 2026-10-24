import { type Song, type StringAddress, copyBeats, findNote, findVoice, moveBeatsToVoice, moveNotesToVoice } from '@gp-editor/core';
import { t } from '../lib/i18n/i18n';
import type { BeatPlace } from './mark-edits';

/**
 * Guitar Pro 8's Move Voice (⌥1–⌥4, the palette's ⇄): the note at the cursor — every note of its beat when the
 * cursor's string has none, every note of the selected beats from `from` (the selection's start) — to voice
 * `voiceIndex`, at the same time and for as long. The cursor stays in its voice.
 */
export type VoiceEdit = { readonly type: 'moveToVoice'; readonly voiceIndex: number; readonly from?: BeatPlace };

export function applyVoiceEdit(song: Song, cursor: StringAddress, edit: VoiceEdit): Song {
  if (edit.from !== undefined) {
    return moveBeatsToVoice(song, { ...cursor, ...edit.from }, cursor, edit.voiceIndex);
  }
  const strings = findNote(song, cursor) === undefined ? undefined : [cursor.string];
  return moveNotesToVoice(song, cursor, edit.voiceIndex, strings);
}

/** Why a move changed nothing. */
export function voiceMoveHint(song: Song, cursor: StringAddress, edit: VoiceEdit): string {
  if (edit.voiceIndex === cursor.voiceIndex) {
    return t('palette.hint.voiceAlready', { number: edit.voiceIndex + 1 });
  }
  const voice = findVoice(song, cursor);
  if (edit.from !== undefined) {
    const fragment = copyBeats(song, { ...cursor, ...edit.from }, cursor);
    return fragment.items.some((item) => item.notes.length > 0) ? t('palette.hint.voiceBusy', { number: edit.voiceIndex + 1 }) : t('palette.hint.noNoteInSelection');
  }
  if (voice === undefined || voice.notes.length === 0) {
    return voice?.isEmpty === false ? t('palette.hint.noNoteRest') : t('palette.hint.noNoteInVoice', { number: cursor.voiceIndex + 1 });
  }
  return t('palette.hint.voiceBusy', { number: edit.voiceIndex + 1 });
}
