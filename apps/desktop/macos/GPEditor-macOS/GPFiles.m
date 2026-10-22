// File access for the JS side: the open and save panels, reading a file the user picked or dropped, files handed to
// the app by Finder ("Open With", dock drop), and the File menu (New, Import PDF…, Export PDF…, Print…, Open…, Save, Save
// As…) and Help ▸ Keyboard Shortcuts.
// AppDelegate.swift posts the notifications in GPEditorNotifications.h; this module forwards them as events.

#import <AppKit/AppKit.h>
#import <React/RCTBridgeModule.h>
#import <React/RCTEventEmitter.h>
#import <UniformTypeIdentifiers/UniformTypeIdentifiers.h>
#import <os/log.h>

#import "GPEditorNotifications.h"

static NSString *const kNewRequestedEvent = @"newRequested";
static NSString *const kImportPdfRequestedEvent = @"importPdfRequested";
static NSString *const kExportRequestedEvent = @"exportRequested";
static NSString *const kPrintRequestedEvent = @"printRequested";
static NSString *const kHelpRequestedEvent = @"helpRequested";
static NSString *const kOpenRequestedEvent = @"openRequested";
static NSString *const kFileOpenedEvent = @"fileOpened";
static NSString *const kSaveRequestedEvent = @"saveRequested";

/** Paths Finder handed over before JS started listening. */
static NSMutableArray<NSString *> *pendingPaths;

@interface GPFiles : RCTEventEmitter <RCTBridgeModule>
@end

// Runs at image load, before AppDelegate can receive Finder's open event. (RCT_EXPORT_MODULE owns +load.)
__attribute__((constructor)) static void GPFilesQueueOpenedURLs(void)
{
  pendingPaths = [NSMutableArray array];
  [[NSNotificationCenter defaultCenter] addObserverForName:GPEditorOpenURLsNotification
                                                    object:nil
                                                     queue:[NSOperationQueue mainQueue]
                                                usingBlock:^(NSNotification *note) {
                                                  for (NSURL *url in note.object) {
                                                    if (url.isFileURL) {
                                                      [pendingPaths addObject:url.path];
                                                    }
                                                  }
                                                }];
}

@implementation GPFiles {
  BOOL hasListeners;
}

RCT_EXPORT_MODULE();

+ (BOOL)requiresMainQueueSetup
{
  return YES;
}

- (instancetype)init
{
  if (self = [super init]) {
    NSNotificationCenter *center = [NSNotificationCenter defaultCenter];
    [center addObserver:self selector:@selector(onNewCommand:) name:GPEditorNewCommandNotification object:nil];
    [center addObserver:self selector:@selector(onOpenCommand:) name:GPEditorOpenCommandNotification object:nil];
    [center addObserver:self selector:@selector(onImportPdfCommand:) name:GPEditorImportPdfCommandNotification object:nil];
    [center addObserver:self selector:@selector(onExportCommand:) name:GPEditorExportCommandNotification object:nil];
    [center addObserver:self selector:@selector(onPrintCommand:) name:GPEditorPrintCommandNotification object:nil];
    [center addObserver:self selector:@selector(onHelpCommand:) name:GPEditorHelpCommandNotification object:nil];
    [center addObserver:self selector:@selector(onOpenURLs:) name:GPEditorOpenURLsNotification object:nil];
    [center addObserver:self selector:@selector(onSaveCommand:) name:GPEditorSaveCommandNotification object:nil];
    [center addObserver:self selector:@selector(onSaveAsCommand:) name:GPEditorSaveAsCommandNotification object:nil];
  }
  return self;
}

- (void)dealloc
{
  [[NSNotificationCenter defaultCenter] removeObserver:self];
}

- (NSArray<NSString *> *)supportedEvents
{
  return @[ kNewRequestedEvent, kImportPdfRequestedEvent, kExportRequestedEvent, kPrintRequestedEvent, kHelpRequestedEvent, kOpenRequestedEvent, kFileOpenedEvent, kSaveRequestedEvent ];
}

- (void)startObserving
{
  hasListeners = YES;
  [self flushPendingPaths];
}

- (void)stopObserving
{
  hasListeners = NO;
}

- (void)onNewCommand:(NSNotification *)note
{
  // The JS side checks the mode; an unknown or missing one falls back to score + tab.
  NSString *mode = [note.object isKindOfClass:[NSString class]] ? note.object : @"";
  if (hasListeners) {
    [self sendEventWithName:kNewRequestedEvent body:@{@"mode" : mode}];
  }
}

- (void)onImportPdfCommand:(NSNotification *)note
{
  if (hasListeners) {
    [self sendEventWithName:kImportPdfRequestedEvent body:@{}];
  }
}

- (void)onExportCommand:(NSNotification *)note
{
  if (hasListeners) {
    [self sendEventWithName:kExportRequestedEvent body:@{}];
  }
}

- (void)onPrintCommand:(NSNotification *)note
{
  if (hasListeners) {
    [self sendEventWithName:kPrintRequestedEvent body:@{}];
  }
}

- (void)onHelpCommand:(NSNotification *)note
{
  if (hasListeners) {
    [self sendEventWithName:kHelpRequestedEvent body:@{}];
  }
}

- (void)onOpenCommand:(NSNotification *)note
{
  if (hasListeners) {
    [self sendEventWithName:kOpenRequestedEvent body:@{}];
  }
}

- (void)onSaveCommand:(NSNotification *)note
{
  if (hasListeners) {
    [self sendEventWithName:kSaveRequestedEvent body:@{@"saveAs" : @NO}];
  }
}

- (void)onSaveAsCommand:(NSNotification *)note
{
  if (hasListeners) {
    [self sendEventWithName:kSaveRequestedEvent body:@{@"saveAs" : @YES}];
  }
}

- (void)onOpenURLs:(NSNotification *)note
{
  // GPFilesQueueOpenedURLs already queued the paths; deliver them now if JS is listening.
  dispatch_async(dispatch_get_main_queue(), ^{
    [self flushPendingPaths];
  });
}

- (void)flushPendingPaths
{
  if (!hasListeners) {
    return;
  }
  NSArray<NSString *> *paths = [pendingPaths copy];
  [pendingPaths removeAllObjects];
  for (NSString *path in paths) {
    [self sendEventWithName:kFileOpenedEvent body:@{@"path" : path}];
  }
}

+ (NSArray<UTType *> *)guitarProTypes
{
  NSMutableArray<UTType *> *types = [NSMutableArray array];
  for (NSString *ext in @[ @"gp", @"gpx", @"gp5", @"gp4", @"gp3", @"gtp" ]) {
    UTType *type = [UTType typeWithFilenameExtension:ext];
    if (type != nil) {
      [types addObject:type];
    }
  }
  return types;
}

+ (NSDictionary *)payloadForPath:(NSString *)path error:(NSError **)error
{
  NSData *data = [NSData dataWithContentsOfFile:path options:0 error:error];
  if (data == nil) {
    return nil;
  }
  return @{
    @"name" : path.lastPathComponent,
    @"path" : path,
    @"base64" : [data base64EncodedStringWithOptions:0],
  };
}

RCT_EXPORT_METHOD(showOpenDialog : (RCTPromiseResolveBlock)resolve reject : (RCTPromiseRejectBlock)reject)
{
  dispatch_async(dispatch_get_main_queue(), ^{
    NSOpenPanel *panel = [NSOpenPanel openPanel];
    panel.canChooseFiles = YES;
    panel.canChooseDirectories = NO;
    panel.allowsMultipleSelection = NO;
    panel.allowedContentTypes = [GPFiles guitarProTypes];
    panel.message = @"Open a Guitar Pro file (.gp, .gpx, .gp5, .gp4, .gp3, .gtp)";
    if ([panel runModal] != NSModalResponseOK || panel.URL == nil) {
      resolve([NSNull null]);
      return;
    }
    NSError *error = nil;
    NSDictionary *payload = [GPFiles payloadForPath:panel.URL.path error:&error];
    if (payload == nil) {
      reject(@"read_failed", error.localizedDescription ?: @"Could not read the file", error);
      return;
    }
    resolve(payload);
  });
}

RCT_EXPORT_METHOD(readFile : (NSString *)pathOrURL resolve : (RCTPromiseResolveBlock)resolve reject : (RCTPromiseRejectBlock)reject)
{
  NSURL *url = [NSURL URLWithString:pathOrURL];
  NSString *path = (url != nil && url.isFileURL) ? url.path : pathOrURL;
  NSError *error = nil;
  NSDictionary *payload = [GPFiles payloadForPath:path error:&error];
  if (payload == nil) {
    reject(@"read_failed", error.localizedDescription ?: @"Could not read the file", error);
    return;
  }
  resolve(payload);
}

/** Writes base64 bytes to a path; the result names the file like an opened one. */
+ (NSDictionary *)writeBase64:(NSString *)base64 toPath:(NSString *)path error:(NSError **)error
{
  NSData *data = [[NSData alloc] initWithBase64EncodedString:base64 options:0];
  if (data == nil) {
    if (error != NULL) {
      *error = [NSError errorWithDomain:@"GPFiles" code:1 userInfo:@{NSLocalizedDescriptionKey : @"The file data is not valid base64"}];
    }
    return nil;
  }
  if (![data writeToFile:path options:NSDataWritingAtomic error:error]) {
    return nil;
  }
  return @{@"name" : path.lastPathComponent, @"path" : path};
}

RCT_EXPORT_METHOD(showSaveDialog : (NSString *)base64 suggestedName : (NSString *)suggestedName resolve : (RCTPromiseResolveBlock)resolve reject : (RCTPromiseRejectBlock)reject)
{
  dispatch_async(dispatch_get_main_queue(), ^{
    NSSavePanel *panel = [NSSavePanel savePanel];
    UTType *gp5 = [UTType typeWithFilenameExtension:@"gp5"];
    if (gp5 != nil) {
      panel.allowedContentTypes = @[ gp5 ];
    }
    panel.nameFieldStringValue = suggestedName;
    panel.message = @"Save as a Guitar Pro 5 file (.gp5)";
    if ([panel runModal] != NSModalResponseOK || panel.URL == nil) {
      resolve([NSNull null]);
      return;
    }
    NSError *error = nil;
    NSDictionary *saved = [GPFiles writeBase64:base64 toPath:panel.URL.path error:&error];
    if (saved == nil) {
      reject(@"write_failed", error.localizedDescription ?: @"Could not write the file", error);
      return;
    }
    resolve(saved);
  });
}

RCT_EXPORT_METHOD(writeFile : (NSString *)path base64 : (NSString *)base64 resolve : (RCTPromiseResolveBlock)resolve reject : (RCTPromiseRejectBlock)reject)
{
  NSError *error = nil;
  NSDictionary *saved = [GPFiles writeBase64:base64 toPath:path error:&error];
  if (saved == nil) {
    reject(@"write_failed", error.localizedDescription ?: @"Could not write the file", error);
    return;
  }
  resolve(saved);
}

RCT_EXPORT_METHOD(setDocumentTitle : (NSString *)title)
{
  dispatch_async(dispatch_get_main_queue(), ^{
    NSWindow *window = NSApp.mainWindow ?: NSApp.windows.firstObject;
    window.title = title;
    // One line per opened document, so a launch with `open -a` can be checked from `log show`.
    os_log(OS_LOG_DEFAULT, "GP Editor window title: %{public}@", title);
  });
}

@end
