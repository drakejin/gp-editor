import { type Song, type TrackIconName, instrumentIconId, trackIconId, trackIconName } from '@gp-editor/core';
import type { DrawCommand } from './draw';

/**
 * Guitar Pro 8's track icons, drawn by the native canvas in a TRACK_ICON_SIZE square (origin top-left) as Guitar Pro
 * draws them: one-colour silhouettes, the guitars and basses by their headstocks.
 */
export const TRACK_ICON_SIZE = 16;

/** What a track's icon shows: its own (gp-core `trackIconId`), else — an id the app cannot draw — its instrument's. */
export function shownTrackIcon(song: Song, trackIndex: number): TrackIconName {
  const own = trackIconId(song, trackIndex);
  const named = own === undefined ? undefined : trackIconName(own);
  if (named !== undefined) {
    return named;
  }
  const track = song.tracks[trackIndex];
  const channel = song.channels.find((candidate) => candidate.id === track?.channelId);
  return (track === undefined ? undefined : trackIconName(instrumentIconId(track, channel))) ?? 'steelGuitar';
}

type IconDrawing = (color: string) => DrawCommand[];

const rect = (x: number, y: number, width: number, height: number, color: string, radius?: number): DrawCommand =>
  radius === undefined ? { kind: 'rect', x, y, width, height, color } : { kind: 'rect', x, y, width, height, color, radius };
const line = (x1: number, y1: number, x2: number, y2: number, width: number, color: string): DrawCommand => ({ kind: 'line', x1, y1, x2, y2, width, color });
const circle = (x: number, y: number, radius: number, color: string, strokeWidth?: number): DrawCommand =>
  strokeWidth === undefined ? { kind: 'circle', x, y, radius, color } : { kind: 'circle', x, y, radius, color, strokeWidth };

/** Tuning pegs on both sides of a headstock, one pair per `ys`. */
function pegPairs(ys: readonly number[], left: number, right: number, color: string): DrawCommand[] {
  return ys.flatMap((y) => [rect(left, y, 2.6, 1.6, color, 0.6), rect(right, y, 2.6, 1.6, color, 0.6)]);
}

/** An acoustic guitar's headstock: three pegs a side. */
function steelGuitar(color: string): DrawCommand[] {
  return [rect(6.6, 9, 2.8, 7, color), rect(5, 1, 6, 9.2, color, 2), ...pegPairs([2.4, 4.9, 7.4], 2.5, 10.9, color)];
}

/** A classical guitar's slotted headstock. */
function nylonGuitar(color: string): DrawCommand[] {
  const frame = [rect(5, 1, 6, 1.6, color), rect(5, 8.6, 6, 1.6, color), rect(5, 1, 1.4, 9.2, color), rect(7.3, 1, 1.4, 9.2, color), rect(9.6, 1, 1.4, 9.2, color)];
  return [rect(6.6, 9.6, 2.8, 6.4, color), ...frame, ...pegPairs([2.4, 4.9, 7.4], 2.5, 10.9, color)];
}

/** A Stratocaster's headstock: six pegs in a line. */
function electricGuitar(color: string): DrawCommand[] {
  const head: DrawCommand = { kind: 'polygon', points: [6.4, 10, 9.4, 10, 9.6, 6.5, 11.6, 3.6, 12, 1.6, 10.3, 0.8, 8.4, 2, 6.4, 2.6], color };
  const pegs = [3.3, 4.6, 5.9, 7.2, 8.5].map((y) => circle(5.2, y, 0.75, color));
  return [rect(6.6, 9.4, 2.8, 6.6, color), head, ...pegs];
}

/** A Les Paul's open-book headstock: three round pegs a side. */
function distortionGuitar(color: string): DrawCommand[] {
  const head: DrawCommand = { kind: 'polygon', points: [5.4, 10, 10.6, 10, 11.4, 2.4, 9.6, 0.8, 8, 2, 6.4, 0.8, 4.6, 2.4], color };
  const pegs = [3, 5.5, 8].flatMap((y) => [circle(3.4, y, 1.1, color), circle(12.6, y, 1.1, color)]);
  return [rect(6.6, 9.4, 2.8, 6.6, color), head, ...pegs];
}

/** A bass's headstock: four big pegs in a line. */
function bass(color: string): DrawCommand[] {
  const head: DrawCommand = { kind: 'polygon', points: [6.6, 9.6, 9.4, 9.6, 9.6, 5.2, 11.4, 2.2, 10.8, 0.6, 8.8, 0.9, 6.6, 3.2], color };
  const pegs = [2.6, 4.6, 6.6, 8.6].map((y) => rect(3.4, y, 3.4, 1.6, color, 0.8));
  return [rect(6.9, 9, 2.4, 7, color), head, ...pegs];
}

/** A ukulele's small headstock: two pegs a side. */
function ukulele(color: string): DrawCommand[] {
  return [rect(6.8, 9, 2.4, 7, color), rect(5.4, 3, 5.2, 6.6, color, 1.8), ...pegPairs([4.2, 6.8], 2.9, 10.5, color)];
}

/** A banjo: the round pot and its neck. */
function banjo(color: string): DrawCommand[] {
  return [line(8.4, 7.6, 13.6, 2.4, 1.8, color), rect(12.2, 0.6, 3, 3, color, 1), circle(6, 10.4, 4.4, color, 1.5), circle(6, 10.4, 2.2, color)];
}

/** A keyboard: an outlined case, three black keys, white keys parted below them. */
function keyboard(color: string): DrawCommand[] {
  return keysCase(color, 3.5, 12.5, 5);
}

/** The keyboard's case from `top` to `bottom`, black keys `blackLength` long. */
function keysCase(color: string, top: number, bottom: number, blackLength: number): DrawCommand[] {
  const outline = [
    line(1.5, top, 14.5, top, 1.2, color),
    line(1.5, bottom, 14.5, bottom, 1.2, color),
    line(1.5, top - 0.6, 1.5, bottom + 0.6, 1.2, color),
    line(14.5, top - 0.6, 14.5, bottom + 0.6, 1.2, color),
  ];
  const blackKeys = [4.2, 7.2, 10.2].map((x) => rect(x, top, 1.8, blackLength, color));
  const parts = [5.1, 8.1, 11.1].map((x) => line(x, top + blackLength, x, bottom, 0.8, color));
  return [...outline, ...blackKeys, ...parts];
}

/** A synthesizer: a keyboard under a panel of knobs. */
function synthesizer(color: string): DrawCommand[] {
  const knobs = [4, 7, 10].map((x) => circle(x, 3.4, 1.1, color));
  return [...knobs, rect(12, 2.2, 1.4, 2.4, color), ...keysCase(color, 6, 14, 4)];
}

/** A violin: its body, neck and scroll. */
function strings(color: string): DrawCommand[] {
  return [circle(8, 11.6, 3.7, color), circle(8, 6.9, 2.9, color), rect(7.3, 1.6, 1.4, 4.4, color), circle(8, 1.5, 1.1, color)];
}

/** A trumpet: mouthpiece, valves, the bell. */
function brass(color: string): DrawCommand[] {
  const bell: DrawCommand = { kind: 'polygon', points: [10, 5.4, 15, 2.4, 15, 10.6, 10, 7.6], color };
  const valves = [4.4, 6.6, 8.8].map((x) => rect(x, 2.4, 1.4, 3.2, color));
  return [rect(1.6, 5.4, 9, 2.2, color), bell, ...valves, { kind: 'curve', x1: 3.2, y1: 7.4, cx: 6.6, cy: 12.6, x2: 10, y2: 7.4, width: 1.2, color }, rect(0.5, 5.8, 1.6, 1.4, color)];
}

/** A saxophone: the crook, the body bent up into the bell. */
function reeds(color: string): DrawCommand[] {
  const bell: DrawCommand = { kind: 'polygon', points: [9, 13.4, 11.4, 8.4, 14.6, 9.6, 12.4, 14.2], color };
  return [line(6, 2.6, 2.8, 1, 1.2, color), line(6, 2.4, 6, 11.4, 3, color), { kind: 'curve', x1: 6, y1: 11.2, cx: 6.4, cy: 15.4, x2: 11, y2: 12.6, width: 3, color }, bell];
}

/** A flute across the square, its keys along it. */
function flute(color: string): DrawCommand[] {
  const keys = [5, 7, 9, 11].map((at) => circle(16 - at, at, 1.1, color));
  return [line(1.4, 14.6, 14.6, 1.4, 1.8, color), rect(11.6, 2.2, 2.6, 2.6, color, 0.8), ...keys];
}

function voice(color: string): DrawCommand[] {
  return [
    rect(5.5, 1, 5, 8, color, 2.5),
    { kind: 'curve', x1: 3.5, y1: 6.5, cx: 8, cy: 14.5, x2: 12.5, y2: 6.5, width: 1.2, color },
    line(8, 10.5, 8, 14, 1.2, color),
    line(5, 14.4, 11, 14.4, 1.2, color),
  ];
}

/** A vibraphone: bars shorter to the right. */
function mallets(color: string): DrawCommand[] {
  const heights = [12, 10.5, 9, 7.5, 6];
  return heights.map((height, index) => rect(1.4 + index * 2.8, 8 - height / 2, 2.2, height, color, 0.6));
}

/** A handbell: other pitched percussion. */
function percussion(color: string): DrawCommand[] {
  return [rect(7.2, 0.8, 1.6, 3.4, color, 0.6), rect(4, 3.6, 8, 8, color, 3), rect(2.4, 10.4, 11.2, 2, color, 1), circle(8, 14, 1.4, color)];
}

/** A timpani: the kettle on its legs, a stick. */
function timpani(color: string): DrawCommand[] {
  const kettle: DrawCommand = { kind: 'polygon', points: [2.4, 7, 13.6, 7, 12, 11, 8, 12.6, 4, 11], color };
  return [rect(1.4, 5.2, 13.2, 2, color, 1), kettle, line(4, 11, 3, 15.4, 1, color), line(12, 11, 13, 15.4, 1, color), line(9.6, 1, 13.4, 4.4, 1, color), circle(9.6, 1.4, 1, color)];
}

function drums(color: string): DrawCommand[] {
  return [rect(2, 8.5, 12, 6, color, 1.5), rect(1.5, 7, 13, 1.4, color, 0.7), line(3, 1.5, 8.5, 6.5, 1.2, color), line(13, 1.5, 7.5, 6.5, 1.2, color)];
}

/** An eighth note: sound effects and anything else. */
function other(color: string): DrawCommand[] {
  return [circle(6, 12, 2.6, color), line(8, 12, 8, 2.5, 1.3, color), { kind: 'curve', x1: 8, y1: 2.5, cx: 13, cy: 5, x2: 12, y2: 9.5, width: 1.3, color }];
}

const DRAWINGS: Readonly<Record<TrackIconName, IconDrawing>> = {
  steelGuitar,
  nylonGuitar,
  electricGuitar,
  distortionGuitar,
  bass,
  ukulele,
  banjo,
  keyboard,
  synthesizer,
  strings,
  brass,
  reeds,
  flute,
  voice,
  mallets,
  percussion,
  timpani,
  drums,
  other,
};

/** A track icon in one colour. */
export function engraveTrackIcon(icon: TrackIconName, color: string): DrawCommand[] {
  return DRAWINGS[icon](color);
}
