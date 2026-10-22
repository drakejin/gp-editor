// Copied beats on the system pasteboard: the beats as JSON under the app's own type, so a paste can tell them from
// any other text, and a readable summary as plain text for other apps. JS checks the JSON before using it
// (parseBeatFragment): anything on the pasteboard is untrusted.

#import <AppKit/AppKit.h>
#import <React/RCTBridgeModule.h>

static NSPasteboardType const kBeatsType = @"com.drakejin.gpeditor.beats";

@interface GPClipboard : NSObject <RCTBridgeModule>
@end

@implementation GPClipboard

RCT_EXPORT_MODULE();

+ (BOOL)requiresMainQueueSetup
{
  return NO;
}

/** NSPasteboard is used from the main thread, as AppKit expects. */
- (dispatch_queue_t)methodQueue
{
  return dispatch_get_main_queue();
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
    reject(@"clipboard", @"The beats could not be put on the clipboard.", nil);
  }
}

RCT_EXPORT_METHOD(readBeats : (RCTPromiseResolveBlock)resolve reject : (RCTPromiseRejectBlock)reject)
{
  NSString *json = [[NSPasteboard generalPasteboard] stringForType:kBeatsType];
  resolve(json ?: (id)[NSNull null]);
}

@end
