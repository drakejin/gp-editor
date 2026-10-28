// A song's stylesheet (File ▸ Stylesheet…; no TuxGuitar counterpart): the song keeps one only while it differs from
// the default, so a song nobody styled reads, writes and draws exactly as before.
import type { Song } from '../model/song';
import { DEFAULT_STYLESHEET, PAGE_FORMATS, type PageSetup, type Stylesheet } from '../model/stylesheet';
import { isSameJson, parseStylesheet, roundTo } from '../stylesheet/stylesheet-json';

const POINTS_PER_MILLIMETRE = 72 / 25.4;

/** The song's stylesheet, DEFAULT_STYLESHEET when it has none. */
export function stylesheetOf(song: Song): Stylesheet {
  return song.stylesheet ?? DEFAULT_STYLESHEET;
}

export function isDefaultStylesheet(stylesheet: Stylesheet): boolean {
  return isSameJson(stylesheet, DEFAULT_STYLESHEET);
}

/**
 * The song with `stylesheet` (checked and clamped like a file's); the same song when nothing changes, and no
 * stylesheet at all when it is the default one.
 */
export function setStylesheet(song: Song, stylesheet: Stylesheet): Song {
  const checked = parseStylesheet(stylesheet);
  if (isSameJson(checked, stylesheetOf(song))) {
    return song;
  }
  if (isDefaultStylesheet(checked)) {
    const { stylesheet: _previous, ...unstyled } = song;
    return unstyled;
  }
  return { ...song, stylesheet: checked };
}

/** Millimetres in points (1/72 inch), two decimals. */
export function millimetresToPoints(millimetres: number): number {
  return roundTo(millimetres * POINTS_PER_MILLIMETRE, 2);
}

/** The page in points, as it is printed: the format's portrait size (or the custom one), turned for landscape. */
export function pageSize(page: PageSetup): { readonly width: number; readonly height: number } {
  const format = PAGE_FORMATS.find((candidate) => candidate.id === page.format);
  const { width, height } = format ?? { width: millimetresToPoints(page.customWidth), height: millimetresToPoints(page.customHeight) };
  return page.orientation === 'landscape' ? { width: height, height: width } : { width, height };
}
