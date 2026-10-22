// Port of TuxGuitar GP4OutputStream/GP5OutputStream#writeBend / #writeTremoloBar (LGPL-2.1), with Guitar Pro's curve types.
import type { Bend } from '../model/song';
import type { ByteWriter } from './byte-writer';
import { bendPositionToGp, bendValueToGp } from './gp-units';

/** Guitar Pro's curve presets: what its bend editor shows. The readers only use the points. */
const BEND_TYPE = { bend: 1, bendRelease: 2, bendReleaseBend: 3, prebend: 4, prebendRelease: 5 } as const;
const WHAMMY_TYPE = { dip: 6, dive: 7, releaseUp: 8, invertedDip: 9, releaseDown: 11 } as const;
/** The curve's height in the header (1/100 tones): Guitar Pro writes a full tone, or less for smaller curves. */
const FULL_TONE = 100;

export type CurveKind = 'bend' | 'tremoloBar';

function bendType(values: readonly number[]): number {
  const first = values[0] ?? 0;
  const last = values[values.length - 1] ?? 0;
  if (first > 0) {
    return last === 0 ? BEND_TYPE.prebendRelease : BEND_TYPE.prebend;
  }
  const rises = values.filter((value, i) => i > 0 && value > 0 && (values[i - 1] ?? 0) <= 0).length;
  if (rises >= 2) {
    return BEND_TYPE.bendReleaseBend;
  }
  return rises > 0 && last === 0 ? BEND_TYPE.bendRelease : BEND_TYPE.bend;
}

function whammyType(values: readonly number[]): number {
  const first = values[0] ?? 0;
  const last = values[values.length - 1] ?? 0;
  if (first === 0 && last === 0) {
    return values.some((value) => value < 0) ? WHAMMY_TYPE.dip : WHAMMY_TYPE.invertedDip;
  }
  if (first === 0 || last !== 0) {
    return WHAMMY_TYPE.dive;
  }
  return first < 0 ? WHAMMY_TYPE.releaseUp : WHAMMY_TYPE.releaseDown;
}

/** GP4/GP5 bend or tremolo bar: type, height, then the points (position 0…60, value in 1/100 tones, vibrato). */
export function writeBendCurve(writer: ByteWriter, curve: Bend, kind: CurveKind): void {
  const values = curve.points.map((point) => bendValueToGp(point.value));
  const height = Math.min(FULL_TONE, values.reduce((max, value) => Math.max(max, Math.abs(value)), 0));
  writer.writeByte(kind === 'bend' ? bendType(values) : whammyType(values)).writeInt(height);
  writer.writeInt(curve.points.length);
  curve.points.forEach((point, i) => {
    writer.writeInt(bendPositionToGp(point.position)).writeInt(values[i] ?? 0).writeByte(0);
  });
}
