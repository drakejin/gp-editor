import { TranscriptionError } from '../errors';

/** A JSON object as it arrives, fields not yet checked. */
export type RawObject = Readonly<Record<string, unknown>>;

export function isRawObject(value: unknown): value is RawObject {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** The value as an object; throws for anything else. `path` names the value in the error ("measures[2]"). */
export function readObject(value: unknown, path: string): RawObject {
  if (!isRawObject(value)) {
    throw new TranscriptionError(`${path}: expected an object`);
  }
  return value;
}

/** The value as a list; throws for anything else. */
export function readList(value: unknown, path: string, maxItems?: number): readonly unknown[] {
  if (!Array.isArray(value)) {
    throw new TranscriptionError(`${path}: expected a list`);
  }
  if (maxItems !== undefined && value.length > maxItems) {
    throw new TranscriptionError(`${path}: ${value.length} items (at most ${maxItems})`);
  }
  return value;
}

/** A list that may be left out (undefined or null: an empty list); throws for anything else. */
export function readOptionalList(value: unknown, path: string, maxItems?: number): readonly unknown[] {
  return value === undefined || value === null ? [] : readList(value, path, maxItems);
}

/** A finite number, rounded and clamped to min…max; undefined for anything else. */
export function toClampedInteger(value: unknown, min: number, max: number): number | undefined {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return undefined;
  }
  return Math.min(max, Math.max(min, Math.round(value))) + 0;
}

/** The number when it is above zero, else undefined (0 means "none" in the contract). */
export function toPositive(value: number | undefined): number | undefined {
  return value !== undefined && value > 0 ? value : undefined;
}

/** Trimmed text; undefined when the value is not text or only white space. */
export function toText(value: unknown): string | undefined {
  const text = typeof value === 'string' ? value.trim() : '';
  return text === '' ? undefined : text;
}

/** `true` when the value is exactly true, else undefined (the contract leaves false flags out). */
export function toFlag(value: unknown): true | undefined {
  return value === true ? true : undefined;
}

/** A copy without the fields whose value is undefined, so a parsed page holds only what was given. */
export function withoutUndefined<T extends object>(value: T): T {
  return Object.fromEntries(Object.entries(value).filter(([, field]) => field !== undefined)) as T;
}
