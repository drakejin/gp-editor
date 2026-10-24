// New-track instruments after TuxGuitar's common/resources/tunings/tunings.xml (LGPL-2.1): its 7- and 8-string guitar,
// 5- and 6-string bass and ukulele groups, beside the presets of tuning-presets.ts.
import { GM_BANJO_PROGRAM } from '../formats/common/channels';
import { STANDARD_TUNING } from '../model/defaults';
import { TUNING_PRESETS } from './tuning-presets';

/** What a new track is: Guitar Pro 8's instrument types as the app offers them (Track ▸ Add Track…). */
export type TrackKind = 'guitar' | 'bass' | 'banjo' | 'ukulele' | 'drums' | 'keys' | 'other';

export interface TrackKindSpec {
  readonly kind: TrackKind;
  /** Shown in the app; a new track's name unless another is given ("other": its General MIDI instrument's name). */
  readonly name: string;
  /** The General MIDI program it plays unless another is chosen (drums: the percussion bank's first kit). */
  readonly program: number;
  /** The string counts it can have, the default first; none for drums. */
  readonly stringCounts: readonly number[];
}

export interface TrackTuningChoice {
  /** Unique across kinds and string counts. */
  readonly id: string;
  readonly name: string;
  /** Open-string MIDI pitches, string 1 (highest) first, as GuitarString.tuning. */
  readonly tuning: readonly number[];
}

/** In the Add Track panel's order. Ukulele: a nylon guitar's sound (General MIDI has no ukulele). */
export const TRACK_KINDS: readonly TrackKindSpec[] = [
  { kind: 'guitar', name: 'Guitar', program: 25, stringCounts: [6, 7, 8] },
  { kind: 'bass', name: 'Bass', program: 33, stringCounts: [4, 5, 6] },
  { kind: 'banjo', name: 'Banjo', program: GM_BANJO_PROGRAM, stringCounts: [5, 4] },
  { kind: 'ukulele', name: 'Ukulele', program: 24, stringCounts: [4] },
  { kind: 'drums', name: 'Drums', program: 0, stringCounts: [] },
  { kind: 'keys', name: 'Piano', program: 0, stringCounts: [6] },
  { kind: 'other', name: 'Other', program: 48, stringCounts: [6] },
];

function choice(id: string, name: string, tuning: readonly number[]): TrackTuningChoice {
  return { id, name, tuning };
}

/** TuxGuitar's tunings for the string counts tuning-presets.ts does not have, and the ukulele's. */
const MORE_TUNINGS: Readonly<Partial<Record<TrackKind, readonly TrackTuningChoice[]>>> = {
  guitar: [
    choice('guitar-7-standard', 'Standard', [64, 59, 55, 50, 45, 40, 35]),
    choice('guitar-7-drop-a', 'Drop A', [64, 59, 55, 50, 45, 40, 33]),
    choice('guitar-8-standard', 'Standard', [64, 59, 55, 50, 45, 40, 35, 30]),
  ],
  bass: [
    choice('bass-5-standard', 'Standard', [43, 38, 33, 28, 23]),
    choice('bass-5-tenor', 'Tenor', [48, 43, 38, 33, 28]),
    choice('bass-6-standard', 'Standard', [48, 43, 38, 33, 28, 23]),
  ],
  // TuxGuitar calls low G "Tenor".
  ukulele: [choice('ukulele-standard', 'Standard', [69, 64, 60, 67]), choice('ukulele-low-g', 'Low G', [69, 64, 60, 55]), choice('ukulele-baritone', 'Baritone', [64, 59, 55, 50])],
  keys: [choice('neck-standard', 'Standard', STANDARD_TUNING)],
  other: [choice('neck-standard', 'Standard', STANDARD_TUNING)],
};

/** The kind's spec; undefined for anything that is not a TrackKind. */
export function trackKindSpec(kind: TrackKind): TrackKindSpec | undefined {
  return TRACK_KINDS.find((spec) => spec.kind === kind);
}

/** The tunings a new track of `kind` with `stringCount` strings can have, the default first; none for drums. */
export function trackTuningChoices(kind: TrackKind, stringCount: number): readonly TrackTuningChoice[] {
  const presets = TUNING_PRESETS.filter((preset) => preset.instrument === kind).map((preset) => choice(preset.id, preset.name, preset.tuning));
  return [...presets, ...(MORE_TUNINGS[kind] ?? [])].filter((candidate) => candidate.tuning.length === stringCount);
}
