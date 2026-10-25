// QA driver for development. When GPEDITOR_QA_SCRIPT names a JSON file, replays its steps against this app's
// own window — open a file, click, type, scroll, resize, switch appearance, snapshot to PNG — so the UI can be
// exercised and inspected without Screen Recording or Accessibility permissions. Mouse events go through
// -[NSWindow sendEvent:]; so does `key` unless the app is active; `appKey` is dispatched by NSApplication as a typed key
// is, so the menu bar's key equivalents see it first. Does nothing when the variable is unset. It is not gated on the
// sandbox on purpose: the sandboxed app can only read a script inside its own container, which is how sandbox
// behaviour is checked; everyday QA uses the unsandboxed copy made by scripts/qa/run.sh.
//
// Script: {"steps": [{"open": "/abs/file.gp5"}, {"wait": 1500}, {"click": {"x": 300, "y": 200}},
//          {"drag": {"from": {"x": 300, "y": 200}, "to": {"x": 500, "y": 420}, "steps": 8}}, {"rightClick": {"x": 300, "y": 200}}, {"controlClick": …},
//          {"key": "ArrowDown"}, {"key": "z", "modifiers": ["cmd"]}, {"scroll": {"x": 600, "y": 400, "dy": -300}},
//          {"appKey": "c", "modifiers": ["cmd"]} (a typed key, dispatched by NSApplication: the menus' key equivalents first),
//          {"menuKeys": true} (logs every menu item with a key equivalent), {"setPasteboard": "text"}, {"logPasteboard": true},
//          {"hover": {"x": 300, "y": 200}} (the mouse entering the views there: onHoverIn),
//          {"resize": {"width": 1100, "height": 760}}, {"appearance": "dark"}, {"snapshot": "/abs/out.png"},
//          {"notify": "GPEditorSaveCommand"}, {"notify": "GPEditorNewCommand", "object": "tab"},
//          {"menu": ["File", "Open Recent"]} (logs the items), {"menu": ["File", "Open Recent", "Song.gp5"]} (chooses it),
//          {"snapshotModal": "/abs/panel.png"} (a save panel or alert running modally: its texts logged, its content to PNG),
//          {"cancelModal": true} (aborts it), {"quit": true}]}
// Coordinates are points in the window's content view, origin top-left. Progress goes to "<script>.log".

#import <AppKit/AppKit.h>

#import "GPEditorNotifications.h"

static NSString *const kScriptVariable = @"GPEDITOR_QA_SCRIPT";
static const int64_t kStartDelaySeconds = 3;
/** How long a right click keeps the window moved: the queued mouse-up is handled well within it, the next step comes after. */
static const double kRightClickHoldSeconds = 0.2;
/** Between the moves of a paced drag: long enough for each to be handled before the next is sent. */
static const double kPacedDragStepSeconds = 0.05;

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
  // In the common run loop modes, so the next step also runs while a save panel or an alert runs modally.
  [self performSelector:@selector(runStepNumber:) withObject:@(index + 1) afterDelay:delay inModes:@[ NSRunLoopCommonModes ]];
}

- (void)runStepNumber:(NSNumber *)index
{
  [self runStep:index.unsignedIntegerValue];
}

/** Runs one step; returns how long to wait before the next one. */
- (NSTimeInterval)perform:(NSDictionary *)step
{
  NSWindow *window = [self window];
  [NSApp activateIgnoringOtherApps:YES];
  [window makeKeyAndOrderFront:nil];
  if (step[@"open"] != nil) {
    NSURL *url = [NSURL fileURLWithPath:step[@"open"]];
    [[NSNotificationCenter defaultCenter] postNotificationName:GPEditorOpenURLsNotification object:@[ url ]];
    return 1.0;
  }
  if (step[@"notify"] != nil) {
    // Menu commands (e.g. GPEditorSaveCommand) without the menu bar, which needs an active app. "object" is passed on
    // (GPEditorNewCommand takes the score mode).
    [[NSNotificationCenter defaultCenter] postNotificationName:step[@"notify"] object:step[@"object"]];
    return 1.0;
  }
  if (step[@"wait"] != nil) {
    return [step[@"wait"] doubleValue] / 1000.0;
  }
  if ([step[@"menu"] isKindOfClass:[NSArray class]]) {
    [self menuStep:step[@"menu"]];
    return 1.0;
  }
  if (step[@"click"] != nil) {
    [self clickAt:[self windowPoint:step[@"click"] in:window] window:window];
    return 0.4;
  }
  if (step[@"rightClick"] != nil) {
    [self rightClickAt:[self windowPoint:step[@"rightClick"] in:window] window:window];
    return 0.4;
  }
  if (step[@"controlClick"] != nil) {
    [self controlClickAt:[self windowPoint:step[@"controlClick"] in:window] window:window];
    return 0.4;
  }
  if (step[@"hover"] != nil) {
    [self hoverAt:[self windowPoint:step[@"hover"] in:window] window:window];
    return 0.4;
  }
  if (step[@"drag"] != nil) {
    NSDictionary *drag = step[@"drag"];
    NSInteger steps = MAX(1, [drag[@"steps"] integerValue]);
    NSPoint from = [self windowPoint:drag[@"from"] in:window];
    NSPoint to = [self windowPoint:drag[@"to"] in:window];
    if ([drag[@"paced"] boolValue]) {
      [self pacedDragFrom:from to:to steps:steps hold:[drag[@"hold"] boolValue] window:window];
      return (steps + 2) * kPacedDragStepSeconds + 0.6;
    }
    [self dragFrom:from to:to steps:steps hold:[drag[@"hold"] boolValue] window:window];
    return 0.8;
  }
  if (step[@"mouseUp"] != nil) {
    [window sendEvent:[self mouseEvent:NSEventTypeLeftMouseUp at:[self windowPoint:step[@"mouseUp"] in:window] window:window]];
    return 0.4;
  }
  if (step[@"key"] != nil) {
    [self pressKey:step[@"key"] modifiers:step[@"modifiers"] window:window];
    return 0.3;
  }
  if ([step[@"appKey"] isKindOfClass:[NSString class]]) {
    [self postKey:step[@"appKey"] modifiers:step[@"modifiers"] window:window];
    return 0.4;
  }
  if (step[@"menuKeys"] != nil) {
    [self logMenuKeys:NSApp.mainMenu path:@""];
    return 0.1;
  }
  if ([step[@"setPasteboard"] isKindOfClass:[NSString class]]) {
    [NSPasteboard.generalPasteboard clearContents];
    [NSPasteboard.generalPasteboard setString:step[@"setPasteboard"] forType:NSPasteboardTypeString];
    return 0.1;
  }
  if (step[@"logPasteboard"] != nil) {
    [self logPasteboard];
    return 0.1;
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
  if (step[@"snapshotModal"] != nil) {
    [self snapshotModalTo:step[@"snapshotModal"]];
    return 0.1;
  }
  if (step[@"cancelModal"] != nil) {
    [self log:[NSString stringWithFormat:@"cancelModal: %@", NSApp.modalWindow]];
    [NSApp abortModal];
    return 0.5;
  }
  if (step[@"quit"] != nil) {
    [NSApp terminate:nil];
  }
  return 0;
}

/** Brings a menu of the menu bar up to date (SwiftUI fills some when they open). */
- (void)updateMenu:(NSMenu *)menu
{
  if ([menu.delegate respondsToSelector:@selector(menuNeedsUpdate:)]) {
    [menu.delegate menuNeedsUpdate:menu];
  }
  [menu update];
}

/**
 * A path of titles in the menu bar: ending at a menu, logs its items ("-" a separator, "(off)" a disabled item);
 * ending at an item, chooses it as a click in the menu does.
 */
- (void)menuStep:(NSArray<NSString *> *)path
{
  NSMenu *menu = NSApp.mainMenu;
  NSMenuItem *item = nil;
  for (NSString *title in path) {
    [self updateMenu:menu];
    item = [menu itemWithTitle:title];
    if (item == nil || item.submenu == nil) {
      break;
    }
    menu = item.submenu;
  }
  if (item == nil) {
    [self log:[NSString stringWithFormat:@"menu: no item %@", path.lastObject]];
  } else if (item.submenu == nil && !item.isEnabled) {
    [self log:[NSString stringWithFormat:@"menu: %@ is disabled", item.title]];
  } else if (item.submenu == nil) {
    [self log:[NSString stringWithFormat:@"menu: chose %@", item.title]];
    [item.menu performActionForItemAtIndex:[item.menu indexOfItem:item]];
  } else {
    [self updateMenu:menu];
    NSMutableArray<NSString *> *titles = [NSMutableArray array];
    for (NSMenuItem *each in menu.itemArray) {
      [titles addObject:each.isSeparatorItem ? @"-" : each.isEnabled ? each.title : [each.title stringByAppendingString:@" (off)"]];
    }
    [self log:[NSString stringWithFormat:@"menu %@: %@", [path componentsJoinedByString:@" > "], [titles componentsJoinedByString:@" | "]]];
  }
}

/** Top-left content coordinates → window coordinates (bottom-left origin). */
- (NSPoint)windowPoint:(NSDictionary *)point in:(NSWindow *)window
{
  CGFloat height = window.contentView.bounds.size.height;
  return NSMakePoint([point[@"x"] doubleValue], height - [point[@"y"] doubleValue]);
}

- (NSEvent *)mouseEvent:(NSEventType)type at:(NSPoint)location window:(NSWindow *)window
{
  return [self mouseEvent:type at:location flags:0 window:window];
}

- (NSEvent *)mouseEvent:(NSEventType)type at:(NSPoint)location flags:(NSEventModifierFlags)flags window:(NSWindow *)window
{
  return [NSEvent mouseEventWithType:type
                            location:location
                       modifierFlags:flags
                           timestamp:NSProcessInfo.processInfo.systemUptime
                        windowNumber:window.windowNumber
                             context:nil
                         eventNumber:0
                          clickCount:1
                            pressure:1.0];
}

/**
 * Mouse down, then up. The up goes into the event queue first: a view that tracks the mouse inside mouseDown (a text
 * field placing its caret) waits there for it, and would never return if the up were sent only afterwards.
 */
- (void)clickAt:(NSPoint)location window:(NSWindow *)window
{
  [NSApp postEvent:[self mouseEvent:NSEventTypeLeftMouseUp at:location window:window] atStart:NO];
  [window sendEvent:[self mouseEvent:NSEventTypeLeftMouseDown at:location window:window]];
}

/**
 * Right mouse down, then up (queued first, as for a click): a view with onAuxClick gets it, a Pressable is not pressed.
 * react-native-macos takes that click's place from the real pointer (mouseLocationOutsideOfEventStream), not the event,
 * so the window moves for a moment to put `location` under the pointer; the pointer itself is left where it is.
 */
- (void)rightClickAt:(NSPoint)location window:(NSWindow *)window
{
  NSPoint origin = window.frame.origin;
  NSPoint pointer = NSEvent.mouseLocation;
  [window setFrameOrigin:NSMakePoint(pointer.x - location.x, pointer.y - location.y)];
  NSPoint seen = window.mouseLocationOutsideOfEventStream;
  CGFloat height = window.contentView.bounds.size.height;
  [self log:[NSString stringWithFormat:@"rightClick: the pointer is at %.1f, %.1f", seen.x, height - seen.y]];
  [NSApp postEvent:[self mouseEvent:NSEventTypeRightMouseUp at:location window:window] atStart:NO];
  [window sendEvent:[self mouseEvent:NSEventTypeRightMouseDown at:location window:window]];
  dispatch_after(dispatch_time(DISPATCH_TIME_NOW, (int64_t)(kRightClickHoldSeconds * NSEC_PER_SEC)), dispatch_get_main_queue(), ^{
    [window setFrameOrigin:origin];
  });
}

/** A click with control held (macOS's other right click): a Pressable is pressed with ctrlKey. */
- (void)controlClickAt:(NSPoint)location window:(NSWindow *)window
{
  [NSApp postEvent:[self mouseEvent:NSEventTypeLeftMouseUp at:location flags:NSEventModifierFlagControl window:window] atStart:NO];
  [window sendEvent:[self mouseEvent:NSEventTypeLeftMouseDown at:location flags:NSEventModifierFlagControl window:window]];
}

/**
 * The mouse entering the views at a point. Tracking areas only follow the real pointer, so every view there that tracks
 * the mouse (react-native-macos views with onMouseEnter / a Pressable's onHoverIn) gets -mouseEntered: directly.
 */
- (void)hoverAt:(NSPoint)location window:(NSWindow *)window
{
  NSView *hit = [window.contentView.superview hitTest:location];
  NSEvent *event = [NSEvent enterExitEventWithType:NSEventTypeMouseEntered
                                          location:location
                                     modifierFlags:0
                                         timestamp:NSProcessInfo.processInfo.systemUptime
                                      windowNumber:window.windowNumber
                                           context:nil
                                       eventNumber:0
                                    trackingNumber:0
                                          userData:NULL];
  NSUInteger entered = 0;
  for (NSView *view = hit; view != nil; view = view.superview) {
    if (view.trackingAreas.count > 0) {
      [view mouseEntered:event];
      entered += 1;
    }
  }
  [self log:[NSString stringWithFormat:@"hover %@: %lu views entered", NSStringFromPoint(location), (unsigned long)entered]];
}

/**
 * Mouse down at `from`, then `steps` drags along the line to `to` and the up there, queued first as for a click. With
 * `hold` the mouse stays down (a snapshot shows the drag in progress) until a `mouseUp` step.
 */
- (void)dragFrom:(NSPoint)from to:(NSPoint)to steps:(NSInteger)steps hold:(BOOL)hold window:(NSWindow *)window
{
  for (NSInteger i = 1; i <= steps; i++) {
    CGFloat t = (CGFloat)i / (CGFloat)steps;
    NSPoint point = NSMakePoint(from.x + (to.x - from.x) * t, from.y + (to.y - from.y) * t);
    [NSApp postEvent:[self mouseEvent:NSEventTypeLeftMouseDragged at:point window:window] atStart:NO];
  }
  if (!hold) {
    [NSApp postEvent:[self mouseEvent:NSEventTypeLeftMouseUp at:to window:window] atStart:NO];
  }
  [window sendEvent:[self mouseEvent:NSEventTypeLeftMouseDown at:from window:window]];
}

/**
 * A drag as a hand makes it: the down now, then each move sent on its own a moment after the last (queued together,
 * AppKit coalesces the moves into one, and posted ones reach React Native offset by the window's origin), then the up
 * unless `hold` (a later `mouseUp` step). For views that follow every move (Design Mode).
 */
- (void)pacedDragFrom:(NSPoint)from to:(NSPoint)to steps:(NSInteger)steps hold:(BOOL)hold window:(NSWindow *)window
{
  [window sendEvent:[self mouseEvent:NSEventTypeLeftMouseDown at:from window:window]];
  for (NSInteger i = 1; i <= steps + (hold ? 0 : 1); i++) {
    CGFloat t = MIN(1.0, (CGFloat)i / (CGFloat)steps);
    NSPoint point = NSMakePoint(from.x + (to.x - from.x) * t, from.y + (to.y - from.y) * t);
    NSEventType type = i > steps ? NSEventTypeLeftMouseUp : NSEventTypeLeftMouseDragged;
    dispatch_after(dispatch_time(DISPATCH_TIME_NOW, (int64_t)(i * kPacedDragStepSeconds * NSEC_PER_SEC)), dispatch_get_main_queue(), ^{
      [window sendEvent:[self mouseEvent:type at:point window:window]];
    });
  }
}

/** The keys a script names: name → [characters, key code] (Events.h kVK_*). */
static NSDictionary<NSString *, NSArray *> *GPQANamedKeys(void)
{
  static NSDictionary<NSString *, NSArray *> *named;
  static dispatch_once_t once;
  dispatch_once(&once, ^{
    NSString * (^text)(unichar) = ^(unichar character) {
      return [NSString stringWithFormat:@"%C", character];
    };
    named = @{
      @"ArrowUp" : @[ text(NSUpArrowFunctionKey), @126 ],
      @"ArrowDown" : @[ text(NSDownArrowFunctionKey), @125 ],
      @"ArrowLeft" : @[ text(NSLeftArrowFunctionKey), @123 ],
      @"ArrowRight" : @[ text(NSRightArrowFunctionKey), @124 ],
      @"Backspace" : @[ text(0x7F), @51 ],
      @"Delete" : @[ text(NSDeleteFunctionKey), @117 ],
      @"Escape" : @[ text(0x1B), @53 ],
      @"Enter" : @[ @"\r", @36 ],
      @"Tab" : @[ @"\t", @48 ],
      @"Home" : @[ text(NSHomeFunctionKey), @115 ],
      @"End" : @[ text(NSEndFunctionKey), @119 ],
      @"F3" : @[ text(NSF3FunctionKey), @99 ],
      @"F7" : @[ text(NSF7FunctionKey), @98 ],
    };
  });
  return named;
}

/** The US layout's key codes (Events.h kVK_ANSI_*) of the keys a script names by their character. */
static NSDictionary<NSString *, NSNumber *> *GPQACharacterKeyCodes(void)
{
  static NSDictionary<NSString *, NSNumber *> *codes;
  static dispatch_once_t once;
  dispatch_once(&once, ^{
    codes = @{
      @"a" : @0, @"s" : @1, @"d" : @2, @"f" : @3, @"h" : @4, @"g" : @5, @"z" : @6, @"x" : @7, @"c" : @8, @"v" : @9,
      @"b" : @11, @"q" : @12, @"w" : @13, @"e" : @14, @"r" : @15, @"y" : @16, @"t" : @17, @"1" : @18, @"2" : @19,
      @"3" : @20, @"4" : @21, @"6" : @22, @"5" : @23, @"=" : @24, @"9" : @25, @"7" : @26, @"-" : @27, @"8" : @28,
      @"0" : @29, @"]" : @30, @"o" : @31, @"u" : @32, @"[" : @33, @"i" : @34, @"p" : @35, @"l" : @37, @"j" : @38,
      @"'" : @39, @"k" : @40, @";" : @41, @"\\" : @42, @"," : @43, @"/" : @44, @"n" : @45, @"m" : @46, @"." : @47,
      @" " : @49, @"`" : @50,
    };
  });
  return codes;
}

/** The CGEvent field AppKit reads a key event's window number from (not public: QA only). */
static const CGEventField kGPQAWindowNumberField = (CGEventField)51;

/**
 * A key event made the way the window server makes one for this window: AppKit gives it the characters a real press
 * types on the current keyboard layout (⇧⌘P: "p", ignoring modifiers "P"; ⌥C: "ç" / "c"), and the menus match it by
 * its key code, as they match a typed key (an NSEvent made from characters alone misses shifted items such as ⇧⌘P).
 */
static NSEvent *GPQAKeyboardEvent(unsigned short keyCode, BOOL isDown, NSEventModifierFlags flags, NSWindow *window)
{
  CGEventRef cgEvent = CGEventCreateKeyboardEvent(NULL, keyCode, isDown);
  CGEventSetFlags(cgEvent, (CGEventFlags)flags);
  CGEventSetIntegerValueField(cgEvent, kGPQAWindowNumberField, window.windowNumber);
  NSEvent *event = [NSEvent eventWithCGEvent:cgEvent];
  CFRelease(cgEvent);
  return event;
}

/** The function-key flags a real press of this key carries (arrows also the numeric pad's). */
static NSEventModifierFlags GPQAFunctionFlags(unsigned short keyCode)
{
  BOOL isArrow = keyCode >= 123 && keyCode <= 126;
  BOOL isFunctionKey = keyCode == 99 || keyCode == 98 || keyCode == 115 || keyCode == 119 || keyCode == 117;
  return isArrow ? NSEventModifierFlagFunction | NSEventModifierFlagNumericPad : isFunctionKey ? NSEventModifierFlagFunction : 0;
}

- (NSEventModifierFlags)modifierFlags:(NSArray<NSString *> *)modifiers
{
  NSEventModifierFlags flags = 0;
  flags |= [modifiers containsObject:@"cmd"] ? NSEventModifierFlagCommand : 0;
  flags |= [modifiers containsObject:@"shift"] ? NSEventModifierFlagShift : 0;
  flags |= [modifiers containsObject:@"alt"] ? NSEventModifierFlagOption : 0;
  flags |= [modifiers containsObject:@"ctrl"] ? NSEventModifierFlagControl : 0;
  return flags;
}

- (void)pressKey:(NSString *)key modifiers:(NSArray<NSString *> *)modifiers window:(NSWindow *)window
{
  NSArray *mapped = GPQANamedKeys()[key];
  // Shift writes a letter's capital, as a real key press reports it even in charactersIgnoringModifiers (so ⇧⌘Z finds
  // the menu's Redo).
  BOOL isShiftedLetter = mapped == nil && key.length == 1 && [modifiers containsObject:@"shift"];
  NSString *characters = mapped != nil ? mapped[0] : (isShiftedLetter ? key.uppercaseString : key);
  unsigned short keyCode = mapped != nil ? [mapped[1] unsignedShortValue] : 0;
  NSEventModifierFlags flags = [self modifierFlags:modifiers];
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

/**
 * A key press as the keyboard makes it (GPQAKeyboardEvent: the key's code, the text it types), dispatched by
 * NSApplication — local monitors, the window's and the menu bar's key equivalents, then the first responder — so a
 * menu item that takes the key takes it here too, which the `key` step (characters only, straight to the window when
 * the app is not active) never showed. Queued as typed keys are while the app is active, sent through NSApp at once
 * when it cannot be (a locked screen). The log names the menu item the press matches.
 */
- (void)postKey:(NSString *)key modifiers:(NSArray<NSString *> *)modifiers window:(NSWindow *)window
{
  NSArray *named = GPQANamedKeys()[key];
  NSNumber *code = named != nil ? named[1] : GPQACharacterKeyCodes()[key.lowercaseString];
  if (code == nil) {
    [self log:[NSString stringWithFormat:@"appKey %@: no key code for it", key]];
    return;
  }
  unsigned short keyCode = code.unsignedShortValue;
  NSEventModifierFlags flags = [self modifierFlags:modifiers] | GPQAFunctionFlags(keyCode);
  // The keyboard's path needs the app active with this window key; otherwise (a locked screen) NSApp dispatches the
  // events at once, as it does a dequeued one: local monitors, key equivalents, then the window.
  BOOL isKeyboardPath = NSApp.isActive && NSApp.keyWindow == window;
  NSEvent *down = GPQAKeyboardEvent(keyCode, YES, flags, window);
  NSMenuItem *item = [self menuItemForKey:down menu:NSApp.mainMenu];
  if (item != nil) {
    id target = [NSApp targetForAction:item.action to:item.target from:item];
    [self log:[NSString stringWithFormat:@"appKey %@: matches the menu bar's \"%@\" (action %@, responder %@, enabled %d)", key, item.title,
                                         NSStringFromSelector(item.action), target == nil ? @"none" : NSStringFromClass([target class]), item.isEnabled]];
  }
  for (NSEvent *event in @[ down, GPQAKeyboardEvent(keyCode, NO, flags, window) ]) {
    if (isKeyboardPath) {
      [NSApp postEvent:event atStart:NO];
    } else {
      [NSApp sendEvent:event];
    }
  }
  [self log:[NSString stringWithFormat:@"appKey %@ %@ (code %d, \"%@\" ignoring modifiers \"%@\"): %@, active=%d key=%d main=%d firstResponder=%@", key,
                                       [modifiers componentsJoinedByString:@"+"] ?: @"", keyCode, down.characters, down.charactersIgnoringModifiers,
                                       isKeyboardPath ? @"queued" : @"sent through NSApp", NSApp.isActive, NSApp.keyWindow == window,
                                       NSApp.mainWindow == window, NSStringFromClass([window.firstResponder class])]];
}

/** The menu bar's item whose key equivalent is this press (its character and ⌘ ⌥ ⇧ ⌃), or nil. */
- (NSMenuItem *)menuItemForKey:(NSEvent *)event menu:(NSMenu *)menu
{
  NSEventModifierFlags relevant = NSEventModifierFlagCommand | NSEventModifierFlagOption | NSEventModifierFlagShift | NSEventModifierFlagControl;
  for (NSMenuItem *item in menu.itemArray) {
    NSMenuItem *found = item.submenu != nil ? [self menuItemForKey:event menu:item.submenu] : nil;
    BOOL isUpper = item.keyEquivalent.length == 1 && ![item.keyEquivalent isEqualToString:item.keyEquivalent.lowercaseString];
    NSEventModifierFlags mask = (item.keyEquivalentModifierMask | (isUpper ? NSEventModifierFlagShift : 0)) & relevant;
    BOOL isMatch = item.keyEquivalent.length > 0 && [item.keyEquivalent.lowercaseString isEqualToString:event.charactersIgnoringModifiers.lowercaseString] &&
                   mask == (event.modifierFlags & relevant);
    if (found != nil || isMatch) {
      return found ?: item;
    }
  }
  return nil;
}

/** The menu bar's key equivalents: each item that has one, with its action, target and (as matched now) enabled state. */
- (void)logMenuKeys:(NSMenu *)menu path:(NSString *)path
{
  for (NSMenuItem *item in menu.itemArray) {
    NSString *itemPath = path.length == 0 ? item.title : [NSString stringWithFormat:@"%@ > %@", path, item.title];
    if (item.submenu != nil) {
      [self logMenuKeys:item.submenu path:itemPath];
    } else if (item.keyEquivalent.length > 0) {
      NSEventModifierFlags mask = item.keyEquivalentModifierMask;
      unichar first = [item.keyEquivalent characterAtIndex:0];
      NSString *keyName = first >= NSF1FunctionKey && first <= NSF35FunctionKey ? [NSString stringWithFormat:@"F%d", first - NSF1FunctionKey + 1]
                          : first < 0x21                                       ? [NSString stringWithFormat:@"U+%04X", first]
                                                                               : item.keyEquivalent;
      NSString *keys = [NSString stringWithFormat:@"%@%@%@%@%@%@", (mask & NSEventModifierFlagFunction) ? @"fn " : @"", (mask & NSEventModifierFlagControl) ? @"⌃" : @"",
                                                  (mask & NSEventModifierFlagOption) ? @"⌥" : @"", (mask & NSEventModifierFlagShift) ? @"⇧" : @"",
                                                  (mask & NSEventModifierFlagCommand) ? @"⌘" : @"", keyName];
      [self log:[NSString stringWithFormat:@"menuKey %@  %@  action=%@ target=%@%@", keys, itemPath, NSStringFromSelector(item.action),
                                           item.target == nil ? @"nil" : NSStringFromClass([item.target class]), item.isEnabled ? @"" : @" (off)"]];
    }
  }
}

/** The general pasteboard's types and plain text (the beats' summary after a copy). */
- (void)logPasteboard
{
  NSPasteboard *pasteboard = NSPasteboard.generalPasteboard;
  NSString *text = [pasteboard stringForType:NSPasteboardTypeString] ?: @"";
  NSString *shown = text.length > 120 ? [[text substringToIndex:120] stringByAppendingString:@"…"] : text;
  [self log:[NSString stringWithFormat:@"pasteboard: types=%@ text=\"%@\"", [pasteboard.types componentsJoinedByString:@", "], shown]];
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

/** The modal window (a save panel, an alert): the texts of its labels and buttons logged, its content saved as PNG. */
- (void)snapshotModalTo:(NSString *)path
{
  NSWindow *modal = NSApp.modalWindow;
  if (modal == nil) {
    [self log:@"snapshotModal: no modal window"];
    return;
  }
  NSMutableArray<NSString *> *texts = [NSMutableArray array];
  NSMutableArray<NSView *> *queue = [NSMutableArray arrayWithObject:modal.contentView];
  while (queue.count > 0) {
    NSView *view = queue.firstObject;
    [queue removeObjectAtIndex:0];
    NSString *text = [view isKindOfClass:[NSButton class]] ? ((NSButton *)view).title : [view isKindOfClass:[NSTextField class]] ? ((NSTextField *)view).stringValue : nil;
    if (text.length > 0) {
      [texts addObject:text];
    }
    [queue addObjectsFromArray:view.subviews];
  }
  // A save or open panel draws its own content out of process; what the app gave it (title, message, prompt, the
  // accessory view's label and popup) is read from the panel, and the accessory view is the snapshot.
  NSView *accessory = nil;
  if ([modal isKindOfClass:[NSSavePanel class]]) {
    NSSavePanel *panel = (NSSavePanel *)modal;
    [texts addObjectsFromArray:@[ panel.title ?: @"", panel.message ?: @"", panel.prompt ?: @"", panel.nameFieldLabel ?: @"" ]];
    accessory = panel.accessoryView;
    NSMutableArray<NSView *> *views = accessory == nil ? [NSMutableArray array] : [NSMutableArray arrayWithObject:accessory];
    while (views.count > 0) {
      NSView *view = views.firstObject;
      [views removeObjectAtIndex:0];
      if ([view isKindOfClass:[NSPopUpButton class]]) {
        [texts addObject:[((NSPopUpButton *)view).itemTitles componentsJoinedByString:@" / "]];
      } else if ([view isKindOfClass:[NSTextField class]]) {
        [texts addObject:((NSTextField *)view).stringValue];
      }
      [views addObjectsFromArray:view.subviews];
    }
  }
  [self log:[NSString stringWithFormat:@"snapshotModal texts: %@", [texts componentsJoinedByString:@" | "]]];
  if (accessory != nil) {
    NSBitmapImageRep *rep = [accessory bitmapImageRepForCachingDisplayInRect:accessory.bounds];
    [accessory cacheDisplayInRect:accessory.bounds toBitmapImageRep:rep];
    BOOL written = [[rep representationUsingType:NSBitmapImageFileTypePNG properties:@{}] writeToFile:path atomically:YES];
    [self log:[NSString stringWithFormat:@"snapshot %@ %@ (the panel's accessory view)", path, written ? @"written" : @"FAILED"]];
  } else {
    [self snapshot:modal to:path];
  }
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
