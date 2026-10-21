import { describe, expect, it } from 'vitest';
import { UnexpectedEndOfFileError } from '../src/errors';
import { ByteReader } from '../src/io/byte-reader';

const reader = (...values: number[]) => new ByteReader(new Uint8Array(values));

describe('ByteReader', () => {
  it('reads little-endian integers', () => {
    const r = reader(0xff, 0x01, 0xfe, 0xff, 0x78, 0x56, 0x34, 0x12, 0xff, 0xff, 0xff, 0xff);
    expect(r.readByte()).toBe(-1);
    expect(r.readUnsignedByte()).toBe(1);
    expect(r.readShort()).toBe(-2);
    expect(r.readInt()).toBe(0x12345678);
    expect(r.readInt()).toBe(-1);
    expect(r.isEof()).toBe(true);
  });

  it('reads booleans as byte === 1', () => {
    const r = reader(1, 0, 2);
    expect([r.readBoolean(), r.readBoolean(), r.readBoolean()]).toEqual([true, false, false]);
  });

  it('reads floats, doubles and longs', () => {
    const bytes = new Uint8Array(20);
    const view = new DataView(bytes.buffer);
    view.setFloat32(0, 1.5, true);
    view.setFloat64(4, -2.25, true);
    view.setBigInt64(12, 1234567890123n, true);
    const r = new ByteReader(bytes);
    expect(r.readFloat()).toBe(1.5);
    expect(r.readDouble()).toBe(-2.25);
    expect(r.readLong()).toBe(1234567890123n);
  });

  it('reads the Guitar Pro string layouts', () => {
    // readStringByte(5): length 2, then a fixed 5-byte block
    expect(reader(2, 0x48, 0x69, 0x21, 0, 0).readStringByte(5)).toBe('Hi');
    // readStringInteger: int32 length 3, then 3 bytes
    expect(reader(3, 0, 0, 0, 0x61, 0x62, 0x63).readStringInteger()).toBe('abc');
    // readStringByteSizeOfInteger: int32 block size 4 (+1), u8 length 2, block of 3
    const r = reader(4, 0, 0, 0, 2, 0x6f, 0x6b, 0x00, 0x99);
    expect(r.readStringByteSizeOfInteger()).toBe('ok');
    expect(r.readUnsignedByte()).toBe(0x99);
    // readStringByteSizeOfByte: u8 block size 3 (+1), u8 length 1, block of 2
    expect(reader(3, 1, 0x7a, 0).readStringByteSizeOfByte()).toBe('z');
  });

  it('uses the whole block when the length byte is larger than the block', () => {
    expect(reader(9, 0x61, 0x62).readStringByte(2)).toBe('ab');
  });

  it('tracks position and remaining bytes', () => {
    const r = reader(1, 2, 3, 4);
    r.skip(1);
    expect(r.readBytes(2)).toEqual(new Uint8Array([2, 3]));
    expect(r.position).toBe(3);
    expect(r.remaining).toBe(1);
    expect(r.length).toBe(4);
  });

  it('throws UnexpectedEndOfFileError past the end', () => {
    expect(() => reader(1, 2).readInt()).toThrow(UnexpectedEndOfFileError);
    expect(() => reader().readUnsignedByte()).toThrow(UnexpectedEndOfFileError);
    expect(() => reader(1).skip(2)).toThrow(UnexpectedEndOfFileError);
  });
});
