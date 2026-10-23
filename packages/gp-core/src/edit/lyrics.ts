// Track lyrics after TuxGuitar's TGSetTrackLyricsAction and TGLyric#getLyricBeats (LGPL-2.1); hyphens, "+" and "_" as Guitar Pro reads them.
import type { Lyrics, Song, Track } from '../model/song';
import { updateTrack } from './song-paths';

/**
 * New song with the track's lyrics: the text and the bar they start at (1-based, rounded and kept inside the song). A
 * blank text takes the track's lyrics away. Same song when nothing changes, the track is missing or the first bar is
 * not a number.
 */
export function setTrackLyrics(song: Song, trackIndex: number, lyrics: Lyrics): Song {
  if (!Number.isFinite(lyrics.from) || typeof lyrics.text !== 'string') {
    return song;
  }
  const lastBar = Math.max(1, song.measureHeaders.length);
  const from = Math.min(lastBar, Math.max(1, Math.round(lyrics.from)));
  return updateTrack(song, trackIndex, (track) => {
    if (lyrics.text.trim() === '') {
      return track.lyrics === undefined ? track : withoutLyrics(track);
    }
    return track.lyrics?.from === from && track.lyrics.text === lyrics.text ? track : { ...track, lyrics: { from, text: lyrics.text } };
  });
}

function withoutLyrics(track: Track): Track {
  const { lyrics: _lyrics, ...rest } = track;
  return rest;
}

/** A syllable and the hyphens after it, or a run of text without one ("beau-ti-ful" → "beau-", "ti-", "ful"). */
const HYPHENATED = /[^-]*-+|[^-]+/g;

/** Underscores that hold the syllable before them ("love___"): Guitar Pro shows the syllable alone. */
const HOLD = /_+$/;

/** A comment in brackets where a syllable would start ("[Chorus]"), and the spaces after it: no note takes it. */
const COMMENT = /(^|\s)\[[^\]]*\]\s*/g;

/**
 * The syllables of a lyrics text, one per note with notes: line breaks count as spaces and every single space
 * separates two, so two spaces leave a note without a syllable (TuxGuitar's TGLyric); as in Guitar Pro, a hyphen also
 * ends a syllable and stays on it, "+" joins words sung on one note, trailing underscores are dropped and comments in
 * brackets are left out.
 */
export function lyricsSyllables(text: string): readonly string[] {
  return text
    .replace(COMMENT, '$1')
    // Spaces at the end leave no note bare (and a comment there leaves the space before it).
    .trimEnd()
    .replace(/\r\n|\r|\n/g, ' ')
    .split(' ')
    .flatMap((word) => (word === '' ? [''] : (word.match(HYPHENATED) ?? [word])))
    .map((syllable) => syllable.replace(/\+/g, ' ').replace(HOLD, ''));
}

/** Hangul syllables and jamo, kana, CJK ideographs: each one is sung on a note of its own. */
const CJK_SYLLABLE = /[ᄀ-ᇿ぀-ヿ㄰-㆏㐀-䶿一-鿿가-힣豈-﫿]/;

/** Small kana (ゃ ゅ ょ っ …): they make one syllable with the character before them. */
const SMALL_KANA = /[ぁぃぅぇぉっゃゅょゎゕゖァィゥェォッャュョヮヵヶ]/;

/**
 * Korean, Japanese and Chinese text with a space between two characters that follow each other, so each is sung on a
 * note of its own as in Guitar Pro's lyrics ("사랑해" → "사 랑 해"); small kana stay with the character before them.
 * Everything else, line breaks and spaces included, is left as it is.
 */
export function separateCjkSyllables(text: string): string {
  const characters = Array.from(text);
  return characters
    .map((character, index) => {
      const next = characters[index + 1];
      const isBetweenSyllables = next !== undefined && CJK_SYLLABLE.test(character) && CJK_SYLLABLE.test(next) && !SMALL_KANA.test(next);
      return isBetweenSyllables ? `${character} ` : character;
    })
    .join('');
}
