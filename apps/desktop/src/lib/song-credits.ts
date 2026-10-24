import type { SongInfo } from '@gp-editor/core';
import { t } from './i18n/i18n';

/** GP1–GP4 have one author field that fills both words and music; show it once. */
export function authorCredits(words: string, music: string): string[] {
  if (words !== '' && words === music) {
    return [t('window.credits.wordsAndMusic', { name: words })];
  }
  return [music ? t('window.credits.music', { name: music }) : '', words ? t('window.credits.words', { name: words }) : ''];
}

/** Who wrote the song and who made the tab: "Music: …", "Words: …" (or "Words & Music: …"), "Tab: …"; empty ones left out. */
export function authorshipCredits(info: SongInfo): string[] {
  return [...authorCredits(info.words, info.music), info.transcriber ? t('window.credits.tab', { name: info.transcriber }) : ''].filter((part) => part.length > 0);
}

/** The credits under a song's title, on screen (SongHeader) and on the first page of a PDF: artist, album, then authorship. */
export function songCredits(info: SongInfo): string[] {
  return [info.artist, info.album, ...authorshipCredits(info)].filter((part) => part.length > 0);
}
