import { type Song, type StringAddress, findNote, findVoice, moveNotesToVoice } from '@gp-editor/core';
import type { BeatPlace } from './mark-edits';

/**
 * Guitar Pro 8's Move Voice (⌥1–⌥4, the palette's ⇄): the note at the cursor — every note of its beat when the
 * cursor's string has none, every note of the selected beats from `from` (the selection's start) — to voice
 * `voiceIndex`, at the same time and for as long. The cursor stays in its voice.
 */
export type VoiceEdit = { readonly type: 'moveToVoice'; readonly voiceIndex: number; readonly from?: BeatPlace };

function isBefore(a: BeatPlace, b: BeatPlace): boolean {
  return a.measureIndex < b.measureIndex || (a.measureIndex === b.measureIndex && a.beatIndex < b.beatIndex);
}

/** Where each beat from `first` to `last` (inclusive) of the cursor's track starts, bar by bar. */
function beatStarts(song: Song, trackIndex: number, first: BeatPlace, last: BeatPlace): readonly { readonly measureIndex: number; readonly start: number }[] {
  const measures = song.tracks[trackIndex]?.measures ?? [];
  return measures.slice(first.measureIndex, last.measureIndex + 1).flatMap((measure, offset) => {
    const measureIndex = first.measureIndex + offset;
    return measure.beats.flatMap((beat, beatIndex) => {
      const place = { measureIndex, beatIndex };
      return isBefore(place, first) || isBefore(last, place) ? [] : [{ measureIndex, start: beat.start }];
    });
  });
}

/** Every note of the selected beats moved, beat by beat (a beat is found again by where it starts, as moves add rests). */
function moveSelection(song: Song, cursor: StringAddress, from: BeatPlace, voiceIndex: number): Song {
  const [first, last] = isBefore(cursor, from) ? [cursor, from] : [from, cursor];
  return beatStarts(song, cursor.trackIndex, first, last).reduce((current, { measureIndex, start }) => {
    const beatIndex = current.tracks[cursor.trackIndex]?.measures[measureIndex]?.beats.findIndex((beat) => beat.start === start) ?? -1;
    return beatIndex < 0 ? current : moveNotesToVoice(current, { ...cursor, measureIndex, beatIndex }, voiceIndex);
  }, song);
}

export function applyVoiceEdit(song: Song, cursor: StringAddress, edit: VoiceEdit): Song {
  if (edit.from !== undefined) {
    return moveSelection(song, cursor, edit.from, edit.voiceIndex);
  }
  const strings = findNote(song, cursor) === undefined ? undefined : [cursor.string];
  return moveNotesToVoice(song, cursor, edit.voiceIndex, strings);
}

/** Why a move changed nothing. */
export function voiceMoveHint(song: Song, cursor: StringAddress, edit: VoiceEdit): string {
  if (edit.voiceIndex === cursor.voiceIndex) {
    return `The notes are in voice ${edit.voiceIndex + 1} already.`;
  }
  const voice = findVoice(song, cursor);
  if (edit.from === undefined && (voice === undefined || voice.notes.length === 0)) {
    return voice?.isEmpty === false ? 'No note to move: the cursor’s beat is a rest.' : `No note to move: voice ${cursor.voiceIndex + 1} has nothing at the cursor.`;
  }
  return `Voice ${edit.voiceIndex + 1} plays something else there: nothing moved.`;
}
