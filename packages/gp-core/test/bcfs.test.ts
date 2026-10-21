import { describe, expect, it } from 'vitest';
import { GpFormatError } from '../src/errors';
import { decompressBcfz, readBcfsFiles, readGpxContainer } from '../src/formats/gpif/bcfs';
import { loadFixture } from './helpers/fixtures';

const SECTOR = 0x1000;

function writeInt(target: Uint8Array, offset: number, value: number): void {
  new DataView(target.buffer, target.byteOffset, target.byteLength).setInt32(offset, value, true);
}

function ascii(text: string): Uint8Array {
  return Uint8Array.from(text, (c) => c.charCodeAt(0));
}

interface FakeFile {
  readonly name: string;
  readonly data: Uint8Array;
}

/** A BCFS image (without the 4-byte "BCFS" magic): sector 0 unused, one entry sector + data sectors per file. */
function buildBcfsImage(files: readonly FakeFile[]): Uint8Array {
  const sectors: Uint8Array[] = [new Uint8Array(SECTOR)];
  for (const file of files) {
    const entry = new Uint8Array(SECTOR);
    const dataSectors = Math.max(1, Math.ceil(file.data.length / SECTOR));
    writeInt(entry, 0, 2);
    entry.set(ascii(file.name), 4);
    writeInt(entry, 0x8c, file.data.length);
    const first = sectors.length + 1;
    for (let i = 0; i < dataSectors; i++) {
      writeInt(entry, 0x94 + 4 * i, first + i);
    }
    sectors.push(entry);
    for (let i = 0; i < dataSectors; i++) {
      const sector = new Uint8Array(SECTOR);
      sector.set(file.data.subarray(i * SECTOR, (i + 1) * SECTOR));
      sectors.push(sector);
    }
  }
  const image = new Uint8Array(sectors.length * SECTOR);
  sectors.forEach((sector, i) => image.set(sector, i * SECTOR));
  return image;
}

/** MSB-first bit writer producing the BCFZ bit stream. */
class BitWriter {
  private readonly bits: number[] = [];

  write(value: number, count: number): void {
    for (let i = count - 1; i >= 0; i--) {
      this.bits.push((value >> i) & 1);
    }
  }

  writeReversed(value: number, count: number): void {
    for (let i = 0; i < count; i++) {
      this.bits.push((value >> i) & 1);
    }
  }

  bytes(): Uint8Array {
    const out = new Uint8Array(Math.ceil(this.bits.length / 8));
    this.bits.forEach((bit, i) => {
      out[i >> 3] = (out[i >> 3] ?? 0) | (bit << (7 - (i & 7)));
    });
    return out;
  }
}

/** BCFZ body (after the magic): int32 length + literal chunks of up to 3 bytes. */
function compressLiterals(data: Uint8Array): Uint8Array {
  const writer = new BitWriter();
  for (let i = 0; i < data.length; i += 3) {
    const chunk = data.subarray(i, i + 3);
    writer.write(0, 1);
    writer.writeReversed(chunk.length, 2);
    chunk.forEach((byte) => writer.write(byte, 8));
  }
  const stream = writer.bytes();
  const body = new Uint8Array(4 + stream.length);
  writeInt(body, 0, data.length);
  body.set(stream, 4);
  return body;
}

function withMagic(magic: string, body: Uint8Array): Uint8Array {
  const out = new Uint8Array(4 + body.length);
  out.set(ascii(magic));
  out.set(body, 4);
  return out;
}

describe('readGpxContainer', () => {
  it('lists the files of the compressed alphaTab fixture with their sizes', () => {
    // Arrange
    const bytes = loadFixture('guitarpro6', 'file-system-compressed.gpx');

    // Act
    const files = readGpxContainer(bytes);

    // Assert
    expect([...files.keys()]).toEqual([
      'score.gpif',
      'misc.xml',
      'BinaryStylesheet',
      'PartConfiguration',
      'LayoutConfiguration',
    ]);
    expect([...files.values()].map((data) => data.length)).toEqual([8488, 130, 12204, 20, 12]);
  });

  it('reads an uncompressed BCFS container spanning several sectors', () => {
    // Arrange
    const big = Uint8Array.from({ length: SECTOR + 100 }, (_, i) => i % 251);
    const image = buildBcfsImage([
      { name: 'score.gpif', data: ascii('<GPIF/>') },
      { name: 'big.bin', data: big },
    ]);

    // Act
    const files = readGpxContainer(withMagic('BCFS', image));

    // Assert
    expect(new TextDecoder().decode(files.get('score.gpif'))).toBe('<GPIF/>');
    expect(files.get('big.bin')).toEqual(big);
  });

  it('reads a BCFZ container made of literal chunks', () => {
    // Arrange
    const image = withMagic('BCFS', buildBcfsImage([{ name: 'score.gpif', data: ascii('<GPIF>x</GPIF>') }]));

    // Act
    const files = readGpxContainer(withMagic('BCFZ', compressLiterals(image)));

    // Assert
    expect(new TextDecoder().decode(files.get('score.gpif'))).toBe('<GPIF>x</GPIF>');
  });

  it('rejects data that is neither BCFZ nor BCFS', () => {
    expect(() => readGpxContainer(ascii('PK\u0003\u0004 not a gpx'))).toThrow(GpFormatError);
    expect(() => readGpxContainer(new Uint8Array(2))).toThrow(/BCFZ or BCFS/);
  });

  it('rejects a truncated BCFZ header', () => {
    expect(() => readGpxContainer(ascii('BCFZ\u0001'))).toThrow(GpFormatError);
  });

  it('rejects a BCFZ back-reference that points before the start of the output', () => {
    // Arrange: one back-reference (flag 1, 4-bit word size 2, offset 3, size 1) into empty output.
    const writer = new BitWriter();
    writer.write(1, 1);
    writer.write(2, 4);
    writer.writeReversed(3, 2);
    writer.writeReversed(1, 2);
    const stream = writer.bytes();
    const body = new Uint8Array(4 + stream.length);
    writeInt(body, 0, 10);
    body.set(stream, 4);

    // Act / Assert
    expect(() => readGpxContainer(withMagic('BCFZ', body))).toThrow(/back-reference/);
  });

  it('rejects a BCFZ stream that does not inflate to a BCFS image', () => {
    const body = compressLiterals(ascii('JUNKJUNK'));
    expect(() => readGpxContainer(withMagic('BCFZ', body))).toThrow(/BCFS/);
  });

  it('rejects a file entry whose sector pointer is outside the image', () => {
    // Arrange
    const image = buildBcfsImage([{ name: 'score.gpif', data: ascii('<GPIF/>') }]);
    writeInt(image, SECTOR + 0x94, 999);

    // Act / Assert
    expect(() => readGpxContainer(withMagic('BCFS', image))).toThrow(/sector/);
  });
});

describe('decompressBcfz', () => {
  it('copies overlapping back-references like TuxGuitar (at most offset bytes per reference)', () => {
    // Arrange: literals "ab", then a back-reference offset 2 size 3 -> copies "ab" only.
    const writer = new BitWriter();
    writer.write(0, 1);
    writer.writeReversed(2, 2);
    writer.write(0x61, 8);
    writer.write(0x62, 8);
    writer.write(1, 1);
    writer.write(2, 4);
    writer.writeReversed(2, 2);
    writer.writeReversed(3, 2);
    const stream = writer.bytes();
    const body = new Uint8Array(4 + stream.length);
    writeInt(body, 0, 4);
    body.set(stream, 4);

    // Act
    const out = decompressBcfz(body);

    // Assert
    expect(new TextDecoder().decode(out)).toBe('abab');
  });

  it('stops at the end of the input when the declared length is larger', () => {
    const body = compressLiterals(ascii('abc'));
    writeInt(body, 0, 1000);
    expect(new TextDecoder().decode(decompressBcfz(body))).toBe('abc');
  });
});

describe('readBcfsFiles', () => {
  it('skips entries whose declared size exceeds the stored sectors', () => {
    // Arrange
    const image = buildBcfsImage([{ name: 'a.txt', data: ascii('abc') }]);
    writeInt(image, SECTOR + 0x8c, SECTOR * 3);

    // Act
    const files = readBcfsFiles(image);

    // Assert
    expect(files.size).toBe(0);
  });
});
