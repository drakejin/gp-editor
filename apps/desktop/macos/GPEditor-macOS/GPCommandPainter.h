// Draws the DrawCommand list of src/score/draw.ts (parsed JSON) with CoreGraphics into the current NSGraphicsContext,
// which must be flipped (origin top-left, y down) — the score canvas and the PDF export both draw through it, so a
// PDF page looks exactly like the screen. The music font (Bravura, SMuFL) ships in the app bundle and is registered
// for this process on first use.

#import <AppKit/AppKit.h>

NS_ASSUME_NONNULL_BEGIN

@interface GPCommandPainter : NSObject

/**
 * Rectangles of this colour ("#RRGGBB", any case) erase what is under them instead of painting: the paper of a PNG
 * with a transparent background (the page, the gaps in the tab lines behind fret numbers). nil, the default: none.
 */
@property (nonatomic, copy, nullable) NSString *eraseColor;

/**
 * Draws the commands, in order, into NSGraphicsContext.currentContext (flipped). NO when a text was left out because
 * AppKit made no font for it (it happened once, 2026-10-25: an exception then, which AppKit turns into a crash inside
 * -drawRect:); drawing the commands again later draws it.
 */
- (BOOL)drawCommands:(NSArray<NSDictionary *> *)commands;

@end

NS_ASSUME_NONNULL_END
