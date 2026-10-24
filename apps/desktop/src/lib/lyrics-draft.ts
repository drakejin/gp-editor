import { type Lyrics, type Song, lyricsSyllables, separateCjkSyllables } from '@gp-editor/core';
import { sungBeats } from '../score/lyrics';
import { t } from './i18n/i18n';

/** What the Lyrics panel edits: a track's lyrics text and the bar they start at (1-based). */
export interface LyricsDraft {
  readonly trackIndex: number;
  readonly from: number;
  readonly text: string;
}

/** A track's lyrics as the panel shows them: from bar 1 and empty when it has none. */
export function trackLyricsDraft(song: Song, trackIndex: number): LyricsDraft {
  const lyrics = song.tracks[trackIndex]?.lyrics;
  return { trackIndex, from: lyrics?.from ?? 1, text: lyrics?.text ?? '' };
}

const hasText = (lyrics: Lyrics | undefined): boolean => (lyrics?.text.trim() ?? '') !== '';

/** The lyrics the panel opens on: the shown track's; when it has none, the first track's that has some. */
export function initialLyricsDraft(song: Song, shownTrackIndex: number): LyricsDraft {
  if (hasText(song.tracks[shownTrackIndex]?.lyrics)) {
    return trackLyricsDraft(song, shownTrackIndex);
  }
  const sung = song.tracks.findIndex((track) => hasText(track.lyrics));
  return trackLyricsDraft(song, sung < 0 ? shownTrackIndex : sung);
}

/** What applying the draft gives the track: each Korean, Japanese or Chinese character on a note of its own. */
export function draftLyrics(draft: LyricsDraft): Lyrics {
  return { from: draft.from, text: separateCjkSyllables(draft.text) };
}

/** Lyrics as setTrackLyrics keeps them in the song: none for a blank text, the first bar inside the song. */
export function effectiveLyrics(song: Song, lyrics: Lyrics | undefined): Lyrics | undefined {
  if (lyrics === undefined || !hasText(lyrics)) {
    return undefined;
  }
  const lastBar = Math.max(1, song.measureHeaders.length);
  return { from: Math.min(lastBar, Math.max(1, Math.round(lyrics.from))), text: lyrics.text };
}

export function isSameLyrics(a: Lyrics | undefined, b: Lyrics | undefined): boolean {
  return a === undefined || b === undefined ? a === b : a.from === b.from && a.text === b.text;
}

/** "12 syllables for 20 notes from bar 3", and how many syllables find no note. */
export function lyricsFit(song: Song, draft: LyricsDraft): string {
  // Up to the last syllable with text: blanks after it leave no note bare.
  const syllables = lyricsSyllables(draftLyrics(draft).text).reduce((count, syllable, index) => (syllable.trim() === '' ? count : index + 1), 0);
  if (syllables === 0) {
    return t('tools.lyrics.none');
  }
  const measures = song.tracks[draft.trackIndex]?.measures.slice(Math.max(0, draft.from - 1)) ?? [];
  const notes = measures.reduce((count, measure) => count + sungBeats(measure).length, 0);
  const fit = t('tools.lyrics.fit', { syllables: t('tools.lyrics.syllables', { count: syllables }), notes: t('common.notes', { count: notes }), bar: draft.from });
  const extra = syllables - notes;
  return extra > 0 ? t('tools.lyrics.extra', { fit, count: extra }) : fit;
}

/** Guitar Pro 5 files hold one track's lyrics, the first track's with some: a note when that is another track. */
export function gp5LyricsNote(song: Song, trackIndex: number): string | undefined {
  const kept = song.tracks.findIndex((track) => hasText(track.lyrics));
  const keptTrack = song.tracks[kept];
  if (keptTrack === undefined || kept >= trackIndex) {
    return undefined;
  }
  return t('tools.lyrics.gp5Note', { name: keptTrack.name });
}
