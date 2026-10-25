import { DRUM_KIT_NOTATIONS, type DrumNotation, type Track, drumNotation } from '@gp-editor/core';
import { drumPlacement } from '../score/notation/drum-notes';
import { isMessageKey, t } from './i18n/i18n';
import { gmPercussionLabel } from './instruments';

/** One drum of the Drum Key: a key a drum note holds, and how Guitar Pro's kit writes it. */
export interface DrumKeyEntry {
  readonly key: number;
  /** Undefined for a key the kit lacks. */
  readonly notation?: DrumNotation;
}

/** A column of the Drum Key: the drums of one element type of the kit (hi-hat, toms …) or the keys the kit lacks. */
export interface DrumKeyGroup {
  /** The kit's element type ("hiHat", "tom"), or `OTHER_DRUM_GROUP`. */
  readonly id: string;
  readonly entries: readonly DrumKeyEntry[];
}

export const OTHER_DRUM_GROUP = 'other';

/** Every key of Guitar Pro's factory kit (Whole kit). */
export const WHOLE_KIT_KEYS: readonly number[] = DRUM_KIT_NOTATIONS.map((notation) => notation.key);

/** The drummer's own instruments first, as a drum key reads (feet, hands, cymbals); the kit's percussion after them. */
const GROUP_ORDER: readonly string[] = ['kickDrum', 'snare', 'handClap', 'hiHat', 'tom', 'crash', 'ride', 'china', 'splash', 'cowbell', 'tambourine'];
/** The other element types come after those, in the kit's order. */
const LATER_GROUPS = GROUP_ORDER.length;

/** Each element's lowest staff position in the kit: an element type's drums go from low to high. */
const ELEMENT_LOWEST: ReadonlyMap<number, number> = DRUM_KIT_NOTATIONS.reduce(
  (lowest, notation) => new Map(lowest).set(notation.elementIndex, Math.min(lowest.get(notation.elementIndex) ?? notation.position, notation.position)),
  new Map<number, number>(),
);

/** Every key the track's notes hold, grace notes too, once each, lowest first. */
export function trackDrumKeys(track: Track): readonly number[] {
  const keys = track.measures.flatMap((measure) =>
    measure.beats.flatMap((beat) => beat.voices.flatMap((voice) => voice.notes.flatMap((note) => (note.effect.grace === undefined ? [note.fret] : [note.fret, note.effect.grace.fret])))),
  );
  return [...new Set(keys)].sort((a, b) => a - b);
}

function groupRank(group: DrumKeyGroup): number {
  const first = group.entries[0]?.notation;
  if (first === undefined) {
    return Number.MAX_SAFE_INTEGER;
  }
  const index = GROUP_ORDER.indexOf(group.id);
  return index >= 0 ? index : LATER_GROUPS + first.elementIndex;
}

function compareEntries(a: DrumKeyEntry, b: DrumKeyEntry): number {
  if (a.notation === undefined || b.notation === undefined) {
    return a.key - b.key;
  }
  const lowest = (notation: DrumNotation) => ELEMENT_LOWEST.get(notation.elementIndex) ?? notation.position;
  return lowest(a.notation) - lowest(b.notation) || a.notation.elementIndex - b.notation.elementIndex || a.notation.articulationIndex - b.notation.articulationIndex;
}

/** The Drum Key's columns for some keys: grouped by element type, in kit order, each from low to high; keys the kit lacks last. */
export function drumKeyGroups(keys: readonly number[]): readonly DrumKeyGroup[] {
  const entries = [...new Set(keys)].map((key): DrumKeyEntry => {
    const notation = drumNotation(key);
    return notation === undefined ? { key } : { key, notation };
  });
  const ids = [...new Set(entries.map((entry) => entry.notation?.elementType ?? OTHER_DRUM_GROUP))];
  const groups = ids.map((id) => ({ id, entries: entries.filter((entry) => (entry.notation?.elementType ?? OTHER_DRUM_GROUP) === id).sort(compareEntries) }));
  return groups.sort((a, b) => groupRank(a) - groupRank(b));
}

/** A column's name ("Hi-Hat", "Toms"). */
export function drumGroupName(id: string): string {
  const key = `drums.group.${id}`;
  return isMessageKey(key) ? t(key) : id;
}

/** A drum's name under its column ("Closed", "Rim shot"); "Key 27" for a key the kit lacks. */
export function drumVariantName(entry: DrumKeyEntry): string {
  const key = `drums.variant.${entry.key}`;
  return entry.notation !== undefined && isMessageKey(key) ? t(key) : t('drums.variant.key', { key: entry.key });
}

/** A drum's full name ("Hi-Hat · Open"). */
export function drumEntryName(group: DrumKeyGroup, entry: DrumKeyEntry): string {
  return t('drums.key.entryName', { group: drumGroupName(group.id), variant: drumVariantName(entry) });
}

/** A drum's key and the General MIDI sound it plays; where the score writes a drum Guitar Pro writes far off the staff. */
export function drumEntryDetail(entry: DrumKeyEntry): string {
  const { notation } = entry;
  if (notation === undefined) {
    return t('drums.key.otherKey', { key: entry.key });
  }
  const name = gmPercussionLabel(notation.outputKey) ?? '';
  const detail =
    notation.key === notation.outputKey
      ? t('drums.key.gmKey', { key: notation.key, name })
      : t('drums.key.kitKey', { key: notation.key, output: notation.outputKey, name });
  return drumPlacement(notation.key).position === notation.position ? detail : t('drums.key.offStaff', { detail });
}

/** Hangul and CJK characters take about an em; other characters about this share of one (a bold system font). */
const NARROW_CHARACTER_EM = 0.62;
const WIDE_CHARACTER = /[\u1100-\u11FF\u3000-\u9FFF\uAC00-\uD7AF]/;

/** About how wide a label is at `fontSize` (the drum key sizes its columns by it, before React lays them out). */
export function labelWidth(text: string, fontSize: number): number {
  return [...text].reduce((sum, character) => sum + fontSize * (WIDE_CHARACTER.test(character) ? 1 : NARROW_CHARACTER_EM), 0);
}

export interface DrumKeyRowsSpec {
  readonly maxWidth: number;
  /** Between two groups. */
  readonly gap: number;
  /** A group's width (its drums' columns, or its name when wider). */
  readonly widthOf: (group: DrumKeyGroup) => number;
}

/** A row's width: its groups and the gaps between them. */
export function drumKeyRowWidth(row: readonly DrumKeyGroup[], { gap, widthOf }: Omit<DrumKeyRowsSpec, 'maxWidth'>): number {
  return row.reduce((sum, group, index) => sum + (index > 0 ? gap : 0) + widthOf(group), 0);
}

/** The columns in rows up to `maxWidth` wide, a group never split (one wider than a row takes a row of its own). */
export function drumKeyRows(groups: readonly DrumKeyGroup[], spec: DrumKeyRowsSpec): readonly (readonly DrumKeyGroup[])[] {
  return groups.reduce<readonly (readonly DrumKeyGroup[])[]>((rows, group) => {
    const last = rows[rows.length - 1];
    if (last !== undefined && drumKeyRowWidth([...last, group], spec) <= spec.maxWidth) {
      return [...rows.slice(0, -1), [...last, group]];
    }
    return [...rows, [group]];
  }, []);
}
