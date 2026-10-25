// Copied beats on the system pasteboard: the beats as JSON under the app's own type, so a paste can tell them from
// any other text, and a readable summary as plain text for other apps. JS checks the JSON before using it
// (parseBeatFragment): anything on the pasteboard is untrusted.
// Also Edit ▸ Cut / Copy / Paste for the score (EditMenu.swift: the menu items and ⌘X / ⌘C / ⌘V outside text fields),
// forwarded to JS as "clipboardCommandRequested" { command: "cut" | "copy" | "paste" }.

#import <AppKit/AppKit.h>
#import <React/RCTBridgeModule.h>
#import <React/RCTEventEmitter.h>

#import "GPAppStrings.h"
#import "GPEditorNotifications.h"

static NSPasteboardType const kBeatsType = @"com.drakejin.gpeditor.beats";
static NSString *const kClipboardCommandRequestedEvent = @"clipboardCommandRequested";

@interface GPClipboard : RCTEventEmitter <RCTBridgeModule>
@end

@implementation GPClipboard {
  BOOL hasListeners;
}

RCT_EXPORT_MODULE();

+ (BOOL)requiresMainQueueSetup
{
  return NO;
}

- (instancetype)init
{
  if (self = [super init]) {
    [[NSNotificationCenter defaultCenter] addObserver:self
                                             selector:@selector(onClipboardCommand:)
                                                 name:GPEditorClipboardCommandNotification
                                               object:nil];
  }
  return self;
}

- (void)dealloc
{
  [[NSNotificationCenter defaultCenter] removeObserver:self];
}

/** NSPasteboard is used from the main thread, as AppKit expects. */
- (dispatch_queue_t)methodQueue
{
  return dispatch_get_main_queue();
}

- (NSArray<NSString *> *)supportedEvents
{
  return @[ kClipboardCommandRequestedEvent ];
}

- (void)startObserving
{
  hasListeners = YES;
}

- (void)stopObserving
{
  hasListeners = NO;
}

- (void)onClipboardCommand:(NSNotification *)note
{
  if (hasListeners && [note.object isKindOfClass:[NSString class]]) {
    [self sendEventWithName:kClipboardCommandRequestedEvent body:@{@"command" : note.object}];
  }
}

RCT_EXPORT_METHOD(writeBeats : (NSString *)json summary : (NSString *)summary resolve : (RCTPromiseResolveBlock)resolve reject : (RCTPromiseRejectBlock)reject)
{
  NSPasteboard *pasteboard = [NSPasteboard generalPasteboard];
  [pasteboard clearContents];
  [pasteboard declareTypes:@[ kBeatsType, NSPasteboardTypeString ] owner:nil];
  BOOL isWritten = [pasteboard setString:json forType:kBeatsType] && [pasteboard setString:summary forType:NSPasteboardTypeString];
  if (isWritten) {
    resolve(nil);
  } else {
    reject(@"clipboard", GPLocalizedString(@"The beats could not be put on the clipboard."), nil);
  }
}

RCT_EXPORT_METHOD(readBeats : (RCTPromiseResolveBlock)resolve reject : (RCTPromiseRejectBlock)reject)
{
  NSString *json = [[NSPasteboard generalPasteboard] stringForType:kBeatsType];
  resolve(json ?: (id)[NSNull null]);
}

@end
