// Guitar Pro 7/8's track icons and track colours (no TuxGuitar counterpart): what GPIF's `<IconId>` and `<Color>` hold.
import type { Rgb } from '../../model/song';

/**
 * Guitar Pro's track icons by what they show, with the id a GPIF `<IconId>` holds. The ids are the ones Guitar Pro gives
 * its instrument sets (`instrument-sets.ts`; alphaTab's GpifSoundMapper lists the same) and writes in its own files:
 * 24 is Guitar Pro 8's Distortion Guitar (fixtures guitarpro8/canon-audio-track.gp, orphan-tempo-automation.gp).
 * Ids Guitar Pro has besides these are kept from a file as they are, drawn as the instrument's icon.
 */
export const TRACK_ICON_IDS = {
  steelGuitar: 1,
  nylonGuitar: 23,
  electricGuitar: 4,
  distortionGuitar: 24,
  bass: 5,
  ukulele: 7,
  banjo: 8,
  keyboard: 10,
  synthesizer: 12,
  strings: 11,
  brass: 13,
  reeds: 14,
  flute: 15,
  voice: 16,
  mallets: 17,
  percussion: 19,
  timpani: 20,
  drums: 18,
  other: 21,
} as const;

export type TrackIconName = keyof typeof TRACK_ICON_IDS;

/** Largest icon id kept from a file: Guitar Pro's ids are small numbers, anything past this is not one. */
export const MAX_TRACK_ICON_ID = 99;

const ICON_NAMES: ReadonlyMap<number, TrackIconName> = new Map(
  (Object.entries(TRACK_ICON_IDS) as [TrackIconName, number][]).map(([name, id]) => [id, name]),
);

/** True for a whole number 0…MAX_TRACK_ICON_ID: an icon id a track may hold. */
export function isTrackIconId(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0 && value <= MAX_TRACK_ICON_ID;
}

/** What an icon id shows; undefined for an id outside TRACK_ICON_IDS. */
export function trackIconName(iconId: number): TrackIconName | undefined {
  return ICON_NAMES.get(iconId);
}

/**
 * Guitar Pro 8's track colours, red to purple: the ones it gives its instrument sets and new tracks in
 * its own files (steel guitar 237 116 116, electric guitar 235 152 125, piano 234 188 124, bass 234 212 125, dulcimer
 * 142 191 105, drums 115 177 222) and in its guide's tracks panel (181 208 140, 117 203 222, 165 138 193).
 */
export const TRACK_COLORS: readonly Rgb[] = [
  { r: 237, g: 116, b: 116 },
  { r: 235, g: 152, b: 125 },
  { r: 234, g: 188, b: 124 },
  { r: 234, g: 212, b: 125 },
  { r: 181, g: 208, b: 140 },
  { r: 142, g: 191, b: 105 },
  { r: 117, g: 203, b: 222 },
  { r: 115, g: 177, b: 222 },
  { r: 165, g: 138, b: 193 },
];
