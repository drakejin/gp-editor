// The audio track's files for the JS side (GPAudioAssets): a .gp file's audio handed over once per document
// (`loadData`), a file picked in an open panel (`chooseFile`, Track ▸ Add Audio Track…, asking first when it replaces
// one), the bytes back for a save (`data`), the waveform (`peaks`). Track ▸ Add Audio Track… (GPEditorNotifications.h)
// is forwarded to JS as "addAudioTrackRequested", the Track menu's track commands (Add Track…, Duplicate, Delete, Move Up /
// Down) as "trackCommandRequested" with the command. Methods run on a serial queue of their own; the panels on the main
// queue. QA: outside the App Sandbox, GPEDITOR_QA_AUDIO_PATH=<file> is picked without the panel or the question.

#import <AppKit/AppKit.h>
#import <React/RCTBridgeModule.h>
#import <React/RCTEventEmitter.h>
#import <UniformTypeIdentifiers/UniformTypeIdentifiers.h>

#import "GPAudioAssets.h"
#import "GPEditorNotifications.h"
#import "GPSandbox.h"
#import "GPAppStrings.h"

static NSString *const kAddAudioTrackRequestedEvent = @"addAudioTrackRequested";
static NSString *const kTrackCommandRequestedEvent = @"trackCommandRequested";
static NSString *const kQAAudioPathVariable = @"GPEDITOR_QA_AUDIO_PATH";

@interface GPAudioTrack : RCTEventEmitter <RCTBridgeModule>
@end

@implementation GPAudioTrack {
  dispatch_queue_t _queue;
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
    _queue = dispatch_queue_create("com.drakejin.gpeditor.audio-track", DISPATCH_QUEUE_SERIAL);
    static dispatch_once_t once;
    dispatch_once(&once, ^{
      // The last run's files: nothing refers to them any more.
      [GPAudioAssets removeAll];
    });
    [[NSNotificationCenter defaultCenter] addObserver:self selector:@selector(onAddAudioTrackCommand:) name:GPEditorAddAudioTrackCommandNotification object:nil];
    [[NSNotificationCenter defaultCenter] addObserver:self selector:@selector(onTrackCommand:) name:GPEditorTrackCommandNotification object:nil];
  }
  return self;
}

- (void)dealloc
{
  [[NSNotificationCenter defaultCenter] removeObserver:self];
}

- (dispatch_queue_t)methodQueue
{
  return _queue;
}

- (NSArray<NSString *> *)supportedEvents
{
  return @[ kAddAudioTrackRequestedEvent, kTrackCommandRequestedEvent ];
}

- (void)startObserving
{
  _hasListeners = YES;
}

- (void)stopObserving
{
  _hasListeners = NO;
}

- (void)onAddAudioTrackCommand:(NSNotification *)note
{
  if (_hasListeners) {
    [self sendEventWithName:kAddAudioTrackRequestedEvent body:@{}];
  }
}

- (void)onTrackCommand:(NSNotification *)note
{
  NSString *command = [note.object isKindOfClass:[NSString class]] ? note.object : nil;
  if (_hasListeners && command != nil) {
    [self sendEventWithName:kTrackCommandRequestedEvent body:@{ @"command" : command }];
  }
}

static void RejectWith(RCTPromiseRejectBlock reject, NSString *code, NSError *error, NSString *fallback)
{
  reject(code, error.localizedDescription ?: fallback, error);
}

/** Keeps a .gp file's audio (base64, sent once per document): resolves `{ assetId, durationSeconds, … }`. */
RCT_EXPORT_METHOD(loadData : (NSString *)base64 extension : (NSString *)extension resolve : (RCTPromiseResolveBlock)resolve reject : (RCTPromiseRejectBlock)reject)
{
  NSData *data = [[NSData alloc] initWithBase64EncodedString:base64 options:0];
  if (data == nil) {
    reject(@"bad_audio", GPLocalizedString(@"The audio data is not valid base64"), nil);
    return;
  }
  NSError *error = nil;
  NSString *assetId = [GPAudioAssets storeData:data extension:extension error:&error];
  NSDictionary *info = assetId == nil ? nil : [GPAudioAssets infoForAssetId:assetId];
  if (info == nil) {
    RejectWith(reject, @"audio_unreadable", error, GPLocalizedString(@"This audio file cannot be played"));
    return;
  }
  resolve(info);
}

/** The bytes of a kept file as base64 (a .gp save embeds them). */
RCT_EXPORT_METHOD(data : (NSString *)assetId resolve : (RCTPromiseResolveBlock)resolve reject : (RCTPromiseRejectBlock)reject)
{
  NSURL *url = [GPAudioAssets URLForAssetId:assetId];
  NSError *error = nil;
  NSData *data = url == nil ? nil : [NSData dataWithContentsOfURL:url options:NSDataReadingMappedIfSafe error:&error];
  if (data == nil) {
    RejectWith(reject, @"no_audio", error, GPLocalizedString(@"The audio track's file is not loaded"));
    return;
  }
  resolve([data base64EncodedStringWithOptions:0]);
}

/** The waveform of a kept file: `{ bucketsPerSecond, durationSeconds, peaks }` (GPAudioAssets). */
RCT_EXPORT_METHOD(peaks : (NSString *)assetId resolve : (RCTPromiseResolveBlock)resolve reject : (RCTPromiseRejectBlock)reject)
{
  NSError *error = nil;
  NSDictionary *peaks = [GPAudioAssets peaksForAssetId:assetId error:&error];
  if (peaks == nil) {
    RejectWith(reject, @"no_peaks", error, GPLocalizedString(@"The audio track's waveform could not be read"));
    return;
  }
  resolve(peaks);
}

/**
 * Track ▸ Add Audio Track…: asks first when the song has one (`isReplacing`), then an open panel for an audio file,
 * kept by GPAudioAssets. Resolves `{ assetId, fileName, extension, durationSeconds, … }`, or null when cancelled.
 */
RCT_EXPORT_METHOD(chooseFile : (BOOL)isReplacing resolve : (RCTPromiseResolveBlock)resolve reject : (RCTPromiseRejectBlock)reject)
{
  dispatch_async(dispatch_get_main_queue(), ^{
    NSURL *url = [GPAudioTrack pickFileReplacing:isReplacing];
    if (url == nil) {
      resolve([NSNull null]);
      return;
    }
    dispatch_async(self->_queue, ^{
      [GPAudioTrack keepFileAtURL:url resolve:resolve reject:reject];
    });
  });
}

+ (void)keepFileAtURL:(NSURL *)url resolve:(RCTPromiseResolveBlock)resolve reject:(RCTPromiseRejectBlock)reject
{
  NSError *error = nil;
  NSString *assetId = [GPAudioAssets storeFileAtURL:url error:&error];
  NSDictionary *info = assetId == nil ? nil : [GPAudioAssets infoForAssetId:assetId];
  if (info == nil) {
    RejectWith(reject, @"audio_unreadable", error, GPLocalizedString(@"This audio file cannot be played"));
    return;
  }
  NSMutableDictionary *result = [info mutableCopy];
  result[@"fileName"] = url.lastPathComponent;
  result[@"extension"] = url.pathExtension.lowercaseString;
  resolve(result);
}

/** The audio file to add: the QA's, or the one picked after the question; nil when cancelled. Main queue. */
+ (nullable NSURL *)pickFileReplacing:(BOOL)isReplacing
{
  NSString *qaPath = [NSProcessInfo processInfo].environment[kQAAudioPathVariable];
  if (qaPath.length > 0 && !GPIsSandboxed()) {
    return [NSURL fileURLWithPath:qaPath];
  }
  if (isReplacing && ![self confirmReplace]) {
    return nil;
  }
  NSOpenPanel *panel = [NSOpenPanel openPanel];
  panel.canChooseFiles = YES;
  panel.canChooseDirectories = NO;
  panel.allowsMultipleSelection = NO;
  NSMutableArray<UTType *> *types = [NSMutableArray arrayWithObject:UTTypeAudio];
  for (NSString *extension in @[ @"ogg", @"oga", @"opus", @"flac", @"caf" ]) {
    UTType *type = [UTType typeWithFilenameExtension:extension];
    if (type != nil) {
      [types addObject:type];
    }
  }
  panel.allowedContentTypes = types;
  panel.message = GPLocalizedString(@"Choose a recording to play with the score (WAV, AIFF, MP3, AAC/M4A, FLAC, Ogg, CAF)");
  return [panel runModal] == NSModalResponseOK ? panel.URL : nil;
}

+ (BOOL)confirmReplace
{
  NSAlert *alert = [NSAlert new];
  alert.messageText = GPLocalizedString(@"Replace the audio track?");
  alert.informativeText = GPLocalizedString(@"The song keeps one audio track: the new file takes its place, and its sync points are removed. Undo brings the old one back.");
  [alert addButtonWithTitle:GPLocalizedString(@"Replace")];
  [alert addButtonWithTitle:GPLocalizedString(@"Cancel")];
  return [alert runModal] == NSAlertFirstButtonReturn;
}

@end
