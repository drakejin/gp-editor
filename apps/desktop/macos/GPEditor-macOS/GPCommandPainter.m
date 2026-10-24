#import "GPCommandPainter.h"

#import <CoreText/CoreText.h>

static NSString *const kMusicFontName = @"Bravura";
/** The most texts' attributes and widths kept; past it both caches start again empty (a width is kept by its attributes). */
static const NSUInteger kMaxCachedTexts = 4096;

@implementation GPCommandPainter {
  NSMutableDictionary<NSString *, NSColor *> *_colors;
  /// A text's font and colour by what makes them: the same few come back for every glyph and fret number of a score.
  NSMutableDictionary<NSString *, NSDictionary *> *_textAttributes;
  /// A centred or right-aligned text's width by its attributes and characters: measuring lays the text out, as drawing it
  /// does again, and the same noteheads and numbers are measured over and over.
  NSMutableDictionary<NSString *, NSNumber *> *_textWidths;
}

+ (void)initialize
{
  if (self != [GPCommandPainter class]) {
    return;
  }
  NSURL *url = [[NSBundle mainBundle] URLForResource:kMusicFontName withExtension:@"otf"];
  if (url != nil) {
    CTFontManagerRegisterFontsForURL((__bridge CFURLRef)url, kCTFontManagerScopeProcess, NULL);
  }
}

- (NSColor *)color:(NSString *)hex
{
  if (_colors == nil) {
    _colors = [NSMutableDictionary dictionary];
  }
  NSColor *cached = _colors[hex];
  if (cached != nil) {
    return cached;
  }
  unsigned int value = 0;
  NSString *digits = [hex hasPrefix:@"#"] ? [hex substringFromIndex:1] : hex;
  [[NSScanner scannerWithString:digits] scanHexInt:&value];
  BOOL hasAlpha = digits.length == 8;
  CGFloat r = ((hasAlpha ? value >> 24 : value >> 16) & 0xFF) / 255.0;
  CGFloat g = ((hasAlpha ? value >> 16 : value >> 8) & 0xFF) / 255.0;
  CGFloat b = ((hasAlpha ? value >> 8 : value) & 0xFF) / 255.0;
  CGFloat a = hasAlpha ? (value & 0xFF) / 255.0 : 1.0;
  NSColor *color = [NSColor colorWithSRGBRed:r green:g blue:b alpha:a];
  _colors[hex] = color;
  return color;
}

- (void)drawCommands:(NSArray<NSDictionary *> *)commands
{
  CGContextRef context = NSGraphicsContext.currentContext.CGContext;
  for (NSDictionary *command in commands) {
    NSString *kind = command[@"kind"];
    if ([kind isEqualToString:@"line"]) {
      [self drawLine:command in:context];
    } else if ([kind isEqualToString:@"rect"]) {
      [self fillRect:command in:context];
    } else if ([kind isEqualToString:@"circle"]) {
      [self drawCircle:command in:context];
    } else if ([kind isEqualToString:@"text"]) {
      [self drawText:command];
    } else if ([kind isEqualToString:@"curve"]) {
      [self drawCurve:command in:context];
    } else if ([kind isEqualToString:@"polygon"]) {
      [self drawPolygon:command in:context];
    }
  }
}

- (void)drawLine:(NSDictionary *)c in:(CGContextRef)context
{
  CGContextSetStrokeColorWithColor(context, [self color:c[@"color"]].CGColor);
  CGContextSetLineWidth(context, [c[@"width"] doubleValue]);
  NSArray<NSNumber *> *dash = c[@"dash"];
  if ([dash isKindOfClass:[NSArray class]] && dash.count > 0 && dash.count <= 8) {
    CGFloat lengths[8];
    for (NSUInteger i = 0; i < dash.count; i++) {
      lengths[i] = dash[i].doubleValue;
    }
    CGContextSetLineDash(context, 0, lengths, dash.count);
  }
  CGContextMoveToPoint(context, [c[@"x1"] doubleValue], [c[@"y1"] doubleValue]);
  CGContextAddLineToPoint(context, [c[@"x2"] doubleValue], [c[@"y2"] doubleValue]);
  CGContextStrokePath(context);
  CGContextSetLineDash(context, 0, NULL, 0);
}

- (void)fillRect:(NSDictionary *)c in:(CGContextRef)context
{
  CGRect rect = CGRectMake([c[@"x"] doubleValue], [c[@"y"] doubleValue], [c[@"width"] doubleValue], [c[@"height"] doubleValue]);
  CGFloat radius = MIN([c[@"radius"] doubleValue], MIN(rect.size.width, rect.size.height) / 2);
  BOOL isErasing = self.eraseColor != nil && [c[@"color"] isKindOfClass:[NSString class]] && [c[@"color"] caseInsensitiveCompare:self.eraseColor] == NSOrderedSame;
  if (isErasing) {
    CGContextSaveGState(context);
    CGContextSetBlendMode(context, kCGBlendModeClear);
  }
  CGContextSetFillColorWithColor(context, [self color:c[@"color"]].CGColor);
  if (radius > 0) {
    CGPathRef path = CGPathCreateWithRoundedRect(rect, radius, radius, NULL);
    CGContextAddPath(context, path);
    CGContextFillPath(context);
    CGPathRelease(path);
  } else {
    CGContextFillRect(context, rect);
  }
  if (isErasing) {
    CGContextRestoreGState(context);
  }
}

- (void)drawCircle:(NSDictionary *)c in:(CGContextRef)context
{
  CGFloat r = [c[@"radius"] doubleValue];
  CGRect rect = CGRectMake([c[@"x"] doubleValue] - r, [c[@"y"] doubleValue] - r, r * 2, r * 2);
  CGColorRef color = [self color:c[@"color"]].CGColor;
  if (c[@"strokeWidth"] != nil) {
    CGContextSetStrokeColorWithColor(context, color);
    CGContextSetLineWidth(context, [c[@"strokeWidth"] doubleValue]);
    CGContextStrokeEllipseInRect(context, rect);
  } else {
    CGContextSetFillColorWithColor(context, color);
    CGContextFillEllipseInRect(context, rect);
  }
}

- (void)drawCurve:(NSDictionary *)c in:(CGContextRef)context
{
  CGContextSetStrokeColorWithColor(context, [self color:c[@"color"]].CGColor);
  CGContextSetLineWidth(context, [c[@"width"] doubleValue]);
  CGContextSetLineCap(context, kCGLineCapRound);
  CGContextMoveToPoint(context, [c[@"x1"] doubleValue], [c[@"y1"] doubleValue]);
  CGContextAddQuadCurveToPoint(
      context, [c[@"cx"] doubleValue], [c[@"cy"] doubleValue], [c[@"x2"] doubleValue], [c[@"y2"] doubleValue]);
  CGContextStrokePath(context);
  CGContextSetLineCap(context, kCGLineCapButt);
}

- (void)drawPolygon:(NSDictionary *)c in:(CGContextRef)context
{
  NSArray<NSNumber *> *points = c[@"points"];
  if (points.count < 6) {
    return;
  }
  CGContextSetFillColorWithColor(context, [self color:c[@"color"]].CGColor);
  CGContextMoveToPoint(context, points[0].doubleValue, points[1].doubleValue);
  for (NSUInteger i = 2; i + 1 < points.count; i += 2) {
    CGContextAddLineToPoint(context, points[i].doubleValue, points[i + 1].doubleValue);
  }
  CGContextClosePath(context);
  CGContextFillPath(context);
}

- (NSFont *)font:(NSString *)family size:(CGFloat)size bold:(BOOL)bold
{
  NSFontWeight weight = bold ? NSFontWeightSemibold : NSFontWeightRegular;
  if ([family isEqualToString:@"music"]) {
    return [NSFont fontWithName:kMusicFontName size:size] ?: [NSFont systemFontOfSize:size];
  }
  if ([family isEqualToString:@"mono"]) {
    return [NSFont monospacedSystemFontOfSize:size weight:weight];
  }
  return [NSFont systemFontOfSize:size weight:weight];
}

/**
 * A text's font: the stylesheet's family (an installed family's name; the system font when it is not installed) and
 * italic over the command's own font (src/score/draw.ts TextCommand.family / italic).
 */
- (NSFont *)fontFor:(NSDictionary *)c
{
  NSString *kind = c[@"font"];
  CGFloat size = [c[@"size"] doubleValue];
  BOOL bold = [c[@"bold"] boolValue];
  NSFont *font = [self font:kind size:size bold:bold];
  NSString *family = [c[@"family"] isKindOfClass:[NSString class]] ? c[@"family"] : nil;
  BOOL italic = [c[@"italic"] boolValue];
  if (family.length == 0 && !italic) {
    return font;
  }
  NSFontManager *manager = NSFontManager.sharedFontManager;
  NSFontTraitMask traits = (bold ? NSBoldFontMask : 0) | (italic ? NSItalicFontMask : 0);
  if (family.length > 0) {
    font = [manager fontWithFamily:family traits:traits weight:(bold ? 9 : 5) size:size]
      ?: [manager fontWithFamily:family traits:0 weight:5 size:size] ?: font;
  }
  if (!italic) {
    return font;
  }
  // The system font has its italic as a descriptor trait; other families answer the font manager.
  NSFontDescriptor *slanted = [font.fontDescriptor fontDescriptorWithSymbolicTraits:font.fontDescriptor.symbolicTraits | NSFontDescriptorTraitItalic];
  return [NSFont fontWithDescriptor:slanted size:size] ?: [manager convertFont:font toHaveTrait:NSItalicFontMask];
}

/**
 * The text's font and colour, kept by the command's font, size (to the bit: sizes a hair apart draw apart), bold,
 * italic, family and colour.
 */
- (NSDictionary *)attributesFor:(NSDictionary *)c
{
  if (_textAttributes == nil || _textAttributes.count >= kMaxCachedTexts) {
    _textAttributes = [NSMutableDictionary dictionary];
    _textWidths = [NSMutableDictionary dictionary];
  }
  NSString *key = [NSString stringWithFormat:@"%@|%a|%@|%@|%@|%@", c[@"font"], [c[@"size"] doubleValue], c[@"bold"], c[@"italic"], c[@"family"], c[@"color"]];
  NSDictionary *attributes = _textAttributes[key];
  if (attributes == nil) {
    attributes = @{NSFontAttributeName : [self fontFor:c], NSForegroundColorAttributeName : [self color:c[@"color"]]};
    _textAttributes[key] = attributes;
  }
  return attributes;
}

/** The text's width in `attributes` (one of attributesFor:'s, kept as long as the widths measured in it). */
- (CGFloat)widthOf:(NSString *)text attributes:(NSDictionary *)attributes
{
  if (_textWidths.count >= kMaxCachedTexts) {
    [_textWidths removeAllObjects];
  }
  NSString *key = [NSString stringWithFormat:@"%p|%@", attributes, text];
  NSNumber *width = _textWidths[key];
  if (width == nil) {
    width = @([text sizeWithAttributes:attributes].width);
    _textWidths[key] = width;
  }
  return width.doubleValue;
}

/** Music text sits on its baseline (SMuFL); UI text is centred vertically on y. A left-aligned text is not measured. */
- (void)drawText:(NSDictionary *)c
{
  NSString *family = c[@"font"];
  NSDictionary *attributes = [self attributesFor:c];
  NSFont *font = attributes[NSFontAttributeName];
  NSString *text = c[@"text"];
  NSString *align = c[@"align"];
  BOOL isCentred = [align isEqualToString:@"center"];
  BOOL isRight = [align isEqualToString:@"right"];
  CGFloat width = isCentred || isRight ? [self widthOf:text attributes:attributes] : 0;
  CGFloat x = [c[@"x"] doubleValue] - (isCentred ? width / 2 : isRight ? width : 0);
  CGFloat y = [c[@"y"] doubleValue];
  CGFloat top = [family isEqualToString:@"music"] ? y - font.ascender : y - (font.ascender - font.descender) / 2;
  [text drawAtPoint:NSMakePoint(x, top) withAttributes:attributes];
}

@end
