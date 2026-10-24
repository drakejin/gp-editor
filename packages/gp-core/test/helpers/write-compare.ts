import type { Song } from '../../src/model/song';

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

/**
 * A difference found under a value: the path's segments from the difference up (reversed), and what differs. The
 * path is only built for a difference: building it for every value compared made the round-trip tests slow.
 */
interface Found {
  readonly segments: string[];
  readonly detail: string;
}

function foundBelow(found: Found | undefined, segment: string): Found | undefined {
  found?.segments.push(segment);
  return found;
}

function arrayDifference(expected: readonly unknown[], actual: readonly unknown[]): Found | undefined {
  for (let i = 0; i < Math.min(expected.length, actual.length); i++) {
    const found = foundBelow(findDifference(expected[i], actual[i]), `[${i}]`);
    if (found !== undefined) {
      return found;
    }
  }
  return expected.length === actual.length ? undefined : { segments: [], detail: `.length: expected ${expected.length}, got ${actual.length}` };
}

/**
 * Fields compared: those whose value is not undefined (an optional field set to undefined counts as absent, as in
 * toEqual), the expected value's first, then the actual value's others.
 */
function objectDifference(expected: object, actual: object): Found | undefined {
  const expectedRecord = expected as Readonly<Record<string, unknown>>;
  const actualRecord = actual as Readonly<Record<string, unknown>>;
  for (const key of Object.keys(expectedRecord)) {
    const found = expectedRecord[key] === undefined ? undefined : foundBelow(findDifference(expectedRecord[key], actualRecord[key]), `.${key}`);
    if (found !== undefined) {
      return found;
    }
  }
  for (const key of Object.keys(actualRecord)) {
    const isNew = actualRecord[key] !== undefined && expectedRecord[key] === undefined;
    const found = isNew ? foundBelow(findDifference(undefined, actualRecord[key]), `.${key}`) : undefined;
    if (found !== undefined) {
      return found;
    }
  }
  return undefined;
}

function findDifference(expected: unknown, actual: unknown): Found | undefined {
  if (expected === actual) {
    return undefined;
  }
  if (!isObject(expected) || !isObject(actual) || Array.isArray(expected) !== Array.isArray(actual)) {
    return { segments: [], detail: `: expected ${show(expected)}, got ${show(actual)}` };
  }
  if (Array.isArray(expected) && Array.isArray(actual)) {
    return arrayDifference(expected, actual);
  }
  return objectDifference(expected, actual);
}

/**
 * Path and values of the first difference between two plain values (deep, arrays in order), or
 * undefined when they are equal. Meant for `expect(firstDifference(a, b)).toBeUndefined()`, so a
 * failing round trip names the first field that changed instead of dumping two whole songs.
 */
export function firstDifference(expected: unknown, actual: unknown, path = '$'): string | undefined {
  const found = findDifference(expected, actual);
  return found === undefined ? undefined : `${path}${found.segments.reverse().join('')}${found.detail}`;
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
