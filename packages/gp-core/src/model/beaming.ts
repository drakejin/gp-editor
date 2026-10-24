// Beam grouping of a bar (no TuxGuitar counterpart: TuxGuitar keeps no beaming). Guitar Pro 5 stores four groups of
// eighth notes with each time signature, GPIF up to 32 groups of any note value per master bar.
import { isNoteValue, measureTicks } from './defaults';
import type { BeamGrouping, MeasureHeader, TimeSignature } from './song';

/** Groups a GPIF master bar holds (XProperties 1124139264 … 1124139295). */
export const MAX_BEAM_GROUPS = 32;
/** The longest group a file may give (a 16/4 bar in eighths is 32 units); longer ones are not read. */
export const MAX_BEAM_GROUP_SIZE = 128;
const EIGHTH = 8;
const COMPOUND_BEAT = 3;
const QUARTERS_PER_WHOLE = 4;

function isCompound({ numerator, denominator }: TimeSignature): boolean {
  return denominator >= EIGHTH && numerator % COMPOUND_BEAT === 0;
}

/** Groups of `size` units filling `total` units; the last one shorter when they do not divide it. */
function groupsOf(total: number, size: number): readonly number[] {
  const whole = Math.floor(total / size);
  const rest = total - whole * size;
  return [...new Array<number>(whole).fill(size), ...(rest > 0 ? [rest] : [])];
}

/**
 * The time signature's own grouping: one group per beat (4/4: 2+2+2+2 eighths, 2/2: 4+4), per dotted beat in compound
 * time (6/8: 3+3), per quarter note for other eighth, sixteenth … meters (7/8: 2+2+2+1).
 */
export function defaultBeamGrouping(timeSignature: TimeSignature): BeamGrouping {
  const { numerator, denominator } = timeSignature;
  const unit = isNoteValue(denominator) && denominator >= EIGHTH ? denominator : EIGHTH;
  if (isCompound(timeSignature)) {
    return { unit, groups: new Array<number>(numerator / COMPOUND_BEAT).fill(COMPOUND_BEAT) };
  }
  const total = (numerator * unit) / denominator;
  const beat = denominator >= EIGHTH ? unit / QUARTERS_PER_WHOLE : unit / denominator;
  return { unit, groups: groupsOf(total, beat) };
}

/** Ready-made groupings the editor offers: the time signature's own, two beats per beam, or the whole bar. */
export type BeamGroupingPreset = 'byBeat' | 'byTwoBeats' | 'byBar';

export const BEAM_GROUPING_PRESETS: readonly BeamGroupingPreset[] = ['byBeat', 'byTwoBeats', 'byBar'];

function pairs(groups: readonly number[]): readonly number[] {
  return groups.flatMap((size, index) => (index % 2 === 1 ? [] : [size + (groups[index + 1] ?? 0)]));
}

/** A preset's grouping for a time signature (byTwoBeats joins the beats in pairs: 7/8 2+2+2+1 → 4+3). */
export function presetBeamGrouping(timeSignature: TimeSignature, preset: BeamGroupingPreset): BeamGrouping {
  const beats = defaultBeamGrouping(timeSignature);
  switch (preset) {
    case 'byTwoBeats':
      return { unit: beats.unit, groups: pairs(beats.groups) };
    case 'byBar':
      return { unit: beats.unit, groups: [beats.groups.reduce((sum, size) => sum + size, 0)] };
    default:
      return beats;
  }
}

/** The bar's grouping: its own, else the time signature's. */
export function effectiveBeamGrouping(header: Pick<MeasureHeader, 'timeSignature' | 'beamGrouping'>): BeamGrouping {
  return header.beamGrouping ?? defaultBeamGrouping(header.timeSignature);
}

/** Where each group starts, in ticks from the bar start, then where the last one ends. */
export function beamGroupBounds(grouping: BeamGrouping): readonly number[] {
  const unitTicks = measureTicks(1, grouping.unit);
  return grouping.groups.reduce<readonly number[]>((bounds, size) => [...bounds, (bounds.at(-1) ?? 0) + size * unitTicks], [0]);
}

/** The same group boundaries, whatever unit counts them (16ths 4+4 = eighths 2+2). */
export function isSameBeamGrouping(a: BeamGrouping, b: BeamGrouping): boolean {
  const boundsA = beamGroupBounds(a);
  const boundsB = beamGroupBounds(b);
  return boundsA.length === boundsB.length && boundsA.every((bound, i) => bound === boundsB[i]);
}

/** The grouping to store for a bar: none when it is the time signature's own. */
export function normalizeBeamGrouping(grouping: BeamGrouping | undefined, timeSignature: TimeSignature): BeamGrouping | undefined {
  return grouping === undefined || isSameBeamGrouping(grouping, defaultBeamGrouping(timeSignature)) ? undefined : grouping;
}

function isGroupSize(size: number): boolean {
  return Number.isInteger(size) && size >= 1 && size <= MAX_BEAM_GROUP_SIZE;
}

/**
 * A grouping from a file: a note value and the group sizes up to the first empty (0 or negative) slot, at most
 * MAX_BEAM_GROUPS of them. Undefined for an unknown unit, no group, or a size that is not a whole 1…MAX_BEAM_GROUP_SIZE.
 */
export function parseBeamGrouping(unit: number, sizes: readonly number[]): BeamGrouping | undefined {
  const end = sizes.findIndex((size) => !(size > 0));
  const groups = sizes.slice(0, end < 0 ? sizes.length : end).slice(0, MAX_BEAM_GROUPS);
  if (!isNoteValue(unit) || groups.length === 0 || !groups.every(isGroupSize)) {
    return undefined;
  }
  return { unit, groups };
}
