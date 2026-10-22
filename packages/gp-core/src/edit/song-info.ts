// Song information edits after TuxGuitar's TGChangeInfoAction (LGPL-2.1).
import { EMPTY_SONG_INFO } from '../model/defaults';
import type { Song, SongInfo } from '../model/song';
import { hasSameItems } from './song-paths';

type TextField = Exclude<keyof SongInfo, 'notice'>;

const TEXT_FIELDS: readonly TextField[] = Object.keys(EMPTY_SONG_INFO).filter((key): key is TextField => key !== 'notice');

/** The given text fields that differ from `info`, trimmed; fields that are not text are left out. */
function changedTexts(info: SongInfo, change: Partial<SongInfo>): Partial<Record<TextField, string>> {
  const entries = TEXT_FIELDS.flatMap((field) => {
    const value: unknown = change[field];
    return typeof value === 'string' && value.trim() !== info[field] ? [[field, value.trim()] as const] : [];
  });
  return Object.fromEntries(entries) as Partial<Record<TextField, string>>;
}

/** The notice lines, each trimmed, when `value` is a list of texts. */
function noticeLines(value: unknown): readonly string[] | undefined {
  return Array.isArray(value) && value.every((line) => typeof line === 'string') ? value.map((line: string) => line.trim()) : undefined;
}

/**
 * New song with the given song information set (title, artist … notice lines); each text is trimmed, other fields
 * stay. Same song when nothing changes; fields that are not song information or not text are ignored.
 */
export function setSongInfo(song: Song, info: Partial<SongInfo>): Song {
  const texts = changedTexts(song.info, info);
  const notice = noticeLines(info.notice);
  const isNoticeChanged = notice !== undefined && !hasSameItems(notice, song.info.notice);
  if (Object.keys(texts).length === 0 && !isNoticeChanged) {
    return song;
  }
  return { ...song, info: { ...song.info, ...texts, ...(isNoticeChanged ? { notice } : {}) } };
}
