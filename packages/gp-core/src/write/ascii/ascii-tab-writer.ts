// Port of TuxGuitar app.tuxguitar.io.ascii.ASCIITabOutputStream#writeSong / #drawSong / #drawTrack (LGPL-2.1).
import type { GuitarString, Song, SongInfo, Track } from '../../model/song';
import { type AsciiBar, buildAsciiBar } from './ascii-bar';

export interface AsciiTabOptions {
  /** Tracks to write (0-based), in this order. Default: every track. */
  readonly trackIndexes?: readonly number[];
  /**
   * Widest line, in columns: a system takes bars while its lines fit (a bar wider than that gets a system of its own).
   * Default `DEFAULT_ASCII_LINE_WIDTH`.
   */
  readonly lineWidth?: number;
}

/** TuxGuitar's MAX_LINE_LENGTH. */
export const DEFAULT_ASCII_LINE_WIDTH = 80;

const TONIC_NAMES: readonly string[] = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
/** The bar line closing every string row. */
const CLOSING_BAR = '|';

function validateOptions(song: Song, options: AsciiTabOptions): void {
  const invalid = options.trackIndexes?.find((index) => !(Number.isInteger(index) && index >= 0 && index < song.tracks.length));
  if (invalid !== undefined) {
    throw new RangeError(`trackIndexes contains ${invalid}, not a track of this song (0…${song.tracks.length - 1})`);
  }
  const { lineWidth } = options;
  if (lineWidth !== undefined && !(Number.isInteger(lineWidth) && lineWidth > 0)) {
    throw new RangeError(`lineWidth ${lineWidth} is not a whole number of columns above 0`);
  }
}

/** drawSong: title, artist, album and author (the lyricist, else the composer, as the GP3/GP4 writers do). */
function songHeading(info: SongInfo): string[] {
  const author = info.words !== '' ? info.words : info.music;
  return [`Title: ${info.title}`, `Artist: ${info.artist}`, `Album: ${info.album}`, `Author: ${author}`].map((line) => line.trimEnd());
}

/** The open string's note name, without octave ("E", "F#"). */
function stringName(string: GuitarString): string {
  return TONIC_NAMES[((string.tuning % TONIC_NAMES.length) + TONIC_NAMES.length) % TONIC_NAMES.length] ?? '';
}

/**
 * Bars into systems: a system takes bars while its lines, closed by a bar line, fit in `lineWidth`. (TuxGuitar breaks
 * only after the bar that passes 80 columns, so its lines run past it.)
 */
function systemsOf(bars: readonly AsciiBar[], nameWidth: number, lineWidth: number): readonly (readonly AsciiBar[])[] {
  const systems: AsciiBar[][] = [];
  let width = 0;
  for (const bar of bars) {
    const current = systems[systems.length - 1];
    if (current === undefined || width + bar.width > lineWidth) {
      systems.push([bar]);
      width = nameWidth + bar.width + CLOSING_BAR.length;
    } else {
      current.push(bar);
      width += bar.width;
    }
  }
  return systems;
}

/** A system: the chord names when it has any, then a row per string — its name right-aligned, its bars, a bar line. */
function systemLines(bars: readonly AsciiBar[], names: readonly string[], nameWidth: number): string[] {
  const chordLine = (' '.repeat(nameWidth) + bars.map((bar) => bar.chords).join('')).trimEnd();
  const rows = names.map((name, index) => name.padStart(nameWidth) + bars.map((bar) => bar.strings[index] ?? '').join('') + CLOSING_BAR);
  return chordLine === '' ? rows : [chordLine, ...rows];
}

/** drawTrack: "Track N: name", then the systems, each after a blank line (string 1, the highest, on top). */
function trackLines(song: Song, track: Track, lineWidth: number): string[] {
  const heading = ['', `Track ${track.number}: ${track.name}`];
  const strings = [...track.strings].sort((a, b) => a.number - b.number);
  if (strings.length === 0) {
    return heading;
  }
  const names = strings.map(stringName);
  const nameWidth = Math.max(1, ...names.map((name) => name.length));
  const bars = track.measures.flatMap((measure) => {
    const header = song.measureHeaders[measure.headerIndex];
    return header === undefined ? [] : [buildAsciiBar(measure, header, strings)];
  });
  return [...heading, ...systemsOf(bars, nameWidth, lineWidth).flatMap((system) => ['', ...systemLines(system, names, nameWidth)])];
}

/**
 * The song as ASCII tab (UTF-8 text, "\n" line ends): the song information, then each track's strings, bars
 * spaced by the length of their beats, frets with h / p, slides, bends (b, r, H) and dead notes (X), chord names above.
 *
 * @throws RangeError when a track index or the line width is invalid
 */
export function writeAsciiTab(song: Song, options: AsciiTabOptions = {}): string {
  validateOptions(song, options);
  const lineWidth = options.lineWidth ?? DEFAULT_ASCII_LINE_WIDTH;
  const tracks = (options.trackIndexes ?? song.tracks.map((_, index) => index)).flatMap((index) => song.tracks[index] ?? []);
  const lines = [...songHeading(song.info), ...tracks.flatMap((track) => trackLines(song, track, lineWidth))];
  return `${lines.join('\n')}\n`;
}
