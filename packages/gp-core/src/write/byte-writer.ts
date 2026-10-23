// Port of TuxGuitar app.tuxguitar.io.gtp.GTPOutputStream (LGPL-2.1): little-endian output and the Guitar Pro string layouts.
import { encodeGpString } from './gp-strings';

const INITIAL_CAPACITY = 4096;
/** Strings whose length is stored in one byte hold at most 255 bytes. */
const MAX_BYTE_LENGTH = 255;

/**
 * Growable little-endian output buffer. Method names follow TuxGuitar's GTPOutputStream (and our
 * ByteReader) so the writers can be compared line by line with it. Every write returns `this`.
 */
export class ByteWriter {
  private buffer = new Uint8Array(INITIAL_CAPACITY);
  private length = 0;

  get position(): number {
    return this.length;
  }

  /** Low 8 bits of `value`: -1 and 255 both write 0xFF. */
  writeByte(value: number): this {
    this.ensure(1);
    this.buffer[this.length++] = value & 0xff;
    return this;
  }

  writeUnsignedByte(value: number): this {
    return this.writeByte(value);
  }

  writeBoolean(value: boolean): this {
    return this.writeByte(value ? 1 : 0);
  }

  writeShort(value: number): this {
    return this.writeByte(value).writeByte(value >> 8);
  }

  writeInt(value: number): this {
    return this.writeByte(value).writeByte(value >> 8).writeByte(value >> 16).writeByte(value >> 24);
  }

  /** An IEEE 754 double, little-endian (GTPOutputStream.writeDouble). */
  writeDouble(value: number): this {
    const bytes = new Uint8Array(8);
    new DataView(bytes.buffer).setFloat64(0, value, true);
    return this.writeBytes(bytes);
  }

  writeBytes(bytes: ArrayLike<number>): this {
    this.ensure(bytes.length);
    for (let i = 0; i < bytes.length; i++) {
      this.buffer[this.length++] = (bytes[i] ?? 0) & 0xff;
    }
    return this;
  }

  /** `count` zero bytes (GTPOutputStream.skipBytes). */
  skipBytes(count: number): this {
    this.ensure(count);
    this.length += Math.max(0, count);
    return this;
  }

  /** u8 length, then a block of `size` bytes: the string cut to `size`, padded with zeros. */
  writeStringByte(text: string, size: number): this {
    const bytes = encodeGpString(text, size);
    return this.writeUnsignedByte(bytes.length).writeBytes(bytes).skipBytes(size - bytes.length);
  }

  /** int32 block size (length + 1), u8 length, then the bytes (at most 255). */
  writeStringByteSizeOfInteger(text: string): this {
    const bytes = encodeGpString(text, MAX_BYTE_LENGTH);
    return this.writeInt(bytes.length + 1).writeUnsignedByte(bytes.length).writeBytes(bytes);
  }

  /** int32 length, then the bytes. */
  writeStringInteger(text: string): this {
    const bytes = encodeGpString(text);
    return this.writeInt(bytes.length).writeBytes(bytes);
  }

  /** A copy of the bytes written so far. */
  toBytes(): Uint8Array {
    return this.buffer.slice(0, this.length);
  }

  private ensure(count: number): void {
    if (this.length + count <= this.buffer.length) {
      return;
    }
    const grown = new Uint8Array(Math.max(this.buffer.length * 2, this.length + count));
    grown.set(this.buffer.subarray(0, this.length));
    this.buffer = grown;
  }
}
