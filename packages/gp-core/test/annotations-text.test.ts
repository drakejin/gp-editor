import { describe, expect, it } from 'vitest';
import {
  ANNOTATION_PLACEMENTS,
  MAX_ANNOTATION_LENGTH,
  MAX_ANNOTATION_LINES,
  isAnnotationPlacement,
  normalizeAnnotationText,
  toAnnotation,
} from '../src/annotations/annotation-text';

describe('normalizeAnnotationText', () => {
  it('keeps the lines, trimmed at their ends, with the blank lines around them left out', () => {
    // Arrange
    const typed = '\n\n  Watch the bend  \n\nsofter on the repeat\t\n\n';

    // Act
    const text = normalizeAnnotationText(typed);

    // Assert
    expect(text).toBe('  Watch the bend\n\nsofter on the repeat');
  });

  it('turns Windows and old Mac line breaks into \\n and tabs into spaces', () => {
    expect(normalizeAnnotationText('a\r\nb\rc\td')).toBe('a\nb\nc d');
  });

  it('drops control characters other than line breaks', () => {
    expect(normalizeAnnotationText('a\u0000b\u0007c\u001bd\u007fe')).toBe('abcde');
  });

  it(`keeps at most ${MAX_ANNOTATION_LINES} lines and ${MAX_ANNOTATION_LENGTH} characters`, () => {
    // Arrange
    const manyLines = Array.from({ length: MAX_ANNOTATION_LINES + 5 }, (_, i) => `line ${i + 1}`).join('\n');
    const long = 'x'.repeat(MAX_ANNOTATION_LENGTH + 50);

    // Act
    const fewerLines = normalizeAnnotationText(manyLines);
    const shorter = normalizeAnnotationText(long);

    // Assert
    expect(fewerLines.split('\n')).toHaveLength(MAX_ANNOTATION_LINES);
    expect(fewerLines.split('\n').at(-1)).toBe(`line ${MAX_ANNOTATION_LINES}`);
    expect(shorter).toHaveLength(MAX_ANNOTATION_LENGTH);
  });

  it('reads Korean and emoji as they are', () => {
    expect(normalizeAnnotationText('여기서 숨 쉬기 🎵')).toBe('여기서 숨 쉬기 🎵');
  });
});

describe('toAnnotation', () => {
  it('is an annotation of the normalized text', () => {
    expect(toAnnotation(' Intro: let it ring \n', 'below')).toEqual({ text: ' Intro: let it ring', placement: 'below' });
  });

  it('is none for a text with nothing to show', () => {
    expect(toAnnotation(' \n\t\n ', 'above')).toBeUndefined();
    expect(toAnnotation('', 'above')).toBeUndefined();
  });

  it('places an unknown placement above', () => {
    expect(toAnnotation('x', 'sideways' as never)).toEqual({ text: 'x', placement: 'above' });
  });
});

describe('isAnnotationPlacement', () => {
  it('knows above and below only', () => {
    expect(ANNOTATION_PLACEMENTS).toEqual(['above', 'below']);
    expect(isAnnotationPlacement('above')).toBe(true);
    expect(isAnnotationPlacement('below')).toBe(true);
    expect(isAnnotationPlacement('left')).toBe(false);
    expect(isAnnotationPlacement(1)).toBe(false);
  });
});
