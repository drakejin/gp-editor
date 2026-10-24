// The Guitar Pro 7/8 container (no TuxGuitar counterpart: it only reads it, GPXFileSystem): a zip of the GPIF document
// and the binary view settings Guitar Pro keeps next to it.
import { type Zippable, zipSync } from 'fflate';
import { GP7_EFFECTS_ENTRY, GP7_SCORE_ENTRY, GP7_VERSION_ENTRY } from '../../formats/gpif/container-gp7';
import { encodeUtf8 } from '../../io/text';

/** VERSION of a Guitar Pro 7 file (Guitar Pro 8 writes the same). */
const CONTAINER_VERSION = '7.0';
/** Zip entry times Guitar Pro writes (the DOS epoch), so equal songs give equal bytes. */
const ENTRY_TIME = new Date(1980, 0, 1);
/** Fast deflating: most of the time Hermes spends writing a .gp file goes into compressing it. */
const DEFLATE_LEVEL = 1;

/** PartConfiguration track flags: standard notation 1, tablature 2, slash 4. */
const NOTATION = 0x01;
const NOTATION_AND_TAB = 0x03;
const SLASH = 0x04;
/** LayoutConfiguration: zoom 100 % (4), the page view Guitar Pro opens files in (1), multi-voice cursor off. */
const LAYOUT_ZOOM = 4;
const LAYOUT_VIEW = 0x01;
const VISIBLE = 0xff;

/** Preferences Guitar Pro 7 writes into a new file: the practice tools off. */
const PREFERENCES_JSON =
  '{"tonality":{"isActive":false,"value":0},"tempo":{"isActive":false,"mode":"Constant","constantTempo":100,' +
  '"fromTempo":70,"toTempo":100,"step":10,"repeatCount":1},"view":{"globalViewHeight":24}}';

/** Big-endian bytes of an int32. */
function int32(value: number): readonly number[] {
  return [(value >>> 24) & 0xff, (value >>> 16) & 0xff, (value >>> 8) & 0xff, value & 0xff];
}

/**
 * Content/PartConfiguration, the staves each score view shows (big-endian):
 * int32 view count; per view: byte multi-rest flag, int32 track count, one flag byte per track
 * (1 notation, 2 tablature, 4 slash, 8 numbered); then int32 the active view.
 * The views are the multi-track view (every track) and one view per track; drum tracks show notation only, tracks
 * written in slashes (`slashTracks`) slash notation too.
 */
export function partConfigurationOf(percussionTracks: readonly boolean[], slashTracks: readonly boolean[] = []): Uint8Array {
  const flags = percussionTracks.map((isPercussion, index) => (isPercussion ? NOTATION : NOTATION_AND_TAB) | (slashTracks[index] === true ? SLASH : 0));
  const views = [flags, ...flags.map((flag) => [flag])];
  const bytes = [...int32(views.length), ...views.flatMap((view) => [0, ...int32(view.length), ...view]), ...int32(0)];
  return Uint8Array.from(bytes);
}

/**
 * Content/LayoutConfiguration, laid out along the part configuration's views (big-endian):
 * int32 zoom, byte page view, byte multi-voice cursor; per view one visibility byte per track; int32 the selected track.
 */
export function layoutConfigurationOf(trackCount: number): Uint8Array {
  const visibility = new Array<number>(trackCount * 2).fill(VISIBLE);
  return Uint8Array.from([...int32(LAYOUT_ZOOM), LAYOUT_VIEW, 0, ...visibility, ...int32(0)]);
}

/** BinaryStylesheet value types. */
const BOOLEAN_TYPE = 0;

/**
 * Content/BinaryStylesheet, the score's style sheet (big-endian): int32 entry count; per entry a byte-long key, a type
 * byte and the value. Guitar Pro fills in its defaults for every key a file leaves out; this one only shows the tuning
 * and the chord diagrams.
 */
export function binaryStylesheet(): Uint8Array {
  const entries: readonly (readonly [string, boolean])[] = [
    ['Global/DisplayTuning', true],
    ['Global/DrawChords', true],
  ];
  const bytes = entries.flatMap(([key, value]) => {
    const keyBytes = [...encodeUtf8(key)];
    return [keyBytes.length, ...keyBytes, BOOLEAN_TYPE, value ? 1 : 0];
  });
  return Uint8Array.from([...int32(entries.length), ...bytes]);
}

/** Guitar Pro 8's meta.json of a file with an audio track. */
const AUDIO_META_JSON = '{\n    "hasAudio": true,\n    "version": "1.0.0"\n}\n';

/** The audio track's file inside the archive. */
export interface Gp7Asset {
  readonly path: string;
  readonly data: Uint8Array;
}

/** Guitar Pro 8's entries of the audio track: its file (stored as it is: audio does not deflate) and meta.json. */
function audioEntries(asset: Gp7Asset | undefined): Zippable {
  return asset === undefined ? {} : { [asset.path]: [asset.data, { level: 0 }], 'meta.json': encodeUtf8(AUDIO_META_JSON) };
}

/**
 * The .gp file: the entries a Guitar Pro 7 file has, in its order, the app's effects JSON when there is one, and the
 * audio track's file with Guitar Pro 8's meta.json.
 */
export function zipGp7(
  score: Uint8Array,
  percussionTracks: readonly boolean[],
  effectsJson?: string,
  slashTracks: readonly boolean[] = [],
  asset?: Gp7Asset,
): Uint8Array {
  return zipSync(
    {
      'Content/': new Uint8Array(0),
      'Content/BinaryStylesheet': binaryStylesheet(),
      'Content/LayoutConfiguration': layoutConfigurationOf(percussionTracks.length),
      'Content/PartConfiguration': partConfigurationOf(percussionTracks, slashTracks),
      'Content/Preferences.json': encodeUtf8(PREFERENCES_JSON),
      [GP7_SCORE_ENTRY]: score,
      [GP7_VERSION_ENTRY]: encodeUtf8(CONTAINER_VERSION),
      ...(effectsJson === undefined ? {} : { [GP7_EFFECTS_ENTRY]: encodeUtf8(effectsJson) }),
      ...audioEntries(asset),
    },
    { level: DEFLATE_LEVEL, mtime: ENTRY_TIME },
  );
}
