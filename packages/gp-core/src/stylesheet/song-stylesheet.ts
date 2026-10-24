// A song's stylesheet and Design Mode layout as JSON of our own (no TuxGuitar counterpart): the .gp writer stores them
// as zip entries (GP7_STYLESHEET_ENTRY, GP7_DESIGN_ENTRY) that Guitar Pro ignores. GP3/GP4/GP5 and MusicXML cannot.
import { ownValue, parseJsonText } from '../effects/effects-json';
import { isRawObject } from '../transcription/parse-values';
import { isDefaultStylesheet, setStylesheet } from '../edit/stylesheet';
import type { MeasureHeader, Song } from '../model/song';
import { parseBarDesign, parseStylesheet } from './stylesheet-json';

export const SONG_STYLESHEET_VERSION = 1;
export const SONG_DESIGN_VERSION = 1;

/** `{ version, stylesheet }`, or undefined when the song has the default stylesheet. */
export function songStylesheetToJson(song: Song): string | undefined {
  const { stylesheet } = song;
  return stylesheet === undefined || isDefaultStylesheet(stylesheet) ? undefined : JSON.stringify({ version: SONG_STYLESHEET_VERSION, stylesheet });
}

/** The song with the stylesheet `text` holds, checked like any untrusted input; other text leaves the song as it is. */
export function readSongStylesheet(song: Song, text: string): Song {
  const raw = parseJsonText(text);
  if (!isRawObject(raw) || ownValue(raw, 'version') !== SONG_STYLESHEET_VERSION) {
    return song;
  }
  return setStylesheet(song, parseStylesheet(ownValue(raw, 'stylesheet')));
}

/** `{ version, bars: [{ measureIndex, …design }] }` for the bars laid out by hand; undefined when there are none. */
export function songDesignToJson(song: Song): string | undefined {
  const bars = song.measureHeaders.flatMap((header, measureIndex) => (header.design === undefined ? [] : [{ measureIndex, ...header.design }]));
  return bars.length === 0 ? undefined : JSON.stringify({ version: SONG_DESIGN_VERSION, bars });
}

/** A bar's design from one entry, when the entry names a bar of the song. */
function designEntry(entry: unknown, barCount: number): readonly [number, NonNullable<MeasureHeader['design']>] | undefined {
  const measureIndex = isRawObject(entry) ? ownValue(entry, 'measureIndex') : undefined;
  if (typeof measureIndex !== 'number' || !Number.isInteger(measureIndex) || measureIndex < 0 || measureIndex >= barCount) {
    return undefined;
  }
  const design = parseBarDesign(entry);
  return design === undefined ? undefined : [measureIndex, design];
}

/** The song with the bars' Design Mode layout `text` holds, checked; text of another version leaves the song as it is. */
export function readSongDesign(song: Song, text: string): Song {
  const raw = parseJsonText(text);
  if (!isRawObject(raw) || ownValue(raw, 'version') !== SONG_DESIGN_VERSION) {
    return song;
  }
  const bars = ownValue(raw, 'bars');
  const entries: readonly unknown[] = Array.isArray(bars) ? bars : [];
  const designs = new Map(entries.flatMap((entry) => {
    const found = designEntry(entry, song.measureHeaders.length);
    return found === undefined ? [] : [found];
  }));
  if (designs.size === 0) {
    return song;
  }
  return { ...song, measureHeaders: song.measureHeaders.map((header, index) => {
    const design = designs.get(index);
    return design === undefined ? header : { ...header, design };
  }) };
}
