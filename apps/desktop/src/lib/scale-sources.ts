import { MAX_SCALE_STRINGS, MIN_SCALE_STRINGS, type Song, type Track, trackPitches } from '@gp-editor/core';
import type { BeatRange } from '../score/selection-tint';
import { t } from './i18n/i18n';
import { pitchClassName } from './pitch';

/** The notes the Scales panel's finder looks at, and where they come from ("the selection", "bar 3", "the track"). */
export interface NoteSource {
  readonly label: string;
  readonly pitches: readonly number[];
}

/** Find from selection: the selected beats of the shown track, else the cursor's bar. */
export function selectionNotes(song: Song, trackIndex: number, selection: BeatRange | undefined, cursorMeasureIndex: number): NoteSource {
  const track = song.tracks[trackIndex];
  if (selection !== undefined) {
    return { label: t('tools.scales.source.selection'), pitches: track === undefined ? [] : trackPitches(track, selection.first, selection.last) };
  }
  const bar = { measureIndex: cursorMeasureIndex, beatIndex: 0 };
  const barEnd = { measureIndex: cursorMeasureIndex, beatIndex: Number.MAX_SAFE_INTEGER };
  return { label: t('tools.scales.source.bar', { number: cursorMeasureIndex + 1 }), pitches: track === undefined ? [] : trackPitches(track, bar, barEnd) };
}

/** Find from track: every note of the shown track. */
export function trackNotes(song: Song, trackIndex: number): NoteSource {
  const track = song.tracks[trackIndex];
  return { label: t('tools.scales.source.track'), pitches: track === undefined ? [] : trackPitches(track) };
}

/** "9 notes in the selection: C D E G A", or "No notes in bar 3". */
export function sourceSummary(source: NoteSource): string {
  if (source.pitches.length === 0) {
    return t('tools.scales.noNotes', { where: source.label });
  }
  const pitchClasses = [...new Set(source.pitches.map((pitch) => ((pitch % 12) + 12) % 12))].sort((a, b) => a - b);
  return t('tools.scales.summary', { notes: t('common.notes', { count: source.pitches.length }), where: source.label, names: pitchClasses.map(pitchClassName).join(' ') });
}

/** Whether the track has a neck to lay a scale on: pitched, 3 to 10 strings. */
export function hasScaleNeck(track: Track | undefined): track is Track {
  return track !== undefined && !track.isPercussion && track.strings.length >= MIN_SCALE_STRINGS && track.strings.length <= MAX_SCALE_STRINGS;
}
