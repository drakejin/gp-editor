// QA driver for development. When GPEDITOR_QA_SCRIPT names a JSON file, replays its steps against this app's
// own window — open a file, click, type, scroll, resize, switch appearance, snapshot to PNG — so the UI can be
// exercised and inspected without Screen Recording or Accessibility permissions. Events go through
// -[NSWindow sendEvent:], the same path as real input. Does nothing when the variable is unset; the sandboxed
// app cannot read a script outside its container, so it only works in the unsandboxed copy made by
// scripts/qa/run.sh.
//
// Script: {"steps": [{"open": "/abs/file.gp5"}, {"wait": 1500}, {"click": {"x": 300, "y": 200}},
//          {"key": "ArrowDown"}, {"key": "z", "modifiers": ["cmd"]}, {"scroll": {"x": 600, "y": 400, "dy": -300}},
//          {"resize": {"width": 1100, "height": 760}}, {"appearance": "dark"}, {"snapshot": "/abs/out.png"},
//          {"quit": true}]}
// Coordinates are points in the window's content view, origin top-left. Progress goes to "<script>.log".

#import <AppKit/AppKit.h>

static NSString *const kScriptVariable = @"GPEDITOR_QA_SCRIPT";
static NSString *const kOpenURLsNotification = @"GPEditorOpenURLs";
static const int64_t kStartDelaySeconds = 3;

@interface GPQADriver : NSObject
@property(nonatomic, copy) NSArray<NSDictionary *> *steps;
@property(nonatomic, copy) NSString *logPath;
@end

@implementation GPQADriver

__attribute__((constructor)) static void GPQADriverStart(void)
{
  NSString *path = NSProcessInfo.processInfo.environment[kScriptVariable];
  if (path.length == 0) {
    return;
  }
  dispatch_after(dispatch_time(DISPATCH_TIME_NOW, kStartDelaySeconds * NSEC_PER_SEC), dispatch_get_main_queue(), ^{
    [[GPQADriver driverForScript:path] runStep:0];
  });
}

+ (instancetype)driverForScript:(NSString *)path
{
  static GPQADriver *driver;
  driver = [GPQADriver new];
  driver.logPath = [path stringByAppendingString:@".log"];
  [@"" writeToFile:driver.logPath atomically:YES encoding:NSUTF8StringEncoding error:nil];
  NSData *data = [NSData dataWithContentsOfFile:path];
  NSDictionary *script = data == nil ? nil : [NSJSONSerialization JSONObjectWithData:data options:0 error:nil];
  driver.steps = [script[@"steps"] isKindOfClass:[NSArray class]] ? script[@"steps"] : @[];
  [driver log:[NSString stringWithFormat:@"script %@: %lu steps", path, (unsigned long)driver.steps.count]];
  return driver;
}

- (void)log:(NSString *)line
{
  NSFileHandle *handle = [NSFileHandle fileHandleForWritingAtPath:self.logPath];
  [handle seekToEndOfFile];
  [handle writeData:[[line stringByAppendingString:@"\n"] dataUsingEncoding:NSUTF8StringEncoding]];
  [handle closeFile];
}

- (NSWindow *)window
{
  for (NSWindow *window in NSApp.windows) {
    if (window.isVisible && window.canBecomeMainWindow) {
      return window;
    }
  }
  return NSApp.windows.firstObject;
}

- (void)runStep:(NSUInteger)index
{
  if (index >= self.steps.count) {
    [self log:@"done"];
    return;
  }
  NSDictionary *step = self.steps[index];
  NSTimeInterval delay = [self perform:step];
  [self log:[NSString stringWithFormat:@"step %lu ok: %@", (unsigned long)index, step.allKeys.firstObject]];
  dispatch_after(dispatch_time(DISPATCH_TIME_NOW, (int64_t)(delay * NSEC_PER_SEC)), dispatch_get_main_queue(), ^{
    [self runStep:index + 1];
  });
}

/** Runs one step; returns how long to wait before the next one. */
- (NSTimeInterval)perform:(NSDictionary *)step
{
  NSWindow *window = [self window];
  [NSApp activateIgnoringOtherApps:YES];
  [window makeKeyAndOrderFront:nil];
  if (step[@"open"] != nil) {
    NSURL *url = [NSURL fileURLWithPath:step[@"open"]];
    [[NSNotificationCenter defaultCenter] postNotificationName:kOpenURLsNotification object:@[ url ]];
    return 1.0;
  }
  if (step[@"wait"] != nil) {
    return [step[@"wait"] doubleValue] / 1000.0;
  }
  if (step[@"click"] != nil) {
    [self clickAt:[self windowPoint:step[@"click"] in:window] window:window];
    return 0.4;
  }
  if (step[@"key"] != nil) {
    [self pressKey:step[@"key"] modifiers:step[@"modifiers"] window:window];
    return 0.3;
  }
  if (step[@"scroll"] != nil) {
    [self scrollAt:[self windowPoint:step[@"scroll"] in:window] by:[step[@"scroll"][@"dy"] doubleValue] window:window];
    return 0.6;
  }
  if (step[@"resize"] != nil) {
    [window setContentSize:NSMakeSize([step[@"resize"][@"width"] doubleValue], [step[@"resize"][@"height"] doubleValue])];
    return 0.8;
  }
  if (step[@"appearance"] != nil) {
    NSAppearanceName name = [step[@"appearance"] isEqual:@"dark"] ? NSAppearanceNameDarkAqua : NSAppearanceNameAqua;
    NSApp.appearance = [NSAppearance appearanceNamed:name];
    return 1.0;
  }
  if (step[@"focusRoot"] != nil) {
    NSView *root = [self largestFocusableView:window];
    BOOL focused = root != nil && [window makeFirstResponder:root];
    [self log:[NSString stringWithFormat:@"focusRoot %@: %d", root, focused]];
    return 0.2;
  }
  if (step[@"inspect"] != nil) {
    [self inspect:window];
    return 0.1;
  }
  if (step[@"snapshot"] != nil) {
    [self snapshot:window to:step[@"snapshot"]];
    return 0.1;
  }
  if (step[@"quit"] != nil) {
    [NSApp terminate:nil];
  }
  return 0;
}

/** Top-left content coordinates → window coordinates (bottom-left origin). */
- (NSPoint)windowPoint:(NSDictionary *)point in:(NSWindow *)window
{
  CGFloat height = window.contentView.bounds.size.height;
  return NSMakePoint([point[@"x"] doubleValue], height - [point[@"y"] doubleValue]);
}

- (void)clickAt:(NSPoint)location window:(NSWindow *)window
{
  for (NSNumber *type in @[ @(NSEventTypeLeftMouseDown), @(NSEventTypeLeftMouseUp) ]) {
    NSEvent *event = [NSEvent mouseEventWithType:(NSEventType)type.unsignedIntegerValue
                                        location:location
                                   modifierFlags:0
                                       timestamp:NSProcessInfo.processInfo.systemUptime
                                    windowNumber:window.windowNumber
                                         context:nil
                                     eventNumber:0
                                      clickCount:1
                                        pressure:1.0];
    [window sendEvent:event];
  }
}

- (void)pressKey:(NSString *)key modifiers:(NSArray<NSString *> *)modifiers window:(NSWindow *)window
{
  static NSDictionary<NSString *, NSArray *> *special;
  static dispatch_once_t once;
  dispatch_once(&once, ^{
    // name → [characters, key code]
    special = @{
      @"ArrowUp" : @[ [NSString stringWithFormat:@"%C", (unichar)NSUpArrowFunctionKey], @126 ],
      @"ArrowDown" : @[ [NSString stringWithFormat:@"%C", (unichar)NSDownArrowFunctionKey], @125 ],
      @"ArrowLeft" : @[ [NSString stringWithFormat:@"%C", (unichar)NSLeftArrowFunctionKey], @123 ],
      @"ArrowRight" : @[ [NSString stringWithFormat:@"%C", (unichar)NSRightArrowFunctionKey], @124 ],
      @"Backspace" : @[ [NSString stringWithFormat:@"%C", (unichar)0x7F], @51 ],
      @"Delete" : @[ [NSString stringWithFormat:@"%C", (unichar)NSDeleteFunctionKey], @117 ],
      @"Escape" : @[ [NSString stringWithFormat:@"%C", (unichar)0x1B], @53 ],
      @"Enter" : @[ @"\r", @36 ],
    };
  });
  NSArray *mapped = special[key];
  NSString *characters = mapped != nil ? mapped[0] : key;
  unsigned short keyCode = mapped != nil ? [mapped[1] unsignedShortValue] : 0;
  NSEventModifierFlags flags = 0;
  flags |= [modifiers containsObject:@"cmd"] ? NSEventModifierFlagCommand : 0;
  flags |= [modifiers containsObject:@"shift"] ? NSEventModifierFlagShift : 0;
  flags |= [modifiers containsObject:@"alt"] ? NSEventModifierFlagOption : 0;
  flags |= mapped != nil && keyCode >= 123 && keyCode <= 126 ? NSEventModifierFlagFunction | NSEventModifierFlagNumericPad : 0;
  for (NSNumber *type in @[ @(NSEventTypeKeyDown), @(NSEventTypeKeyUp) ]) {
    NSEvent *event = [NSEvent keyEventWithType:(NSEventType)type.unsignedIntegerValue
                                      location:NSZeroPoint
                                 modifierFlags:flags
                                     timestamp:NSProcessInfo.processInfo.systemUptime
                                  windowNumber:window.windowNumber
                                       context:nil
                                    characters:characters
                   charactersIgnoringModifiers:characters
                                     isARepeat:NO
                                       keyCode:keyCode];
    // Through NSApp when the window is key, so menu key equivalents (⌘O) are found as with a real key press;
    // straight to the window otherwise (an app launched from a shell may not be allowed to activate).
    if (NSApp.keyWindow == window) {
      [NSApp sendEvent:event];
    } else {
      [window sendEvent:event];
    }
  }
  [self log:[NSString stringWithFormat:@"key %@: active=%d key=%d firstResponder=%@", key, NSApp.isActive,
                                       NSApp.keyWindow == window, NSStringFromClass([window.firstResponder class])]];
}

- (void)scrollAt:(NSPoint)location by:(double)deltaY window:(NSWindow *)window
{
  CGEventRef cgEvent = CGEventCreateScrollWheelEvent(NULL, kCGScrollEventUnitPixel, 1, (int32_t)deltaY);
  NSPoint onScreen = [window convertPointToScreen:location];
  CGFloat screenHeight = NSScreen.screens.firstObject.frame.size.height;
  CGEventSetLocation(cgEvent, CGPointMake(onScreen.x, screenHeight - onScreen.y));
  NSEvent *event = [NSEvent eventWithCGEvent:cgEvent];
  CFRelease(cgEvent);
  [window sendEvent:event];
}

- (NSView *)largestFocusableView:(NSWindow *)window
{
  NSView *best = nil;
  NSMutableArray<NSView *> *queue = [NSMutableArray arrayWithObject:window.contentView];
  while (queue.count > 0) {
    NSView *view = queue.firstObject;
    [queue removeObjectAtIndex:0];
    CGFloat area = view.frame.size.width * view.frame.size.height;
    if (view.acceptsFirstResponder && ![view isKindOfClass:[NSScroller class]] &&
        (best == nil || area > best.frame.size.width * best.frame.size.height)) {
      best = view;
    }
    [queue addObjectsFromArray:view.subviews];
  }
  return best;
}

/** Logs the first responder and every view that would accept keyboard focus. */
- (void)inspect:(NSWindow *)window
{
  NSMutableArray<NSString *> *focusable = [NSMutableArray array];
  NSMutableArray<NSView *> *queue = [NSMutableArray arrayWithObject:window.contentView];
  while (queue.count > 0) {
    NSView *view = queue.firstObject;
    [queue removeObjectAtIndex:0];
    if (view.acceptsFirstResponder) {
      [focusable addObject:[NSString stringWithFormat:@"%@ %@", NSStringFromClass([view class]), NSStringFromRect(view.frame)]];
    }
    [queue addObjectsFromArray:view.subviews];
  }
  [self log:[NSString stringWithFormat:@"inspect: firstResponder=%@ focusable=%@", window.firstResponder, focusable]];
}

- (void)snapshot:(NSWindow *)window to:(NSString *)path
{
  NSView *view = window.contentView;
  NSBitmapImageRep *rep = [view bitmapImageRepForCachingDisplayInRect:view.bounds];
  [view cacheDisplayInRect:view.bounds toBitmapImageRep:rep];
  NSData *png = [rep representationUsingType:NSBitmapImageFileTypePNG properties:@{}];
  BOOL written = [png writeToFile:path atomically:YES];
  [self log:[NSString stringWithFormat:@"snapshot %@ %@ (%ldx%ld)", path, written ? @"written" : @"FAILED", (long)rep.pixelsWide, (long)rep.pixelsHigh]];
}

@end
