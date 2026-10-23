#import "GPCommandPainter.h"

#import <CoreText/CoreText.h>

static NSString *const kMusicFontName = @"Bravura";

@implementation GPCommandPainter {
  NSMutableDictionary<NSString *, NSColor *> *_colors;
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

/** Music text sits on its baseline (SMuFL); UI text is centred vertically on y. */
- (void)drawText:(NSDictionary *)c
{
  NSString *family = c[@"font"];
  NSFont *font = [self font:family size:[c[@"size"] doubleValue] bold:[c[@"bold"] boolValue]];
  NSDictionary *attributes = @{NSFontAttributeName : font, NSForegroundColorAttributeName : [self color:c[@"color"]]};
  NSString *text = c[@"text"];
  CGFloat width = [text sizeWithAttributes:attributes].width;
  NSString *align = c[@"align"];
  CGFloat x = [c[@"x"] doubleValue];
  x -= [align isEqualToString:@"center"] ? width / 2 : [align isEqualToString:@"right"] ? width : 0;
  CGFloat y = [c[@"y"] doubleValue];
  CGFloat top = [family isEqualToString:@"music"] ? y - font.ascender : y - (font.ascender - font.descender) / 2;
  [text drawAtPoint:NSMakePoint(x, top) withAttributes:attributes];
}

@end
