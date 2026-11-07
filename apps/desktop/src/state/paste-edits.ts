import { type BeatFragment, type PastedBeats, type Song, type StringAddress, insertMeasure, pasteBeats } from '@gp-editor/core';
import { t } from '../lib/i18n/i18n';
import { clampCursor } from '../lib/navigation';
import type { ClipboardEdit } from './selection';
import { beatAddress } from './song-edits';

// ⌘V at the cursor (cursor-edits.ts runs it as one undo step): gp-core's pasteBeats, the cursor moved on past the pasted
// beats, and the hint strip saying what was written where and how the notes went onto the track.

function trackName(song: Song, trackIndex: number): string {
  const track = song.tracks[trackIndex];
  return track === undefined ? '' : track.name.trim() || t('common.trackNumber', { number: track.number });
}

/** How the notes went onto the track, when it was not as they were copied; undefined when they were. */
function mappingHint(pasted: PastedBeats): string | undefined {
  switch (pasted.mapping) {
    case 'byPitch':
      return t('palette.hint.pasteByPitch');
    case 'pitchedToDrums':
      return t('palette.hint.pastePitchesAsDrums');
    case 'drumsToPitched':
      return t('palette.hint.pasteDrumsAsPitches');
    case 'rhythmOnly':
      return t('palette.hint.pasteRhythmOnly');
    case 'asCopied':
      return undefined;
  }
}

/** Why notes were left out, by how they went onto the track; undefined when none were (or a rhythm-only paste, which says so). */
function leftOutHint(pasted: PastedBeats, track: string): string | undefined {
  const count = pasted.leftOut;
  if (count === 0 || pasted.mapping === 'rhythmOnly') {
    return undefined;
  }
  if (pasted.mapping === 'asCopied') {
    return t('palette.hint.pasteLeftOutStrings', { count, track });
  }
  return t(pasted.mapping === 'pitchedToDrums' ? 'palette.hint.pasteLeftOutDrums' : 'palette.hint.pasteLeftOutChords', { count, track });
}

/**
 * "5 beats pasted over bars 2–3 of Guitar.", the bars added at the end, how the notes went onto the track (by pitch,
 * drums ↔ pitches, the rhythm only) and what moved by octaves or was left out.
 */
function pasteHint(song: Song, trackIndex: number, count: number, pasted: PastedBeats): string {
  const track = trackName(song, trackIndex);
  const first = pasted.at.measureIndex + 1;
  const last = pasted.lastMeasureIndex + 1;
  const over = first === last ? t('palette.hint.pastedInBar', { count, bar: first, track }) : t('palette.hint.pastedInBars', { count, first, last, track });
  const notes = [
    pasted.addedBars > 0 ? t('palette.hint.pasteAddedBars', { count: pasted.addedBars }) : undefined,
    mappingHint(pasted),
    pasted.octaveShifted > 0 ? t('palette.hint.pasteOctaveShifted', { count: pasted.octaveShifted }) : undefined,
    leftOutHint(pasted, track),
  ];
  return [over, ...notes.filter((note): note is string => note !== undefined)].join(' ');
}

/**
 * ⌘V: Guitar Pro 8's single track paste (gp-core pasteBeats) — written over the cursor's track and voice from the
 * cursor, the notes onto that track's strings (by pitch, drums by MIDI number), no other track changed; bars added at
 * the end for what runs past it. The cursor goes to the beat right after the pasted beats — onto a bar added at the end
 * when they end the song —, so ⌘V, ⌘V, ⌘V lays copies one after another; a paste of what was there is a step too. The
 * hint says what was written where; nothing is refused but a paste with nothing to write, which the hint explains.
 */
export function pasteBeatsAt(song: Song, cursor: StringAddress, fragment: BeatFragment): ClipboardEdit {
  const pasted = pasteBeats(song, beatAddress(cursor), fragment);
  const bar = cursor.measureIndex + 1;
  if (!pasted.isPasted) {
    return { song, cursor, hint: t(fragment.items.length === 0 ? 'palette.hint.pasteNoBeats' : 'palette.hint.pasteUnreadable', { bar }) };
  }
  // The song's last beat pasted over: a bar to go on in, in the same undo step (as MIDI step entry does).
  const lastIndex = pasted.song.measureHeaders.length - 1;
  const written = pasted.next === undefined ? insertMeasure(pasted.song, lastIndex, 'after') : pasted.song;
  const next = pasted.next ?? { measureIndex: lastIndex + 1, beatIndex: 0 };
  const moved = clampCursor(written, { ...cursor, measureIndex: next.measureIndex, beatIndex: next.beatIndex }) ?? cursor;
  const counted = { ...pasted, addedBars: pasted.addedBars + (pasted.next === undefined ? 1 : 0) };
  return { song: written, cursor: moved, hint: pasteHint(written, cursor.trackIndex, fragment.items.length, counted), isStep: true };
}
