// File ▸ Export Audio… for the JS side: JS renders the song's MIDI (gp-core's renderMidi, one file per track for
// stems) and asks where to save (GPFiles' save panel, or -chooseFolder: here for stems); this module renders each file
// offline through the playback graph and encodes it (GPAudioExporter) on a queue of its own, sending
// "audioExportProgress" events, until it is done or cancelled. The bank is the one playback uses (GPSoundBanks).
// QA: outside the App Sandbox, GPEDITOR_QA_AUDIO_DIR is the stems' folder, without the open panel.

#import <AppKit/AppKit.h>
#import <React/RCTBridgeModule.h>
#import <React/RCTEventEmitter.h>
#import <stdatomic.h>

#import "GPAudioExporter.h"
#import "GPSandbox.h"
#import "GPSoundBanks.h"

static NSString *const kProgressEvent = @"audioExportProgress";
/** Stems of a song with many tracks, at most. */
static const NSUInteger kMaxFiles = 128;
/** A song's length, at most (two hours). */
static const NSTimeInterval kMaxSeconds = 7200;
/** Progress events at most this often. */
static const NSTimeInterval kProgressInterval = 0.1;

/** One file to export, checked: its MIDI, the song's length, where it goes, the audio track under it. */
@interface GPAudioExportFile : NSObject
@property (nonatomic, strong) NSData *midi;
@property (nonatomic) NSTimeInterval seconds;
@property (nonatomic, strong) NSURL *url;
/** The audio track under it (GPAudioTrackPlayer checks the runs); nil without one. */
@property (nonatomic, strong, nullable) NSDictionary *audio;
@end

@implementation GPAudioExportFile
@end

@interface GPAudioExport : RCTEventEmitter <RCTBridgeModule>
@end

@implementation GPAudioExport {
  dispatch_queue_t _queue;
  dispatch_queue_t _workQueue;
  atomic_bool _isCancelled;
  atomic_bool _isRunning;
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
    _queue = dispatch_queue_create("com.drakejin.gpeditor.audio-export", DISPATCH_QUEUE_SERIAL);
    _workQueue = dispatch_queue_create("com.drakejin.gpeditor.audio-export.render", DISPATCH_QUEUE_SERIAL);
  }
  return self;
}

- (dispatch_queue_t)methodQueue
{
  return _queue;
}

- (NSArray<NSString *> *)supportedEvents
{
  return @[ kProgressEvent ];
}

- (void)startObserving
{
  _hasListeners = YES;
}

- (void)stopObserving
{
  _hasListeners = NO;
}

/** The files of a job from JS, each checked; nil when one is not a file this export can write. */
+ (nullable NSArray<GPAudioExportFile *> *)filesFrom:(id)value extension:(NSString *)extension
{
  if (![value isKindOfClass:[NSArray class]] || [value count] == 0 || [value count] > kMaxFiles) {
    return nil;
  }
  NSMutableArray<GPAudioExportFile *> *files = [NSMutableArray array];
  for (id item in (NSArray *)value) {
    NSDictionary *file = [item isKindOfClass:[NSDictionary class]] ? item : @{};
    NSString *path = [file[@"path"] isKindOfClass:[NSString class]] ? file[@"path"] : @"";
    NSData *midi = [file[@"midi"] isKindOfClass:[NSString class]] ? [[NSData alloc] initWithBase64EncodedString:file[@"midi"] options:0] : nil;
    double seconds = [file[@"seconds"] isKindOfClass:[NSNumber class]] ? [file[@"seconds"] doubleValue] : -1;
    BOOL isFile = path.isAbsolutePath && ![path.pathComponents containsObject:@".."] && [path.pathExtension caseInsensitiveCompare:extension] == NSOrderedSame &&
                  midi.length > 14 && memcmp(midi.bytes, "MThd", 4) == 0 && seconds > 0 && seconds <= kMaxSeconds;
    if (!isFile) {
      return nil;
    }
    GPAudioExportFile *checked = [GPAudioExportFile new];
    checked.midi = midi;
    checked.seconds = seconds;
    checked.url = [NSURL fileURLWithPath:path isDirectory:NO];
    checked.audio = [file[@"audio"] isKindOfClass:[NSDictionary class]] ? file[@"audio"] : nil;
    [files addObject:checked];
  }
  return files;
}

- (void)sendProgress:(NSUInteger)fileIndex of:(NSUInteger)fileCount fraction:(double)fraction
{
  if (_hasListeners) {
    [self sendEventWithName:kProgressEvent body:@{@"fileIndex" : @(fileIndex), @"fileCount" : @(fileCount), @"fraction" : @(fraction)}];
  }
}

/** Renders and writes the files one after the other; resolves what was written, or null when cancelled. */
- (void)runFiles:(NSArray<GPAudioExportFile *> *)files mix:(NSDictionary *)mix settings:(GPAudioFileSettings *)settings resolve:(RCTPromiseResolveBlock)resolve reject:(RCTPromiseRejectBlock)reject
{
  NSURL *bankURL = [GPSoundBanks selectedBankURL];
  NSMutableArray<NSDictionary *> *written = [NSMutableArray array];
  for (NSUInteger index = 0; index < files.count; index++) {
    GPAudioExportFile *file = files[index];
    __block CFAbsoluteTime lastSent = 0;
    NSError *error = nil;
    AVAudioFramePosition frames = [GPAudioExporter exportMidi:file.midi seconds:file.seconds mix:mix audioTrack:file.audio bankURL:bankURL settings:settings url:file.url progress:^BOOL(double fraction) {
      CFAbsoluteTime now = CFAbsoluteTimeGetCurrent();
      if (now - lastSent >= kProgressInterval) {
        lastSent = now;
        [self sendProgress:index of:files.count fraction:fraction];
      }
      return !atomic_load(&self->_isCancelled);
    } error:&error];
    if (frames < 0) {
      if (error.code == GPAudioExportCancelledCode) {
        resolve([NSNull null]);
      } else {
        reject(@"export_failed", error.localizedDescription ?: @"The audio file could not be written", error);
      }
      return;
    }
    [written addObject:@{@"name" : file.url.lastPathComponent, @"path" : file.url.path, @"seconds" : @(frames / settings.sampleRate)}];
  }
  [self sendProgress:files.count - 1 of:files.count fraction:1];
  resolve(@{@"files" : written});
}

/**
 * `{ files: [{ midi (base64), seconds, path, audio? }], mix: { tracks, master }, settings: { format, sampleRate, … } }` →
 * `{ files: [{ name, path, seconds }] }` once every file is written, or null when cancelled. One export at a time.
 */
RCT_EXPORT_METHOD(exportAudio : (NSDictionary *)job resolve : (RCTPromiseResolveBlock)resolve reject : (RCTPromiseRejectBlock)reject)
{
  NSError *error = nil;
  GPAudioFileSettings *settings = [job isKindOfClass:[NSDictionary class]] ? [GPAudioFileSettings settingsFrom:job[@"settings"] error:&error] : nil;
  NSArray<GPAudioExportFile *> *files = settings == nil ? nil : [GPAudioExport filesFrom:job[@"files"] extension:settings.format];
  NSDictionary *mix = [job[@"mix"] isKindOfClass:[NSDictionary class]] ? job[@"mix"] : @{};
  if (files == nil) {
    reject(@"bad_export", error.localizedDescription ?: @"Nothing to export", error);
    return;
  }
  bool isIdle = false;
  if (!atomic_compare_exchange_strong(&_isRunning, &isIdle, true)) {
    reject(@"busy", @"An audio export is already running", nil);
    return;
  }
  atomic_store(&_isCancelled, false);
  dispatch_async(_workQueue, ^{
    @autoreleasepool {
      [self runFiles:files mix:mix settings:settings resolve:resolve reject:reject];
    }
    atomic_store(&self->_isRunning, false);
  });
}

/** Stops the running export after the chunk being rendered; its promise resolves null and its file is removed. */
RCT_EXPORT_METHOD(cancelAudioExport : (RCTPromiseResolveBlock)resolve reject : (RCTPromiseRejectBlock)reject)
{
  atomic_store(&_isCancelled, true);
  resolve(nil);
}

/** Plain file names: no folders, no hidden files (they come from JS). */
+ (BOOL)arePlainNames:(id)names
{
  if (![names isKindOfClass:[NSArray class]] || [names count] == 0 || [names count] > kMaxFiles) {
    return NO;
  }
  for (id name in (NSArray *)names) {
    if (![name isKindOfClass:[NSString class]] || [name length] == 0 || [name hasPrefix:@"."] || [name containsString:@"/"] || [name containsString:@":"]) {
      return NO;
    }
  }
  return YES;
}

/** Asks before overwriting files already in the chosen folder (an open panel does not ask). */
+ (BOOL)mayReplaceIn:(NSURL *)folder names:(NSArray<NSString *> *)names
{
  NSUInteger existing = 0;
  for (NSString *name in names) {
    existing += [[NSFileManager defaultManager] fileExistsAtPath:[folder URLByAppendingPathComponent:name].path] ? 1 : 0;
  }
  if (existing == 0) {
    return YES;
  }
  NSAlert *alert = [NSAlert new];
  alert.messageText = existing == 1 ? [NSString stringWithFormat:@"Replace a file in “%@”?", folder.lastPathComponent]
                                    : [NSString stringWithFormat:@"Replace %lu files in “%@”?", (unsigned long)existing, folder.lastPathComponent];
  alert.informativeText = @"Audio files with these names are already in the folder. Replacing them overwrites them.";
  [alert addButtonWithTitle:@"Replace"];
  [alert addButtonWithTitle:@"Cancel"];
  return [alert runModal] == NSAlertFirstButtonReturn;
}

/**
 * The folder for one file per track (the sandbox lets the app write only what the user chose, so a folder, as the PNG
 * export does): `{ folder, folderName }`, or null when cancelled.
 */
RCT_EXPORT_METHOD(chooseFolder : (NSArray *)fileNames resolve : (RCTPromiseResolveBlock)resolve reject : (RCTPromiseRejectBlock)reject)
{
  if (![GPAudioExport arePlainNames:fileNames]) {
    reject(@"bad_names", @"Nothing to export", nil);
    return;
  }
  dispatch_async(dispatch_get_main_queue(), ^{
    NSString *qaFolder = [NSProcessInfo processInfo].environment[@"GPEDITOR_QA_AUDIO_DIR"];
    NSURL *folder = nil;
    if (qaFolder.length > 0 && !GPIsSandboxed()) {
      folder = [NSURL fileURLWithPath:qaFolder isDirectory:YES];
    } else {
      NSOpenPanel *panel = [NSOpenPanel openPanel];
      panel.canChooseFiles = NO;
      panel.canChooseDirectories = YES;
      panel.canCreateDirectories = YES;
      panel.allowsMultipleSelection = NO;
      panel.prompt = @"Export";
      panel.message = [NSString stringWithFormat:@"Choose a folder for the %lu audio files, one per track: %@ … %@", (unsigned long)fileNames.count, fileNames.firstObject, fileNames.lastObject];
      BOOL isChosen = [panel runModal] == NSModalResponseOK && panel.URL != nil && [GPAudioExport mayReplaceIn:panel.URL names:fileNames];
      folder = isChosen ? panel.URL : nil;
    }
    resolve(folder == nil ? [NSNull null] : @{@"folder" : folder.path, @"folderName" : folder.lastPathComponent});
  });
}

@end
