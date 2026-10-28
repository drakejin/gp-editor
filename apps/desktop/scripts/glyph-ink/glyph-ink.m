// Prints the ink of Bravura's glyphs, as CoreText draws them: one line per code point read from stdin (hex),
// "<hex> <top> <bottom>" in ems above (+) and below (−) the baseline. Usage: glyph-ink <Bravura.otf> < codepoints
#import <CoreText/CoreText.h>
#import <Foundation/Foundation.h>

int main(int argc, const char *argv[]) {
  @autoreleasepool {
    if (argc < 2) {
      fprintf(stderr, "usage: glyph-ink <Bravura.otf> < codepoints\n");
      return 1;
    }
    CGDataProviderRef provider = CGDataProviderCreateWithURL((__bridge CFURLRef)[NSURL fileURLWithPath:@(argv[1])]);
    CGFontRef cgFont = CGFontCreateWithDataProvider(provider);
    CGDataProviderRelease(provider);
    if (cgFont == NULL) {
      fprintf(stderr, "glyph-ink: cannot read %s\n", argv[1]);
      return 1;
    }
    const CGFloat size = 1000;
    CTFontRef font = CTFontCreateWithGraphicsFont(cgFont, size, NULL, NULL);
    char line[64];
    int missing = 0;
    while (fgets(line, sizeof line, stdin) != NULL) {
      unsigned int codePoint = 0;
      if (sscanf(line, "%x", &codePoint) != 1) {
        continue;
      }
      UniChar unit = (UniChar)codePoint;
      CGGlyph glyph = 0;
      if (codePoint > 0xFFFF || !CTFontGetGlyphsForCharacters(font, &unit, &glyph, 1)) {
        fprintf(stderr, "glyph-ink: no glyph for U+%04X\n", codePoint);
        missing += 1;
        continue;
      }
      CGRect box = CTFontGetBoundingRectsForGlyphs(font, kCTFontOrientationHorizontal, &glyph, NULL, 1);
      printf("%04x %.3f %.3f\n", codePoint, CGRectGetMaxY(box) / size, CGRectGetMinY(box) / size);
    }
    CFRelease(font);
    CGFontRelease(cgFont);
    return missing == 0 ? 0 : 1;
  }
}
