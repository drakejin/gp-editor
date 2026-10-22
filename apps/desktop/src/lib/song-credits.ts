import type { SongInfo } from '@gp-editor/core';

/** GP1–GP4 have one author field that fills both words and music; show it once. */
export function authorCredits(words: string, music: string): string[] {
  if (words !== '' && words === music) {
    return [`Words & Music: ${words}`];
  }
  return [music ? `Music: ${music}` : '', words ? `Words: ${words}` : ''];
}

/** Who wrote the song and who made the tab: "Music: …", "Words: …" (or "Words & Music: …"), "Tab: …"; empty ones left out. */
export function authorshipCredits(info: SongInfo): string[] {
  return [...authorCredits(info.words, info.music), info.transcriber ? `Tab: ${info.transcriber}` : ''].filter((part) => part.length > 0);
}

/** The credits under a song's title, on screen (SongHeader) and on the first page of a PDF: artist, album, then authorship. */
export function songCredits(info: SongInfo): string[] {
  return [info.artist, info.album, ...authorshipCredits(info)].filter((part) => part.length > 0);
}
