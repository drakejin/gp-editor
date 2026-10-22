import { describe, expect, it } from 'vitest';
import { firstDifference } from './helpers/write-compare';

describe('firstDifference (round-trip comparison helper)', () => {
  it('finds nothing in equal values', () => {
    expect(firstDifference({ a: [1, { b: 'x' }] }, { a: [1, { b: 'x' }] })).toBeUndefined();
  });

  it('names the path of the first changed value', () => {
    expect(firstDifference({ a: [1, { b: 'x' }] }, { a: [1, { b: 'y' }] })).toBe('$.a[1].b: expected "x", got "y"');
  });

  it('reports array length changes after the common items', () => {
    expect(firstDifference([1, 2], [1, 2, 3])).toBe('$.length: expected 2, got 3');
  });

  it('reports missing and extra fields, but treats undefined fields as absent', () => {
    expect(firstDifference({ a: 1 }, {})).toBe('$.a: expected 1, got undefined');
    expect(firstDifference({}, { b: true })).toBe('$.b: expected undefined, got true');
    expect(firstDifference({ a: undefined }, {})).toBeUndefined();
  });

  it('tells arrays and objects apart', () => {
    expect(firstDifference([], {})).toBe('$: expected [], got {}');
  });
});
