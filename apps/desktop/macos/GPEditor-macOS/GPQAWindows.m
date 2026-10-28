#import "GPQAWindows.h"

#import "GPEditorNotifications.h"

/** One second for the menu to open before it is drawn and closed. */
static const double kMenuOpenSeconds = 1.0;

static BOOL GPQAWritePng(NSBitmapImageRep *rep, NSString *path, NSString *how, GPQALog log)
{
  BOOL written = rep != nil && [[rep representationUsingType:NSBitmapImageFileTypePNG properties:@{}] writeToFile:path atomically:YES];
  log([NSString stringWithFormat:@"snapshot %@ %@ (%ldx%ld, %@)", path, written ? @"written" : @"FAILED", (long)rep.pixelsWide, (long)rep.pixelsHigh, how]);
  return written;
}

/** The window as the window server shows it (the app's own windows need no Screen Recording permission). */
static NSBitmapImageRep *_Nullable GPQACaptureWindow(NSWindow *window)
{
#pragma clang diagnostic push
#pragma clang diagnostic ignored "-Wdeprecated-declarations"
  CGImageRef image = CGWindowListCreateImage(CGRectNull, kCGWindowListOptionIncludingWindow, (CGWindowID)window.windowNumber,
                                             kCGWindowImageBoundsIgnoreFraming | kCGWindowImageBestResolution);
#pragma clang diagnostic pop
  if (image == NULL) {
    return nil;
  }
  NSBitmapImageRep *rep = [[NSBitmapImageRep alloc] initWithCGImage:image];
  CGImageRelease(image);
  return rep;
}

/** An image (a template icon draws black) on white, at 4×, for a snapshot of what a view shows. */
static NSBitmapImageRep *GPQADrawImage(NSImage *image)
{
  NSSize size = NSMakeSize(image.size.width * 4, image.size.height * 4);
  NSBitmapImageRep *rep = [[NSBitmapImageRep alloc] initWithBitmapDataPlanes:NULL pixelsWide:(NSInteger)size.width pixelsHigh:(NSInteger)size.height bitsPerSample:8 samplesPerPixel:4 hasAlpha:YES isPlanar:NO colorSpaceName:NSDeviceRGBColorSpace bytesPerRow:0 bitsPerPixel:0];
  [NSGraphicsContext saveGraphicsState];
  NSGraphicsContext.currentContext = [NSGraphicsContext graphicsContextWithBitmapImageRep:rep];
  [[NSColor whiteColor] setFill];
  NSRectFill(NSMakeRect(0, 0, size.width, size.height));
  [image drawInRect:NSMakeRect(0, 0, size.width, size.height)];
  [NSGraphicsContext restoreGraphicsState];
  return rep;
}

static NSBitmapImageRep *GPQADrawView(NSView *view)
{
  NSBitmapImageRep *rep = [view bitmapImageRepForCachingDisplayInRect:view.bounds];
  [view cacheDisplayInRect:view.bounds toBitmapImageRep:rep];
  return rep;
}

/** A window the system draws (a menu, the menu bar's item): captured, else the view's own drawing. */
static void GPQASnapshotSystemWindow(NSWindow *window, NSView *view, NSString *path, GPQALog log)
{
  NSBitmapImageRep *captured = GPQACaptureWindow(window);
  if (captured == nil || !GPQAWritePng(captured, path, @"captured from the window server", log)) {
    GPQAWritePng(GPQADrawView(view), path, @"the view's own drawing", log);
  }
}

void GPQASnapshotWindow(NSString *identifier, NSString *path, GPQALog log)
{
  for (NSWindow *window in NSApp.windows) {
    if (window.isVisible && [window.identifier isEqualToString:identifier]) {
      log([NSString stringWithFormat:@"snapshotWindow %@: %@ (%.0fx%.0f)", identifier, window.title, window.frame.size.width, window.frame.size.height]);
      // As the screen shows it (SwiftUI's controls are drawn by layers a view's own drawing leaves out), else drawn.
      [window orderFrontRegardless];
      GPQASnapshotSystemWindow(window, window.contentView, path, log);
      return;
    }
  }
  log([NSString stringWithFormat:@"snapshotWindow: no window %@", identifier]);
}

static NSString *GPQAMenuItems(NSMenu *menu)
{
  if ([menu.delegate respondsToSelector:@selector(menuNeedsUpdate:)]) {
    [menu.delegate menuNeedsUpdate:menu];
  }
  NSMutableArray<NSString *> *titles = [NSMutableArray array];
  for (NSMenuItem *each in menu.itemArray) {
    [titles addObject:each.isSeparatorItem ? @"-" : each.isEnabled ? each.title : [each.title stringByAppendingString:@" (off)"]];
  }
  return [titles componentsJoinedByString:@" | "];
}

/** The open menu's window (a window of the app while the menu tracks). */
static void GPQASnapshotOpenMenu(NSString *path, GPQALog log)
{
  for (NSWindow *window in NSApp.windows) {
    if (window.isVisible && [NSStringFromClass(window.class) containsString:@"Menu"]) {
      log([NSString stringWithFormat:@"statusMenu: the menu's window %@ (%.0fx%.0f)", NSStringFromClass(window.class), window.frame.size.width, window.frame.size.height]);
      GPQASnapshotSystemWindow(window, window.contentView, path, log);
      return;
    }
  }
  log(@"statusMenu: no menu window is open");
}

void GPQAStatusMenu(NSString *path, GPQALog log)
{
  NSMutableDictionary *found = [NSMutableDictionary dictionary];
  [[NSNotificationCenter defaultCenter] postNotificationName:GPEditorMcpStatusItemQueryNotification object:found];
  NSMenu *menu = found[@"menu"];
  NSStatusBarButton *button = found[@"button"];
  if (menu == nil || button == nil) {
    log(@"statusMenu: the menu bar item is not shown");
    return;
  }
  log([NSString stringWithFormat:@"statusMenu items: %@", GPQAMenuItems(menu)]);
  log([NSString stringWithFormat:@"statusMenu button: tooltip \"%@\", dimmed %@", button.toolTip ?: @"", button.appearsDisabled ? @"YES" : @"NO"]);
  // The menu bar is drawn outside the app: the button's icon is drawn from its image instead.
  GPQAWritePng(GPQADrawImage(button.image), [[path stringByDeletingPathExtension] stringByAppendingString:@"-button.png"], @"the button's image", log);
  // The click tracks the menu modally until it closes: the drawing and the closing run from the main queue meanwhile.
  dispatch_after(dispatch_time(DISPATCH_TIME_NOW, (int64_t)(kMenuOpenSeconds * NSEC_PER_SEC)), dispatch_get_main_queue(), ^{
    GPQASnapshotOpenMenu(path, log);
    [menu cancelTracking];
  });
  [button performClick:nil];
  log(@"statusMenu: closed");
}
