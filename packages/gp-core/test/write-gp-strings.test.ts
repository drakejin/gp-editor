import { describe, expect, it } from 'vitest';
import { decodeText } from '../src/io/text';
import { encodeGpString } from '../src/write/gp-strings';

describe('encodeGpString', () => {
  it('writes ASCII as is', () => {
    expect([...encodeGpString('Hi!')]).toEqual([0x48, 0x69, 0x21]);
  });

  it('writes characters of windows-1252 as one byte each, as Guitar Pro 3–5 do', () => {
    // Arrange / Act
    const bytes = encodeGpString('Café €');

    // Assert
    expect([...bytes]).toEqual([0x43, 0x61, 0x66, 0xe9, 0x20, 0x80]);
    expect(decodeText(bytes, 'auto')).toBe('Café €');
  });

  it('writes UTF-8 when a character is outside windows-1252, which the auto charset reads back', () => {
    // Arrange / Act
    const bytes = encodeGpString('기타 Guitar');

    // Assert
    expect([...bytes.subarray(0, 3)]).toEqual([0xea, 0xb8, 0xb0]);
    expect(decodeText(bytes, 'auto')).toBe('기타 Guitar');
  });

  it('writes UTF-8 when the windows-1252 bytes would read back as different UTF-8 text', () => {
    // Arrange: "Ã©" in windows-1252 is C3 A9, which is valid UTF-8 for "é"
    const text = 'Ã©';

    // Act
    const bytes = encodeGpString(text);

    // Assert
    expect(decodeText(bytes, 'auto')).toBe(text);
  });

  it('writes UTF-8 for the five byte values windows-1252 leaves undefined', () => {
    expect(decodeText(encodeGpString('\u0081'), 'auto')).toBe('\u0081');
  });

  it('cuts a string to a byte limit without splitting a character', () => {
    // Arrange / Act
    const latin = encodeGpString('abcdef', 4);
    const korean = encodeGpString('가나다', 7);

    // Assert
    expect(decodeText(latin, 'auto')).toBe('abcd');
    expect(korean).toHaveLength(6);
    expect(decodeText(korean, 'auto')).toBe('가나');
  });

  it('re-checks the encoding after cutting', () => {
    // Arrange: the whole text is not valid UTF-8 in windows-1252, its first two bytes are
    const text = 'Ã©Ã';

    // Act
    const bytes = encodeGpString(text, 2);

    // Assert
    expect(decodeText(bytes, 'auto')).toBe('Ã');
  });

  it('replaces a lone surrogate, which no encoding can hold', () => {
    expect(decodeText(encodeGpString('a\ud800b'), 'auto')).toBe('a�b');
  });

  it('writes characters outside the BMP as 4-byte UTF-8', () => {
    expect(decodeText(encodeGpString('𝄞'), 'auto')).toBe('𝄞');
  });
});
