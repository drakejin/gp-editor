import { describe, expect, it } from 'vitest';
import { decodeText, decodeUtf8Lenient, decodeUtf8Strict, decodeWindows1252 } from '../src/io/text';

const bytes = (...values: number[]) => new Uint8Array(values);

describe('decodeText', () => {
  it('reads valid UTF-8 as UTF-8 in auto mode', () => {
    expect(decodeText(new TextEncoder().encode('기타 Ä 🎸'))).toBe('기타 Ä 🎸');
  });

  it('falls back to windows-1252 when the bytes are not valid UTF-8', () => {
    expect(decodeText(bytes(0x43, 0x61, 0x66, 0xe9))).toBe('Café');
    expect(decodeText(bytes(0x80, 0x99))).toBe('€™');
  });

  it('uses the runtime TextDecoder for other labels', () => {
    // "기타" in EUC-KR
    expect(decodeText(bytes(0xb1, 0xe2, 0xc5, 0xb8), 'euc-kr')).toBe('기타');
  });

  it('falls back to auto for labels the runtime does not know', () => {
    expect(decodeText(bytes(0x41, 0x42), 'no-such-charset')).toBe('AB');
  });

  it('honours explicit utf-8 and windows-1252 labels', () => {
    expect(decodeText(bytes(0xe9), 'utf-8')).toBe('�');
    expect(decodeText(bytes(0xc3, 0xa9), 'windows-1252')).toBe('Ã©');
  });
});

describe('UTF-8 decoding', () => {
  it('rejects overlong, surrogate and truncated sequences in strict mode', () => {
    expect(decodeUtf8Strict(bytes(0xc0, 0x80))).toBeUndefined();
    expect(decodeUtf8Strict(bytes(0xed, 0xa0, 0x80))).toBeUndefined();
    expect(decodeUtf8Strict(bytes(0xe2, 0x82))).toBeUndefined();
    expect(decodeUtf8Strict(bytes(0xe2, 0x28, 0xa1))).toBeUndefined();
  });

  it('replaces malformed bytes in lenient mode', () => {
    expect(decodeUtf8Lenient(bytes(0x41, 0xff, 0x42))).toBe('A�B');
  });

  it('decodes long strings', () => {
    const long = 'a'.repeat(10_000);
    expect(decodeUtf8Lenient(new TextEncoder().encode(long))).toBe(long);
  });
});

describe('decodeWindows1252', () => {
  it('maps undefined 0x80–0x9F bytes to U+FFFD', () => {
    expect(decodeWindows1252(bytes(0x81))).toBe('�');
  });
});
