import type { Bend, BendPoint } from '../../src/model/song';

/*
 * Bend and whammy curves as a 'gp' round trip returns them (the oracle for write-expected-gpif.ts, written apart from
 * src/write/gpif/gpif-curves.ts). GPIF holds a curve as an origin, an optional origin offset, at most two middle points
 * of one value and an optional destination offset; the reader always adds the first point (position 0) and the last
 * (position 12).
 *
 * - bend: a curve whose interior points are [one at the origin value]? [up to two of one value]* [one at the
 *   destination value]?, from 0 to 12, comes back as it is; any other comes back as its first point, its highest
 *   interior value at the first and at the last place it has it (twice when that is one place), and its last point;
 * - whammy (Guitar Pro 7's element always has an origin offset and a middle): a curve whose first interior point has the
 *   origin value, followed by one or two (later) points of one value and an optional destination point, comes back as it
 *   is; any other as its first point twice, its highest interior value (first place, then the last place when later;
 *   its last point when it has no interior) and its last point. Values are clamped to ±24 quarter tones first.
 */

const LAST_POSITION = 12;
const WHAMMY_LIMIT = 24;

type Kind = 'bend' | 'whammy';

function point(position: number, value: number): BendPoint {
  return { position, value };
}

function isOneValue(points: readonly BendPoint[]): boolean {
  return points.every((p) => p.value === points[0]?.value);
}

function fitsBend(interior: readonly BendPoint[], origin: number, destination: number): boolean {
  for (const hasOrigin of [true, false]) {
    for (const hasDestination of [true, false]) {
      const rest = hasOrigin ? interior.slice(1) : interior;
      const middle = hasDestination ? rest.slice(0, -1) : rest;
      const originOk = !hasOrigin || interior[0]?.value === origin;
      const destinationOk = !hasDestination || rest[rest.length - 1]?.value === destination;
      if (originOk && destinationOk && middle.length <= 2 && isOneValue(middle)) {
        return true;
      }
    }
  }
  return false;
}

function fitsWhammy(interior: readonly BendPoint[], origin: number, destination: number): boolean {
  const first = interior[0];
  if (first === undefined || first.value !== origin) {
    return false;
  }
  const rest = interior.slice(1);
  return [true, false].some((hasDestination) => {
    const middle = hasDestination ? rest.slice(0, -1) : rest;
    const destinationOk = !hasDestination || rest[rest.length - 1]?.value === destination;
    const [m1, m2] = middle;
    const orderOk = m1 !== undefined && m1.position >= first.position && (m2 === undefined || m2.position > m1.position);
    return destinationOk && middle.length <= 2 && isOneValue(middle) && orderOk;
  });
}

function extremeRun(interior: readonly BendPoint[]): readonly BendPoint[] {
  let extreme: BendPoint | undefined;
  for (const p of interior) {
    if (extreme === undefined || Math.abs(p.value) > Math.abs(extreme.value)) {
      extreme = p;
    }
  }
  const same = interior.filter((p) => p.value === extreme?.value);
  const first = same[0];
  const last = same[same.length - 1];
  return first === undefined || last === undefined ? [] : [first, last];
}

function fallback(kind: Kind, interior: readonly BendPoint[], origin: number, destination: number): BendPoint[] {
  const [first, last] = extremeRun(interior);
  if (kind === 'bend') {
    return [point(0, origin), ...(first === undefined || last === undefined ? [] : [first, last]), point(LAST_POSITION, destination)];
  }
  const middle = first === undefined || last === undefined ? [point(LAST_POSITION, destination)] : last.position > first.position ? [first, last] : [first];
  return [point(0, origin), point(0, origin), ...middle, point(LAST_POSITION, destination)];
}

export function expectedCurve(curve: Bend, kind: Kind): Bend {
  const points = curve.points.map((p) => (kind === 'whammy' ? point(p.position, Math.min(WHAMMY_LIMIT, Math.max(-WHAMMY_LIMIT, p.value))) : p));
  const first = points[0];
  const last = points[points.length - 1];
  const origin = first?.value ?? 0;
  const destination = last?.value ?? origin;
  const interior = points.slice(1, -1);
  const isSpanned = points.length >= 2 && first?.position === 0 && last?.position === LAST_POSITION;
  const fits = kind === 'bend' ? fitsBend(interior, origin, destination) : fitsWhammy(interior, origin, destination);
  return { points: isSpanned && fits ? points : fallback(kind, interior, origin, destination) };
}
