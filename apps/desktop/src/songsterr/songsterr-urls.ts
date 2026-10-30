// Songsterr's addresses (one home for every URL the app asks or opens). Songsterr issues no API keys and its documented
// API (/a/wa/api, /a/ra/songs.json) answers 404; the search its own site uses, GET /api/songs?pattern=…&size=…, answers
// without a key — undocumented, it may change (songsterr-answer.ts reads it as untrusted). Its terms
// (https://www.songsterr.com/terms, /ai.txt) allow viewing, searching and independent tools that do not modify,
// automate or interfere with the site; downloading tabs (Guitar Pro, MIDI …) is a paid Plus feature and copying or
// downloading content is not allowed. So the app only SEARCHES and LINKS to a song's page on songsterr.com: it never
// fetches, parses or downloads tab content and never scrapes pages.
import type { Song } from '@gp-editor/core';
import { capText, cleanText } from './songsterr-text';

export const SONGSTERR_ORIGIN = 'https://www.songsterr.com';
/** Songsterr's terms of service (what /a/wa/terms redirects to). */
export const SONGSTERR_TERMS_URL = `${SONGSTERR_ORIGIN}/terms`;
const SEARCH_PATH = '/api/songs';

/** Songs one search asks for: a page of results, as Songsterr's own search lists them. */
export const SEARCH_RESULT_COUNT = 20;
/** The most songs a search may ask for. */
const MAX_RESULT_COUNT = 50;
/** Characters of the typed text a search sends (a title and an artist fit easily). */
export const MAX_QUERY_LENGTH = 100;

/** The text as a search sends it: one space between words, no control characters, at most MAX_QUERY_LENGTH characters. */
export function normalizeQuery(text: string): string {
  return capText(cleanText(text), MAX_QUERY_LENGTH);
}

/** The search's address for `text` (its words encoded); undefined when the text is blank. */
export function searchUrl(text: string, size: number = SEARCH_RESULT_COUNT): string | undefined {
  const query = normalizeQuery(text);
  if (query === '') {
    return undefined;
  }
  const count = Number.isFinite(size) ? Math.min(MAX_RESULT_COUNT, Math.max(1, Math.floor(size))) : SEARCH_RESULT_COUNT;
  return `${SONGSTERR_ORIGIN}${SEARCH_PATH}?pattern=${encodeURIComponent(query)}&size=${count}`;
}

/**
 * A song's page on songsterr.com, by its id: Songsterr redirects it to the song's tab page (checked 2026-10-30:
 * /a/wa/song?id=444 → 301 /a/wsa/metallica-one-tab-s444), so the app needs no rule for the page's name.
 */
export function songPageUrl(songId: number): string {
  if (!Number.isSafeInteger(songId) || songId <= 0) {
    // i18n-exempt: a programming error (ids come from songsterr-answer.ts, which keeps positive whole numbers only)
    throw new RangeError(`Not a Songsterr song id: ${songId}`);
  }
  return `${SONGSTERR_ORIGIN}/a/wa/song?id=${songId}`;
}

/** The search the panel starts with: the open song's title and artist. */
export function songQueryOf(song: Song | undefined): string {
  return song === undefined ? '' : normalizeQuery(`${song.info.title} ${song.info.artist}`);
}
