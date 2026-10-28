// Bend and whammy curves for GPIF (no TuxGuitar counterpart): the inverse of the reader's parseBend / parseTremoloBar.
import { CURVE_VALUE_RANGES, type CurveEffect, normalizeCurvePoints } from '../../edit/curve-points';
import { BEND_MAX_POSITION, TREMOLO_BAR_LIMIT } from '../../formats/common/bend-units';
import type { GpifBendCurve } from '../../formats/gpif/gpif-document';
import { bendFromCurve, tremoloBarFromCurve } from '../../formats/gpif/gpif-note';
import type { Bend, BendPoint } from '../../model/song';

/** GPIF curve offsets run 0…100 (percent of the note); values are 1/100 tones, 25 = a quarter tone. */
const GP_CURVE_POSITION = 100;
const GP_QUARTER_TONE = 25;
/** The reader skips a bend middle offset of exactly 12 (Guitar Pro's "no middle" marker, as TuxGuitar reads it). */
const SKIPPED_MIDDLE_OFFSET = 12;
/** The reader only turns a destination offset below 100 into a point. */
const LAST_DESTINATION_OFFSET = GP_CURVE_POSITION - 1;

/** A curve with every value present, as the `<Whammy>` element holds it. */
export type CompleteCurve = { readonly [K in keyof GpifBendCurve]: number };

/** Which interior points of a curve take the origin-offset and destination-offset roles; the rest are middle points. */
interface Split {
  readonly origin: BendPoint | undefined;
  readonly middle: readonly BendPoint[];
  readonly destination: BendPoint | undefined;
}

/** A curve with its first and last value and its interior points. */
interface CurveShape {
  readonly origin: number;
  readonly destination: number;
  readonly interior: readonly BendPoint[];
  /** Whether it starts at 0 and ends at 12, as every curve the reader returns does. */
  readonly isSpanned: boolean;
}

function shapeOf(points: readonly BendPoint[]): CurveShape {
  const first = points[0];
  const last = points[points.length - 1];
  const origin = first?.value ?? 0;
  return {
    origin,
    destination: last?.value ?? origin,
    interior: points.slice(1, -1),
    isSpanned: points.length >= 2 && first?.position === 0 && last?.position === BEND_MAX_POSITION,
  };
}

/** Model position 0…12 → GPIF offset (the reader truncates the offset and rounds it back to 0…12). */
function offsetOf(position: number): number {
  return Math.round((position * GP_CURVE_POSITION) / BEND_MAX_POSITION);
}

function rawValueOf(value: number): number {
  return Math.round(value * GP_QUARTER_TONE);
}

function destinationOffsetOf(split: Split): number {
  return split.destination === undefined ? GP_CURVE_POSITION : Math.min(LAST_DESTINATION_OFFSET, offsetOf(split.destination.position));
}

/** The ways the interior points can take the origin / middle / destination roles (origin and destination tried first). */
function splits(shape: CurveShape, origins: readonly boolean[]): Split[] {
  const { interior, origin, destination } = shape;
  const result: Split[] = [];
  for (const hasOrigin of origins) {
    for (const hasDestination of [true, false]) {
      const first = hasOrigin ? interior[0] : undefined;
      const rest = hasOrigin ? interior.slice(1) : interior;
      const last = hasDestination ? rest[rest.length - 1] : undefined;
      const middle = hasDestination ? rest.slice(0, -1) : rest;
      const isValid =
        (!hasOrigin || first?.value === origin) &&
        (!hasDestination || last?.value === destination) &&
        middle.length <= 2 &&
        middle.every((point) => point.value === middle[0]?.value);
      if (isValid) {
        result.push({ origin: first, middle, destination: last });
      }
    }
  }
  return result;
}

function isSameCurve(read: Bend | undefined, points: readonly BendPoint[]): boolean {
  return (
    read !== undefined &&
    read.points.length === points.length &&
    read.points.every((point, i) => point.position === points[i]?.position && point.value === points[i]?.value)
  );
}

/** A curve GPIF cannot hold exactly: its highest interior value, from the first to the last place it has it. */
function extremeRun(interior: readonly BendPoint[]): readonly BendPoint[] {
  const extreme = interior.reduce<BendPoint | undefined>(
    (best, point) => (best === undefined || Math.abs(point.value) > Math.abs(best.value) ? point : best),
    undefined,
  );
  if (extreme === undefined) {
    return [];
  }
  const same = interior.filter((point) => point.value === extreme.value);
  return [same[0] ?? extreme, same[same.length - 1] ?? extreme];
}

function fitCurve<C extends GpifBendCurve>(
  shape: CurveShape,
  candidates: readonly Split[],
  build: (split: Split) => C,
  read: (curve: GpifBendCurve) => Bend | undefined,
  points: readonly BendPoint[],
): C | undefined {
  if (!shape.isSpanned) {
    return undefined;
  }
  return candidates.map(build).find((curve) => isSameCurve(read(curve), points));
}

function bendMiddle(middle: readonly BendPoint[]): Pick<GpifBendCurve, 'middleOffset1' | 'middleOffset2'> {
  const [first, second] = middle;
  // Offset 12 is skipped by the reader: no middle point, or a single one.
  return {
    middleOffset1: first === undefined ? SKIPPED_MIDDLE_OFFSET : offsetOf(first.position),
    middleOffset2: second === undefined ? SKIPPED_MIDDLE_OFFSET : offsetOf(second.position),
  };
}

function bendCurve(shape: CurveShape, split: Split): GpifBendCurve {
  const middle = split.middle[0];
  return {
    originValue: rawValueOf(shape.origin),
    originOffset: split.origin === undefined ? undefined : offsetOf(split.origin.position),
    // Without a middle point Guitar Pro still writes a middle value, half way.
    middleValue: middle === undefined ? Math.round((rawValueOf(shape.origin) + rawValueOf(shape.destination)) / 2) : rawValueOf(middle.value),
    ...bendMiddle(split.middle),
    destinationValue: rawValueOf(shape.destination),
    destinationOffset: destinationOffsetOf(split),
  };
}

/**
 * The GPIF bend curve (BendOriginValue … BendDestinationOffset properties; a property left undefined is not written)
 * the reader reads back as `bend`. A curve GPIF cannot hold (more than two middle points, or not running from 0 to 12)
 * reads back as its start, its highest interior value (first and last place) and its end.
 */
export function bendCurveOf(bend: Bend): GpifBendCurve {
  const shape = shapeOf(bend.points);
  const build = (split: Split): GpifBendCurve => bendCurve(shape, split);
  return (
    fitCurve(shape, splits(shape, [true, false]), build, bendFromCurve, bend.points) ??
    build({ origin: undefined, middle: extremeRun(shape.interior), destination: undefined })
  );
}

/** A whammy written as Guitar Pro 7's `<Whammy>` element: every value present (the reader takes a missing one as 0). */
function whammyCurve(shape: CurveShape, split: Split): CompleteCurve {
  const [first, second] = split.middle;
  const middle = first ?? { position: BEND_MAX_POSITION, value: shape.destination };
  return {
    originValue: rawValueOf(shape.origin),
    originOffset: offsetOf(split.origin?.position ?? 0),
    middleValue: rawValueOf(middle.value),
    middleOffset1: offsetOf(middle.position),
    middleOffset2: offsetOf((second ?? middle).position),
    destinationValue: rawValueOf(shape.destination),
    destinationOffset: destinationOffsetOf(split),
  };
}

/**
 * The `<Whammy>` attributes the reader reads back as `tremoloBar` (values clamped to an octave either way). The element
 * always has an origin offset and a middle, so a curve from GP3–GP5 reads back with its start twice, then its highest
 * interior value (first and last place; its end when it has none) and its end.
 */
export function whammyCurveOf(tremoloBar: Bend): CompleteCurve {
  const points = tremoloBar.points.map((point) => ({
    ...point,
    value: Math.min(TREMOLO_BAR_LIMIT, Math.max(-TREMOLO_BAR_LIMIT, point.value)),
  }));
  const shape = shapeOf(points);
  const build = (split: Split): CompleteCurve => whammyCurve(shape, split);
  const candidates = splits(shape, [true]).filter((split) => split.middle.length > 0);
  return (
    fitCurve(shape, candidates, build, tremoloBarFromCurve, points) ??
    build({ origin: undefined, middle: extremeRun(shape.interior), destination: undefined })
  );
}

/** The curve a Guitar Pro 7/8 (.gp) file keeps of `curve`: what the reader gives back for the curve the writer writes. */
export function toGpifCurve(effect: CurveEffect, curve: Bend): Bend | undefined {
  return effect === 'bend' ? bendFromCurve(bendCurveOf(curve)) : tremoloBarFromCurve(whammyCurveOf(curve));
}

/**
 * Whether a .gp file keeps the curve's shape: its points (one per position, as the curve editor keeps them) read back
 * the same. GPIF holds a start, a middle of one value at one or two places and an end, each with an offset.
 */
export function canGpifHoldCurve(effect: CurveEffect, curve: Bend): boolean {
  const range = CURVE_VALUE_RANGES[effect];
  const kept = normalizeCurvePoints(toGpifCurve(effect, curve)?.points ?? [], range);
  return isSameCurve({ points: kept }, normalizeCurvePoints(curve.points, range));
}
