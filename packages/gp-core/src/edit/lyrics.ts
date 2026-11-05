// Track lyrics after TuxGuitar's TGSetTrackLyricsAction and TGLyric#getLyricBeats (LGPL-2.1); hyphens, "+" and "_" as Guitar Pro reads them.
import type { Beat, Lyrics, Song, Track } from '../model/song';
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

/** A beat that takes a syllable: one with notes in any voice (TuxGuitar's TGLyricImpl; alphaTab and Guitar Pro alike, tied notes too). */
export function isSungBeat(beat: Beat): boolean {
  return beat.voices.some((voice) => voice.notes.length > 0);
}

/** A syllable of a lyrics text as typed: its text, where it ends in the text, and whether a space (not a hyphen) comes before it. */
interface SyllableSpan {
  readonly text: string;
  readonly end: number;
  readonly isWordStart: boolean;
}

/** A character a reading of the lyrics keeps, and its index in the text. */
interface KeptCharacter {
  readonly character: string;
  readonly index: number;
}

/** The characters a reading keeps: comments in brackets left out (a space before one stays), trailing spaces trimmed, line breaks as spaces. */
function keptCharacters(text: string): readonly KeptCharacter[] {
  const kept: KeptCharacter[] = [];
  const keep = (from: number, to: number): void => {
    for (let index = from; index < to; index++) {
      kept.push({ character: text[index] as string, index });
    }
  };
  const comments = new RegExp(COMMENT.source, 'g');
  let from = 0;
  for (let match = comments.exec(text); match !== null; match = comments.exec(text)) {
    keep(from, match.index + (match[1]?.length ?? 0));
    from = match.index + match[0].length;
  }
  keep(from, text.length);
  // Spaces at the end leave no note bare (and a comment there leaves the space before it).
  while (kept.length > 0 && /\s/.test(kept[kept.length - 1]?.character ?? '')) {
    kept.pop();
  }
  // A line break is a space; "\r\n" is one.
  return kept.flatMap((entry, i) => {
    if (entry.character === '\n' && kept[i - 1]?.character === '\r') {
      return [];
    }
    return [/[\r\n]/.test(entry.character) ? { ...entry, character: ' ' } : entry];
  });
}

/** The syllables of a lyrics text with where each ends (see lyricsSyllables). */
function syllableSpans(text: string): readonly SyllableSpan[] {
  const kept = keptCharacters(text);
  const line = kept.map((entry) => entry.character).join('');
  const spans: SyllableSpan[] = [];
  let offset = 0;
  for (const word of line.split(' ')) {
    const pieces = word === '' ? [''] : (word.match(HYPHENATED) ?? [word]);
    let pieceOffset = offset;
    pieces.forEach((piece, index) => {
      const last = kept[pieceOffset + piece.length - 1];
      const end = piece === '' ? (kept[offset]?.index ?? text.length) : (last?.index ?? 0) + 1;
      spans.push({ text: piece, end, isWordStart: index === 0 });
      pieceOffset += piece.length;
    });
    offset += word.length + 1;
  }
  return spans;
}

/**
 * The syllables of a lyrics text, one per note with notes: line breaks count as spaces and every single space
 * separates two, so two spaces leave a note without a syllable (TuxGuitar's TGLyric); as in Guitar Pro, a hyphen also
 * ends a syllable and stays on it, "+" joins words sung on one note, trailing underscores are dropped and comments in
 * brackets are left out.
 */
export function lyricsSyllables(text: string): readonly string[] {
  return syllableSpans(text).map((span) => span.text.replace(/\+/g, ' ').replace(HOLD, ''));
}

/**
 * The lyrics text with a blank syllable before syllable `index` (a note left bare, so the later syllables sing one note
 * later): see withBlankSyllables.
 */
export function withBlankSyllable(text: string, index: number): string {
  return withBlankSyllables(text, [index]);
}

/** Each syllable's number of blanks before it, for blanks at `indexes` of the syllables as they will be sung. */
function blanksBefore(indexes: readonly number[], syllableCount: number): ReadonlyMap<number, number> {
  const sorted = [...new Set(indexes.filter((index) => Number.isInteger(index) && index >= 0))].sort((a, b) => a - b);
  const counts = new Map<number, number>();
  // The k-th blank (from the first) has k blanks before it: it goes before syllable index - k of the text as it is.
  sorted.forEach((index, k) => {
    const syllable = index - k;
    if (syllable < syllableCount) {
      counts.set(syllable, (counts.get(syllable) ?? 0) + 1);
    }
  });
  return counts;
}

/**
 * The lyrics text with blank syllables at `indexes` of the syllables as they will be sung (notes left bare, so the later
 * syllables sing that many notes later), in one pass: one more space before a word for each, two inside a hyphenated
 * one for the first. Blanks past the last syllable change nothing. The same text where the spaces would read otherwise
 * (they would make a bracketed syllable a comment).
 */
export function withBlankSyllables(text: string, indexes: readonly number[]): string {
  const spans = syllableSpans(text);
  const counts = blanksBefore(indexes, spans.length);
  if (counts.size === 0) {
    return text;
  }
  const blanked = [...counts.entries()]
    .sort(([a], [b]) => b - a)
    .reduce((current, [syllable, count]) => {
      const at = syllable === 0 ? 0 : (spans[syllable - 1]?.end ?? 0);
      const spaces = ' '.repeat(spans[syllable]?.isWordStart === true ? count : count + 1);
      return `${current.slice(0, at)}${spaces}${current.slice(at)}`;
    }, text);
  const expected = spans.flatMap((span, index) => [...Array.from({ length: counts.get(index) ?? 0 }, () => ''), span.text]);
  const read = syllableSpans(blanked).map((span) => span.text);
  return read.length === expected.length && read.every((syllable, i) => syllable === expected[i]) ? blanked : text;
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
