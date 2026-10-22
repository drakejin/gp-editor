import { beforeEach, describe, expect, it, vi } from 'vitest';
import { GpFormatError } from '../src/errors';
import { readSong } from '../src/read-song';
import { loadFixture } from './helpers/fixtures';

/** What the mocked GP5 reader throws in the current test. */
const thrown = vi.hoisted(() => ({ value: undefined as unknown }));

vi.mock('../src/formats/gtp/gp5', () => ({
  readGp5: () => {
    throw thrown.value;
  },
}));

const GP5 = loadFixture('guitarpro5', 'nightwish.gp5');

describe('readSong: errors from a reader', () => {
  beforeEach(() => {
    thrown.value = undefined;
  });

  it('passes a GpFormatError through unchanged', () => {
    // Arrange
    const formatError = new GpFormatError('Bad measure count');
    thrown.value = formatError;

    // Act
    const act = () => readSong(GP5);

    // Assert
    expect(act).toThrow(formatError);
  });

  it('wraps any other error in a GpFormatError that names the format and keeps the cause', () => {
    // Arrange
    const cause = new TypeError("Cannot read properties of undefined (reading 'beats')");
    thrown.value = cause;

    // Act
    let error: unknown;
    try {
      readSong(GP5);
    } catch (caught) {
      error = caught;
    }

    // Assert
    expect(error).toBeInstanceOf(GpFormatError);
    expect((error as GpFormatError).message).toBe(`Failed to read gp5 file: ${cause.message}`);
    expect((error as GpFormatError).cause).toBe(cause);
  });

  it('turns a thrown value that is not an Error into text', () => {
    thrown.value = 'truncated';
    expect(() => readSong(GP5)).toThrow('Failed to read gp5 file: truncated');
  });
});
