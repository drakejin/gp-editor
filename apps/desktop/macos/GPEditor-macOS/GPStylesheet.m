// The stylesheet's native side for JS (src/native/stylesheet.ts): File ▸ Stylesheet… (F7), View ▸ Design Mode and
// View ▸ Reset Positions (GPEditorLayoutCommandNotification, posted by AppDelegate.swift) forwarded as
// "layoutCommandRequested" with the command, and the font families installed on the Mac for the Texts & Styles tab.

#import <AppKit/AppKit.h>
#import <React/RCTBridgeModule.h>
#import <React/RCTEventEmitter.h>

#import "GPEditorNotifications.h"

static NSString *const kLayoutCommandRequestedEvent = @"layoutCommandRequested";

@interface GPStylesheet : RCTEventEmitter <RCTBridgeModule>
@end

@implementation GPStylesheet {
  BOOL _hasListeners;
}

RCT_EXPORT_MODULE();

+ (BOOL)requiresMainQueueSetup
{
  return NO;
}

- (instancetype)init
{
  if ((self = [super init])) {
    [[NSNotificationCenter defaultCenter] addObserver:self selector:@selector(onLayoutCommand:) name:GPEditorLayoutCommandNotification object:nil];
  }
  return self;
}

- (void)dealloc
{
  [[NSNotificationCenter defaultCenter] removeObserver:self];
}

- (NSArray<NSString *> *)supportedEvents
{
  return @[ kLayoutCommandRequestedEvent ];
}

- (void)startObserving
{
  _hasListeners = YES;
}

- (void)stopObserving
{
  _hasListeners = NO;
}

- (void)onLayoutCommand:(NSNotification *)note
{
  NSString *command = [note.object isKindOfClass:[NSString class]] ? note.object : nil;
  if (_hasListeners && command != nil) {
    [self sendEventWithName:kLayoutCommandRequestedEvent body:@{ @"command" : command }];
  }
}

/** The installed font families (NSFontManager), sorted as Finder sorts names; hidden system families left out. */
RCT_EXPORT_METHOD(fontFamilies : (RCTPromiseResolveBlock)resolve reject : (RCTPromiseRejectBlock)reject)
{
  NSMutableArray<NSString *> *families = [NSMutableArray array];
  for (NSString *family in NSFontManager.sharedFontManager.availableFontFamilies) {
    if (![family hasPrefix:@"."]) {
      [families addObject:family];
    }
  }
  [families sortUsingSelector:@selector(localizedStandardCompare:)];
  resolve(families);
}

@end
