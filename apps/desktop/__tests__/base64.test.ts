import { base64ToBytes, bytesToBase64 } from '../src/lib/base64';

const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

/** Base64 the plainest way, six bits at a time: the oracle for the table-driven encoder. */
function referenceBase64(bytes: Uint8Array): string {
  const bits = [...bytes].map((byte) => byte.toString(2).padStart(8, '0')).join('');
  const sextets = bits.padEnd(Math.ceil(bits.length / 6) * 6, '0').match(/.{6}/g) ?? [];
  const text = sextets.map((sextet) => ALPHABET[parseInt(sextet, 2)]).join('');
  return text.padEnd(Math.ceil(text.length / 4) * 4, '=');
}

describe('base64ToBytes', () => {
  it('decodes padded and unpadded input', () => {
    expect([...base64ToBytes('AAEC/w==')]).toEqual([0, 1, 2, 255]);
    expect([...base64ToBytes('aGk')]).toEqual([0x68, 0x69]);
    expect(base64ToBytes('')).toHaveLength(0);
  });

  it('rejects characters outside the alphabet', () => {
    expect(() => base64ToBytes('ab$c')).toThrow('Invalid base64');
    expect(() => base64ToBytes('abcd'.repeat(10) + 'ab$c')).toThrow('Invalid base64 character "$"');
    expect(() => base64ToBytes('abc一')).toThrow('Invalid base64');
  });

  it('skips white space and padding wherever they are, as MIME base64 has line breaks', () => {
    // Arrange
    const wrapped = 'AAEC\n/w==\r\n';

    // Act / Assert
    expect([...base64ToBytes(wrapped)]).toEqual([0, 1, 2, 255]);
    expect([...base64ToBytes(' aG k ')]).toEqual([0x68, 0x69]);
  });
});

describe('bytesToBase64', () => {
  it('encodes with padding like btoa', () => {
    expect(bytesToBase64(new Uint8Array([]))).toBe('');
    expect(bytesToBase64(new Uint8Array([0]))).toBe('AA==');
    expect(bytesToBase64(new Uint8Array([0, 1]))).toBe('AAE=');
    expect(bytesToBase64(new Uint8Array([0, 1, 2]))).toBe('AAEC');
    expect(bytesToBase64(new Uint8Array([255, 254, 253, 252]))).toBe('//79/A==');
  });

  it('round-trips with base64ToBytes', () => {
    const bytes = Array.from({ length: 300 }, (_, i) => (i * 7) % 256);
    expect([...base64ToBytes(bytesToBase64(new Uint8Array(bytes)))]).toEqual(bytes);
  });

  it('round-trips a large file of every byte value, chunk edges included', () => {
    // Arrange: an audio track's file crosses the bridge as base64 (a few megabytes)
    const bytes = Uint8Array.from({ length: 50_001 }, (_, i) => (i * 131 + Math.floor(i / 256)) % 256);

    // Act
    const text = bytesToBase64(bytes);
    const back = base64ToBytes(text);

    // Assert
    expect(text).toBe(referenceBase64(bytes));
    expect(back.length).toBe(bytes.length);
    expect(back.every((byte, index) => byte === bytes[index])).toBe(true);
  });
});
