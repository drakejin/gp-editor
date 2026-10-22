import type { Song } from '../../src/model/song';

/** Keys whose value is not undefined (an optional field set to undefined counts as absent, as in toEqual). */
function definedKeys(value: object): string[] {
  return Object.entries(value)
    .filter(([, field]) => field !== undefined)
    .map(([key]) => key);
}

function show(value: unknown): string {
  const text = JSON.stringify(value);
  if (text === undefined) {
    return String(value);
  }
  return text.length > 200 ? `${text.slice(0, 200)}…` : text;
}

function isObject(value: unknown): value is object {
  return typeof value === 'object' && value !== null;
}

function arrayDifference(expected: readonly unknown[], actual: readonly unknown[], path: string): string | undefined {
  for (let i = 0; i < Math.min(expected.length, actual.length); i++) {
    const difference = firstDifference(expected[i], actual[i], `${path}[${i}]`);
    if (difference !== undefined) {
      return difference;
    }
  }
  return expected.length === actual.length
    ? undefined
    : `${path}.length: expected ${expected.length}, got ${actual.length}`;
}

function objectDifference(expected: object, actual: object, path: string): string | undefined {
  const expectedRecord = expected as Readonly<Record<string, unknown>>;
  const actualRecord = actual as Readonly<Record<string, unknown>>;
  const keys = [...new Set([...definedKeys(expected), ...definedKeys(actual)])];
  for (const key of keys) {
    const difference = firstDifference(expectedRecord[key], actualRecord[key], `${path}.${key}`);
    if (difference !== undefined) {
      return difference;
    }
  }
  return undefined;
}

/**
 * Path and values of the first difference between two plain values (deep, arrays in order), or
 * undefined when they are equal. Meant for `expect(firstDifference(a, b)).toBeUndefined()`, so a
 * failing round trip names the first field that changed instead of dumping two whole songs.
 */
export function firstDifference(expected: unknown, actual: unknown, path = '$'): string | undefined {
  if (expected === actual) {
    return undefined;
  }
  if (!isObject(expected) || !isObject(actual) || Array.isArray(expected) !== Array.isArray(actual)) {
    return `${path}: expected ${show(expected)}, got ${show(actual)}`;
  }
  if (Array.isArray(expected) && Array.isArray(actual)) {
    return arrayDifference(expected, actual, path);
  }
  return objectDifference(expected, actual, path);
}

/** First difference between two songs, ignoring `source` (the format and version they were read from). */
export function songDifference(expected: Song, actual: Song): string | undefined {
  const { source: _expectedSource, ...expectedRest } = expected;
  const { source: _actualSource, ...actualRest } = actual;
  return firstDifference(expectedRest, actualRest, 'song');
}

/** Bytes 25…30: Guitar Pro leaves memory garbage after its 24-character version string. */
const VERSION_PADDING = { from: 25, to: 31 } as const;

/**
 * Offset of the first byte where a written file differs from the original, ignoring the version
 * padding; -1 when they are the same (including their length).
 */
export function firstByteDifference(written: Uint8Array, original: Uint8Array): number {
  const length = Math.max(written.length, original.length);
  for (let i = 0; i < length; i++) {
    const isPadding = i >= VERSION_PADDING.from && i < VERSION_PADDING.to;
    if (!isPadding && written[i] !== original[i]) {
      return i;
    }
  }
  return -1;
}
