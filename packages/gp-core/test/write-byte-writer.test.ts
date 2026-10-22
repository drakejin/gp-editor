import { describe, expect, it } from 'vitest';
import { ByteReader } from '../src/io/byte-reader';
import { ByteWriter } from '../src/write/byte-writer';

function written(write: (writer: ByteWriter) => void): number[] {
  const writer = new ByteWriter();
  write(writer);
  return [...writer.toBytes()];
}

describe('ByteWriter', () => {
  it('writes little-endian integers, shorts and bytes', () => {
    // Arrange / Act
    const bytes = written((writer) => {
      writer.writeByte(-1);
      writer.writeUnsignedByte(200);
      writer.writeShort(-2);
      writer.writeInt(0x12345678);
      writer.writeInt(-1);
    });

    // Assert
    expect(bytes).toEqual([0xff, 200, 0xfe, 0xff, 0x78, 0x56, 0x34, 0x12, 0xff, 0xff, 0xff, 0xff]);
  });

  it('writes booleans as 1 and 0, raw bytes and zero padding', () => {
    // Arrange / Act
    const bytes = written((writer) => {
      writer.writeBoolean(true);
      writer.writeBoolean(false);
      writer.writeBytes([7, -1]);
      writer.skipBytes(3);
    });

    // Assert
    expect(bytes).toEqual([1, 0, 7, 0xff, 0, 0, 0]);
  });

  it('grows past its initial capacity', () => {
    // Arrange
    const count = 10_000;

    // Act
    const bytes = written((writer) => {
      for (let i = 0; i < count; i++) {
        writer.writeInt(i);
      }
    });

    // Assert
    expect(bytes).toHaveLength(count * 4);
    const reader = new ByteReader(new Uint8Array(bytes));
    expect(Array.from({ length: count }, () => reader.readInt())).toEqual(Array.from({ length: count }, (_, i) => i));
  });

  it('reports its position', () => {
    // Arrange
    const writer = new ByteWriter();

    // Act
    writer.writeInt(1);
    writer.writeByte(1);

    // Assert
    expect(writer.position).toBe(5);
  });

  it('writes a length byte and a fixed block (GTPOutputStream.writeStringByte)', () => {
    // Arrange / Act
    const bytes = written((writer) => writer.writeStringByte('Hi', 5));

    // Assert
    expect(bytes).toEqual([2, 0x48, 0x69, 0, 0, 0]);
  });

  it('truncates a string to its fixed block', () => {
    // Arrange / Act
    const bytes = written((writer) => writer.writeStringByte('abcdef', 3));

    // Assert
    expect(bytes).toEqual([3, 0x61, 0x62, 0x63]);
  });

  it('writes an int32 length then the bytes (writeStringInteger)', () => {
    // Arrange / Act
    const bytes = written((writer) => writer.writeStringInteger('abc'));

    // Assert
    expect(bytes).toEqual([3, 0, 0, 0, 0x61, 0x62, 0x63]);
  });

  it('writes an int32 block size, a length byte and the bytes (writeStringByteSizeOfInteger)', () => {
    // Arrange / Act
    const bytes = written((writer) => writer.writeStringByteSizeOfInteger('Hi'));

    // Assert
    expect(bytes).toEqual([3, 0, 0, 0, 2, 0x48, 0x69]);
  });

  it('keeps byte-sized strings within 255 bytes', () => {
    // Arrange
    const text = 'x'.repeat(300);

    // Act
    const reader = new ByteReader(new ByteWriter().writeStringByteSizeOfInteger(text).toBytes());

    // Assert
    expect(reader.readStringByteSizeOfInteger()).toBe('x'.repeat(255));
    expect(reader.isEof()).toBe(true);
  });

  it('writes the layouts ByteReader reads back', () => {
    // Arrange
    const writer = new ByteWriter()
      .writeStringByte('Track 1', 40)
      .writeStringByteSizeOfInteger('Moderate')
      .writeStringInteger('lyrics line');

    // Act
    const reader = new ByteReader(writer.toBytes());

    // Assert
    expect(reader.readStringByte(40)).toBe('Track 1');
    expect(reader.readStringByteSizeOfInteger()).toBe('Moderate');
    expect(reader.readStringInteger()).toBe('lyrics line');
    expect(reader.isEof()).toBe(true);
  });
});
