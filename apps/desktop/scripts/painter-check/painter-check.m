// Checks GPCommandPainter (built with clang against the app's source by run.sh): a text whose font AppKit cannot make
// is left out of that drawing — no exception, which AppKit turns into a crash inside -drawRect: — and is drawn by the
// next drawing once a font is made; nothing about the failure is kept.
#import <AppKit/AppKit.h>
#import "GPCommandPainter.h"

/** The painter's own font lookup, overridden below. */
@interface GPCommandPainter (Fonts)
- (nullable NSFont *)fontFor:(NSDictionary *)c;
@end

/** fontFor: answers nil for the first `failures` calls, as AppKit did once (2026-10-25, a QA snapshot). */
@interface GPFailingFontPainter : GPCommandPainter
@property (nonatomic) NSInteger failures;
@end

@implementation GPFailingFontPainter
- (NSFont *)fontFor:(NSDictionary *)c
{
  if (self.failures > 0) {
    self.failures -= 1;
    return nil;
  }
  return [super fontFor:c];
}
@end

static int failed = 0;

static void check(BOOL condition, NSString *what)
{
  printf("%s %s\n", condition ? "PASS" : "FAIL", what.UTF8String);
  failed += condition ? 0 : 1;
}

/** Draws into a 120 × 60 white bitmap (flipped, as the canvas is); the number of non-white pixels. */
static NSInteger inkAfterDrawing(GPCommandPainter *painter, NSArray<NSDictionary *> *commands, BOOL *isComplete, NSException **thrown)
{
  NSBitmapImageRep *rep = [[NSBitmapImageRep alloc] initWithBitmapDataPlanes:NULL pixelsWide:120 pixelsHigh:60 bitsPerSample:8 samplesPerPixel:4 hasAlpha:YES isPlanar:NO colorSpaceName:NSDeviceRGBColorSpace bytesPerRow:0 bitsPerPixel:0];
  NSGraphicsContext *context = [NSGraphicsContext graphicsContextWithBitmapImageRep:rep];
  NSGraphicsContext *flipped = [NSGraphicsContext graphicsContextWithCGContext:context.CGContext flipped:YES];
  [NSGraphicsContext saveGraphicsState];
  NSGraphicsContext.currentContext = flipped;
  CGContextTranslateCTM(flipped.CGContext, 0, 60);
  CGContextScaleCTM(flipped.CGContext, 1, -1);
  [NSColor.whiteColor setFill];
  NSRectFill(NSMakeRect(0, 0, 120, 60));
  @try {
    *isComplete = [painter drawCommands:commands];
  } @catch (NSException *exception) {
    *thrown = exception;
  }
  [NSGraphicsContext restoreGraphicsState];
  NSInteger ink = 0;
  for (NSInteger y = 0; y < 60; y++) {
    for (NSInteger x = 0; x < 120; x++) {
      ink += [[rep colorAtX:x y:y] brightnessComponent] < 0.5 ? 1 : 0;
    }
  }
  return ink;
}

int main(int argc, const char *argv[])
{
  @autoreleasepool {
    NSArray *commands = @[ @{@"kind" : @"text", @"x" : @10, @"y" : @30, @"text" : @"12", @"size" : @24, @"color" : @"#000000", @"font" : @"ui", @"align" : @"left"} ];
    GPFailingFontPainter *painter = [GPFailingFontPainter new];
    painter.failures = 1;
    BOOL isComplete = YES;
    NSException *thrown = nil;
    NSInteger ink = inkAfterDrawing(painter, commands, &isComplete, &thrown);
    check(thrown == nil, [NSString stringWithFormat:@"no font for a text: no exception (%@)", thrown.reason ?: @"none"]);
    check(!isComplete && ink == 0, [NSString stringWithFormat:@"no font for a text: it is left out and the drawing says so (%ld dark pixels)", (long)ink]);
    isComplete = NO;
    ink = inkAfterDrawing(painter, commands, &isComplete, &thrown);
    check(thrown == nil && isComplete && ink > 20, [NSString stringWithFormat:@"the next drawing makes the font and draws the text (%ld dark pixels)", (long)ink]);
    printf("%s: %d failed\n", failed == 0 ? "OK" : "FAILED", failed);
  }
  return failed == 0 ? 0 : 1;
}
