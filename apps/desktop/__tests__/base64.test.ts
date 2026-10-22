import { base64ToBytes, bytesToBase64 } from '../src/lib/base64';

describe('base64ToBytes', () => {
  it('decodes padded and unpadded input', () => {
    expect([...base64ToBytes('AAEC/w==')]).toEqual([0, 1, 2, 255]);
    expect([...base64ToBytes('aGk')]).toEqual([0x68, 0x69]);
    expect(base64ToBytes('')).toHaveLength(0);
  });

  it('rejects characters outside the alphabet', () => {
    expect(() => base64ToBytes('ab$c')).toThrow('Invalid base64');
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
});
