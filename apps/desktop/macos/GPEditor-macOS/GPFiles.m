// File access for the JS side: the open panel, reading a file the user picked or dropped,
// and files handed to the app by Finder ("Open With", dock drop) or the File ▸ Open… menu.
// AppDelegate.swift posts the notifications named below; this module forwards them as events.

#import <AppKit/AppKit.h>
#import <React/RCTBridgeModule.h>
#import <React/RCTEventEmitter.h>
#import <UniformTypeIdentifiers/UniformTypeIdentifiers.h>
#import <os/log.h>

static NSString *const kOpenCommandNotification = @"GPEditorOpenCommand";
static NSString *const kOpenURLsNotification = @"GPEditorOpenURLs";
static NSString *const kOpenRequestedEvent = @"openRequested";
static NSString *const kFileOpenedEvent = @"fileOpened";

/** Paths Finder handed over before JS started listening. */
static NSMutableArray<NSString *> *pendingPaths;

@interface GPFiles : RCTEventEmitter <RCTBridgeModule>
@end

// Runs at image load, before AppDelegate can receive Finder's open event. (RCT_EXPORT_MODULE owns +load.)
__attribute__((constructor)) static void GPFilesQueueOpenedURLs(void)
{
  pendingPaths = [NSMutableArray array];
  [[NSNotificationCenter defaultCenter] addObserverForName:kOpenURLsNotification
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
    [center addObserver:self selector:@selector(onOpenCommand:) name:kOpenCommandNotification object:nil];
    [center addObserver:self selector:@selector(onOpenURLs:) name:kOpenURLsNotification object:nil];
  }
  return self;
}

- (void)dealloc
{
  [[NSNotificationCenter defaultCenter] removeObserver:self];
}

- (NSArray<NSString *> *)supportedEvents
{
  return @[ kOpenRequestedEvent, kFileOpenedEvent ];
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

- (void)onOpenCommand:(NSNotification *)note
{
  if (hasListeners) {
    [self sendEventWithName:kOpenRequestedEvent body:@{}];
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
