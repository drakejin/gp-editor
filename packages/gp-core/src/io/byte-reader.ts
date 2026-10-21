import { UnexpectedEndOfFileError } from '../errors';
import { type Charset, decodeText } from './text';

/**
 * Little-endian cursor over a byte array, with the string helpers the Guitar Pro
 * 1–5 binary formats use. Method names follow TuxGuitar's GTPInputStream so the
 * readers can be compared line by line with it.
 *
 * Reading past the end throws UnexpectedEndOfFileError.
 */
export class ByteReader {
  private offset = 0;
  private readonly view: DataView;

  constructor(
    private readonly bytes: Uint8Array,
    private readonly charset: Charset = 'auto',
  ) {
    this.view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  }

  get position(): number {
    return this.offset;
  }

  get length(): number {
    return this.bytes.length;
  }

  get remaining(): number {
    return this.bytes.length - this.offset;
  }

  isEof(): boolean {
    return this.offset >= this.bytes.length;
  }

  skip(count: number): void {
    this.ensure(count);
    this.offset += count;
  }

  readBytes(count: number): Uint8Array {
    this.ensure(count);
    const slice = this.bytes.subarray(this.offset, this.offset + count);
    this.offset += count;
    return slice;
  }

  /** 0–255 */
  readUnsignedByte(): number {
    this.ensure(1);
    return this.view.getUint8(this.offset++);
  }

  /** -128–127 */
  readByte(): number {
    this.ensure(1);
    return this.view.getInt8(this.offset++);
  }

  /** True only for the byte value 1, like TuxGuitar. */
  readBoolean(): boolean {
    return this.readUnsignedByte() === 1;
  }

  readShort(): number {
    this.ensure(2);
    const value = this.view.getInt16(this.offset, true);
    this.offset += 2;
    return value;
  }

  readInt(): number {
    this.ensure(4);
    const value = this.view.getInt32(this.offset, true);
    this.offset += 4;
    return value;
  }

  readLong(): bigint {
    this.ensure(8);
    const value = this.view.getBigInt64(this.offset, true);
    this.offset += 8;
    return value;
  }

  readFloat(): number {
    this.ensure(4);
    const value = this.view.getFloat32(this.offset, true);
    this.offset += 4;
    return value;
  }

  readDouble(): number {
    this.ensure(8);
    const value = this.view.getFloat64(this.offset, true);
    this.offset += 8;
    return value;
  }

  /**
   * Reads `size` bytes (or `len` bytes when size <= 0) and decodes the first `len`
   * of them. Mirrors GTPInputStream.readString(size, len).
   */
  readString(size: number, len: number = size): string {
    const count = size > 0 ? size : len;
    const raw = this.readBytes(Math.max(0, count));
    const used = len >= 0 && len <= raw.length ? len : Math.max(0, size);
    return decodeText(raw.subarray(0, used), this.charset);
  }

  /** int32 length, then that many bytes. */
  readStringInteger(): string {
    return this.readString(this.readInt());
  }

  /** u8 length, then a fixed block of `size` bytes. */
  readStringByte(size: number): string {
    return this.readString(size, this.readUnsignedByte());
  }

  /** u8 block size (+1), u8 length, then the block. */
  readStringByteSizeOfByte(): string {
    return this.readStringByte(this.readUnsignedByte() - 1);
  }

  /** int32 block size (+1), u8 length, then the block. */
  readStringByteSizeOfInteger(): string {
    return this.readStringByte(this.readInt() - 1);
  }

  private ensure(count: number): void {
    if (count < 0 || this.offset + count > this.bytes.length) {
      throw new UnexpectedEndOfFileError(this.offset, count, this.bytes.length);
    }
  }
}
