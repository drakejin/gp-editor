// Port of TuxGuitar app.tuxguitar.io.ptb.PTInputStream's readers (readByte, readShort, readString, readHeaderItems) (LGPL-2.1).
import { GpFormatError } from '../../errors';
import type { ByteReader } from '../../io/byte-reader';

/** readHeaderItems: the tag of an object whose class is named in the file (MFC CArchive's "new class" tag). */
const NEW_CLASS_TAG = 0xffff;
/** The only class schema TuxGuitar reads. */
const CLASS_SCHEMA = 1;
/** readString: a length byte of 0xff means a 16-bit length follows. */
const LONG_STRING = 0xff;

/**
 * Power Tab values as TuxGuitar reads them: bytes and shorts are unsigned, ints signed, a boolean is any non-zero byte.
 * Reading past the end throws UnexpectedEndOfFileError (TuxGuitar would read -1 and go on).
 */
export class PtByteReader {
  constructor(private readonly reader: ByteReader) {}

  readByte(): number {
    return this.reader.readUnsignedByte();
  }

  readShort(): number {
    return this.reader.readShort() & 0xffff;
  }

  readInt(): number {
    return this.reader.readInt();
  }

  readBoolean(): boolean {
    return this.reader.readUnsignedByte() > 0;
  }

  skip(count: number): void {
    this.reader.skip(count);
  }

  /** A length byte (0xff: a 16-bit length follows), then the text. */
  readString(): string {
    const length = this.readByte();
    return this.reader.readString(length < LONG_STRING ? length : this.readShort());
  }

  /**
   * The size of an object array, then (when it is not empty) its first object's class tag: a new class has its schema
   * and name. TuxGuitar gives up on any schema but 1 and goes on reading out of step; here the file is rejected.
   */
  readHeaderItems(): number {
    const count = this.readShort();
    if (count !== 0 && this.readShort() === NEW_CLASS_TAG) {
      const schema = this.readShort();
      if (schema !== CLASS_SCHEMA) {
        throw new GpFormatError(`Unsupported Power Tab object schema ${schema} at byte ${this.reader.position - 2}`);
      }
      this.reader.readString(this.readShort());
    }
    return count;
  }

  /** An object array: `read` runs once per object; the class tag between two objects is skipped. Returns the size. */
  readItems(read: (index: number) => void): number {
    const count = this.readHeaderItems();
    for (let index = 0; index < count; index++) {
      read(index);
      if (index < count - 1) {
        this.readShort();
      }
    }
    return count;
  }
}
