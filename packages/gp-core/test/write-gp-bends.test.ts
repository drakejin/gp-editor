import { describe, expect, it } from 'vitest';
import { ByteReader } from '../src/io/byte-reader';
import type { Bend } from '../src/model/song';
import { ByteWriter } from '../src/write/byte-writer';
import { type CurveKind, writeBendCurve } from '../src/write/gp-bends';

/** Curve values (quarter tones) at evenly spaced positions. */
function curve(...values: readonly number[]): Bend {
  const step = values.length > 1 ? 12 / (values.length - 1) : 0;
  return { points: values.map((value, i) => ({ position: Math.round(i * step), value })) };
}

function header(bend: Bend, kind: CurveKind): { readonly type: number; readonly height: number; readonly count: number } {
  const writer = new ByteWriter();
  writeBendCurve(writer, bend, kind);
  const reader = new ByteReader(writer.toBytes());
  return { type: reader.readByte(), height: reader.readInt(), count: reader.readInt() };
}

describe('writeBendCurve', () => {
  it('writes the points as GP units: position × 5, value × 25, no vibrato', () => {
    // Arrange
    const writer = new ByteWriter();

    // Act
    writeBendCurve(writer, { points: [{ position: 0, value: 0 }, { position: 6, value: 4 }] }, 'bend');

    // Assert
    const reader = new ByteReader(writer.toBytes());
    reader.skip(9);
    expect([reader.readInt(), reader.readInt(), reader.readByte(), reader.readInt(), reader.readInt(), reader.readByte()]).toEqual([
      0, 0, 0, 30, 100, 0,
    ]);
  });

  it.each([
    ['bend', curve(0, 4, 4), 1],
    ['bend and release', curve(0, 4, 0), 2],
    ['bend, release, bend', curve(0, 4, 0, 4), 3],
    ['prebend', curve(4, 4), 4],
    ['prebend and release', curve(4, 0), 5],
  ] as const)('names a %s curve with Guitar Pro type %i', (_, bend, type) => {
    expect(header(bend, 'bend').type).toBe(type);
  });

  it.each([
    ['dip', curve(0, -4, 0), 6],
    ['dive', curve(0, -8), 7],
    ['release up', curve(-4, 0), 8],
    ['inverted dip', curve(0, 4, 0), 9],
    ['release down', curve(4, 0), 11],
  ] as const)('names a %s tremolo bar with Guitar Pro type %i', (_, bend, type) => {
    expect(header(bend, 'tremoloBar').type).toBe(type);
  });

  it('writes a height of a full tone at most (half a tone for a half-tone bend)', () => {
    expect(header(curve(0, 2), 'bend').height).toBe(50);
    expect(header(curve(0, 12), 'bend').height).toBe(100);
    expect(header(curve(0, -8), 'tremoloBar').height).toBe(100);
  });
});
