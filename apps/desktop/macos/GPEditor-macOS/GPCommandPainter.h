// Draws the DrawCommand list of src/score/draw.ts (parsed JSON) with CoreGraphics into the current NSGraphicsContext,
// which must be flipped (origin top-left, y down) — the score canvas and the PDF export both draw through it, so a
// PDF page looks exactly like the screen. The music font (Bravura, SMuFL) ships in the app bundle and is registered
// for this process on first use.

#import <AppKit/AppKit.h>

NS_ASSUME_NONNULL_BEGIN

@interface GPCommandPainter : NSObject

/** Draws the commands, in order, into NSGraphicsContext.currentContext (flipped). */
- (void)drawCommands:(NSArray<NSDictionary *> *)commands;

@end

NS_ASSUME_NONNULL_END
