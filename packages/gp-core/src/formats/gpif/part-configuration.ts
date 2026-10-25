// Guitar Pro 6–8's PartConfiguration (no TuxGuitar counterpart: GPXFileSystem reads only score.gpif), the staves each
// score view shows. Big-endian: int32 view count; per view a multi-rest byte, an int32 track count and one notation
// byte per track (1 standard notation, 2 tablature, 4 slash, 8 numbered); then the active view.

/** The GP6 container's file and the GP7/GP8 zip entry. */
export const GPX_PART_CONFIGURATION_FILE = 'PartConfiguration';
export const GP7_PART_CONFIGURATION_ENTRY = 'Content/PartConfiguration';

/** Notation byte: the track shows slash notation. */
const SLASH_NOTATION_FLAG = 0x04;
const INT32 = 4;
/** Views beyond the multi-track one and the tracks' own are not read; this bounds a corrupt count. */
const MAX_TRACKS = 0xffff;

/** What a track shows in the multi-track view. */
export interface TrackView {
  readonly hasSlash: boolean;
}

function readInt32(bytes: Uint8Array, offset: number): number | undefined {
  if (offset + INT32 > bytes.length) {
    return undefined;
  }
  const [a = 0, b = 0, c = 0, d = 0] = bytes.subarray(offset, offset + INT32);
  return (a << 24) | (b << 16) | (c << 8) | d;
}

/**
 * The first view's notation flags, one per track in track order (the view of every track, as Guitar Pro opens the
 * file). An empty list when the data is missing or does not hold the view it announces.
 */
export function readPartConfiguration(bytes: Uint8Array | undefined): readonly TrackView[] {
  if (bytes === undefined) {
    return [];
  }
  const viewCount = readInt32(bytes, 0);
  const trackCount = readInt32(bytes, INT32 + 1);
  const first = 2 * INT32 + 1;
  if (viewCount === undefined || viewCount < 1 || trackCount === undefined || trackCount < 0 || trackCount > MAX_TRACKS || first + trackCount > bytes.length) {
    return [];
  }
  return Array.from(bytes.subarray(first, first + trackCount), (flags) => ({ hasSlash: (flags & SLASH_NOTATION_FLAG) !== 0 }));
}
