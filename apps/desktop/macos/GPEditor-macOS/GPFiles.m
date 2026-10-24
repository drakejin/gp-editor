// File access for the JS side: the open and save panels, reading a file the user picked or dropped, files handed to
// the app by Finder ("Open With", dock drop), and the File menu (New, Import PDF…, Export PDF…, Print…, Open…, Save, Save
// As…, Close Tab, Next Tab, Previous Tab), Edit ▸ AI Wizard ▸ Song Writer… and Help ▸ Keyboard Shortcuts.
// Also Edit ▸ Undo / Redo (the score's, with JS's undo state back: setUndoState), Edit ▸ Lyrics…, Tools ▸ Scales… and View ▸ Focus / Unfocus.
// AppDelegate.swift posts the notifications in GPEditorNotifications.h; this module forwards them as events.
// File ▸ Export MIDI… and Export ASCII Tab… come here too; their files, like Save's, go through showSavePanel, then
// writeFile / writeTextFile. So do Export MusicXML… and Export Compressed MusicXML…, and Open reads MusicXML files.
// File ▸ Export Audio… comes here as an event too; its single file's place is chosen with showSavePanel.
// Tools ▸ Transpose… and Tools ▸ Command Palette… (⇧⌘P) come here as events too.
// So do View ▸ Multitrack (F3), Previous Track and Next Track.

#import <AppKit/AppKit.h>
#import <React/RCTBridgeModule.h>
#import <React/RCTEventEmitter.h>
#import <UniformTypeIdentifiers/UniformTypeIdentifiers.h>
#import <os/log.h>

#import "GPEditorNotifications.h"
#import "GPRecentFiles.h"
#import "GPSandbox.h"
#import "GPAppStrings.h"

static NSString *const kNewRequestedEvent = @"newRequested";
static NSString *const kImportPdfRequestedEvent = @"importPdfRequested";
static NSString *const kExportRequestedEvent = @"exportRequested";
static NSString *const kExportPngRequestedEvent = @"exportPngRequested";
static NSString *const kPrintRequestedEvent = @"printRequested";
static NSString *const kHelpRequestedEvent = @"helpRequested";
static NSString *const kFocusRequestedEvent = @"focusRequested";
static NSString *const kUndoRequestedEvent = @"undoRequested";
static NSString *const kRedoRequestedEvent = @"redoRequested";
static NSString *const kSongWriterRequestedEvent = @"songWriterRequested";
static NSString *const kLyricsRequestedEvent = @"lyricsRequested";
static NSString *const kScalesRequestedEvent = @"scalesRequested";
static NSString *const kOpenRequestedEvent = @"openRequested";
static NSString *const kFileOpenedEvent = @"fileOpened";
static NSString *const kSaveRequestedEvent = @"saveRequested";
static NSString *const kCloseTabRequestedEvent = @"closeTabRequested";
static NSString *const kNextTabRequestedEvent = @"nextTabRequested";
static NSString *const kPreviousTabRequestedEvent = @"previousTabRequested";
static NSString *const kExportMidiRequestedEvent = @"exportMidiRequested";
static NSString *const kExportAsciiTabRequestedEvent = @"exportAsciiTabRequested";
static NSString *const kExportMusicXmlRequestedEvent = @"exportMusicXmlRequested";
static NSString *const kExportCompressedMusicXmlRequestedEvent = @"exportCompressedMusicXmlRequested";
static NSString *const kExportAudioRequestedEvent = @"exportAudioRequested";
static NSString *const kTransposeRequestedEvent = @"transposeRequested";
static NSString *const kCommandPaletteRequestedEvent = @"commandPaletteRequested";
static NSString *const kMultitrackRequestedEvent = @"multitrackRequested";
static NSString *const kPreviousTrackRequestedEvent = @"previousTrackRequested";
static NSString *const kNextTrackRequestedEvent = @"nextTrackRequested";

/** Paths Finder handed over before JS started listening. */
static NSMutableArray<NSString *> *pendingPaths;

@interface GPFiles : RCTEventEmitter <RCTBridgeModule>
@end

/**
 * The save panel's formats: the selected one gives the file name its extension (the panel's allowed type) and the
 * panel's message says what it keeps and leaves out. With more than one, a "Format" popup under the panel chooses; the
 * chooser is the popup's target, so it must live as long as the panel runs.
 */
@interface GPSaveFormatChooser : NSObject
@property(nonatomic, copy, readonly) NSArray<NSDictionary *> *formats;
@property(nonatomic, readonly) NSDictionary *selectedFormat;
- (instancetype)initWithFormats:(NSArray<NSDictionary *> *)formats selected:(NSUInteger)selected;
- (void)selectFormatWithExtension:(NSString *)extension;
- (void)attachToPanel:(NSSavePanel *)panel;
@end

@implementation GPSaveFormatChooser {
  NSUInteger selectedIndex;
  __weak NSSavePanel *panel;
}

- (instancetype)initWithFormats:(NSArray<NSDictionary *> *)formats selected:(NSUInteger)selected
{
  if (self = [super init]) {
    _formats = [formats copy];
    selectedIndex = MIN(selected, formats.count - 1);
  }
  return self;
}

- (NSDictionary *)selectedFormat
{
  return self.formats[selectedIndex];
}

/** Selects the format with this extension (any case); the selection stays when no format has it. */
- (void)selectFormatWithExtension:(NSString *)extension
{
  NSUInteger index = [self.formats indexOfObjectPassingTest:^BOOL(NSDictionary *format, NSUInteger i, BOOL *stop) {
    return [format[@"extension"] caseInsensitiveCompare:extension] == NSOrderedSame;
  }];
  if (index != NSNotFound) {
    selectedIndex = index;
  }
}

- (void)attachToPanel:(NSSavePanel *)savePanel
{
  panel = savePanel;
  if (self.formats.count > 1) {
    savePanel.accessoryView = [self accessoryView];
  }
  [self applySelection];
}

/** "Format: [Guitar Pro 5 (.gp5)]". */
- (NSView *)accessoryView
{
  NSPopUpButton *popup = [[NSPopUpButton alloc] initWithFrame:NSZeroRect pullsDown:NO];
  for (NSDictionary *format in self.formats) {
    [popup addItemWithTitle:format[@"label"]];
  }
  [popup selectItemAtIndex:(NSInteger)selectedIndex];
  popup.target = self;
  popup.action = @selector(formatChosen:);
  NSStackView *row = [NSStackView stackViewWithViews:@[ [NSTextField labelWithString:GPLocalizedString(@"Format:")], popup ]];
  row.edgeInsets = NSEdgeInsetsMake(12, 20, 12, 20);
  [row setFrameSize:row.fittingSize];
  return row;
}

- (void)formatChosen:(NSPopUpButton *)popup
{
  selectedIndex = (NSUInteger)MAX(0, popup.indexOfSelectedItem);
  [self applySelection];
}

/**
 * The panel saves the selected format's type and shows its note. A name ending in another offered format's extension
 * gets this one's: the panel (remote, out of process) does not always swap it.
 */
- (void)applySelection
{
  NSDictionary *format = self.selectedFormat;
  NSString *extension = format[@"extension"];
  UTType *type = [UTType typeWithFilenameExtension:extension];
  if (type != nil) {
    panel.allowedContentTypes = @[ type ];
  }
  NSString *name = panel.nameFieldStringValue;
  NSString *nameExtension = name.pathExtension.lowercaseString;
  BOOL isOfferedExtension = [[self.formats valueForKey:@"extension"] containsObject:nameExtension];
  if (isOfferedExtension && ![nameExtension isEqualToString:extension.lowercaseString]) {
    panel.nameFieldStringValue = [name.stringByDeletingPathExtension stringByAppendingPathExtension:extension];
  }
  panel.message = [format[@"note"] isKindOfClass:[NSString class]] ? format[@"note"] : @"";
}

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
    [center addObserver:self selector:@selector(onExportPngCommand:) name:GPEditorExportPngCommandNotification object:nil];
    [center addObserver:self selector:@selector(onPrintCommand:) name:GPEditorPrintCommandNotification object:nil];
    [center addObserver:self selector:@selector(onHelpCommand:) name:GPEditorHelpCommandNotification object:nil];
    [center addObserver:self selector:@selector(onFocusCommand:) name:GPEditorFocusCommandNotification object:nil];
    [center addObserver:self selector:@selector(onUndoCommand:) name:GPEditorUndoCommandNotification object:nil];
    [center addObserver:self selector:@selector(onRedoCommand:) name:GPEditorRedoCommandNotification object:nil];
    [center addObserver:self selector:@selector(onSongWriterCommand:) name:GPEditorSongWriterCommandNotification object:nil];
    [center addObserver:self selector:@selector(onLyricsCommand:) name:GPEditorLyricsCommandNotification object:nil];
    [center addObserver:self selector:@selector(onScalesCommand:) name:GPEditorScalesCommandNotification object:nil];
    [center addObserver:self selector:@selector(onOpenURLs:) name:GPEditorOpenURLsNotification object:nil];
    [center addObserver:self selector:@selector(onSaveCommand:) name:GPEditorSaveCommandNotification object:nil];
    [center addObserver:self selector:@selector(onSaveAsCommand:) name:GPEditorSaveAsCommandNotification object:nil];
    [center addObserver:self selector:@selector(onCloseTabCommand:) name:GPEditorCloseTabCommandNotification object:nil];
    [center addObserver:self selector:@selector(onNextTabCommand:) name:GPEditorNextTabCommandNotification object:nil];
    [center addObserver:self selector:@selector(onPreviousTabCommand:) name:GPEditorPreviousTabCommandNotification object:nil];
    [center addObserver:self selector:@selector(onExportMidiCommand:) name:GPEditorExportMidiCommandNotification object:nil];
    [center addObserver:self selector:@selector(onExportAsciiTabCommand:) name:GPEditorExportAsciiTabCommandNotification object:nil];
    [center addObserver:self selector:@selector(onExportMusicXmlCommand:) name:GPEditorExportMusicXmlCommandNotification object:nil];
    [center addObserver:self
               selector:@selector(onExportCompressedMusicXmlCommand:)
                   name:GPEditorExportCompressedMusicXmlCommandNotification
                 object:nil];
    [center addObserver:self selector:@selector(onExportAudioCommand:) name:GPEditorExportAudioCommandNotification object:nil];
    [center addObserver:self selector:@selector(onTransposeCommand:) name:GPEditorTransposeCommandNotification object:nil];
    [center addObserver:self selector:@selector(onCommandPaletteCommand:) name:GPEditorCommandPaletteCommandNotification object:nil];
    [center addObserver:self selector:@selector(onMultitrackCommand:) name:GPEditorMultitrackCommandNotification object:nil];
    [center addObserver:self selector:@selector(onPreviousTrackCommand:) name:GPEditorPreviousTrackCommandNotification object:nil];
    [center addObserver:self selector:@selector(onNextTrackCommand:) name:GPEditorNextTrackCommandNotification object:nil];
  }
  return self;
}

- (void)dealloc
{
  [[NSNotificationCenter defaultCenter] removeObserver:self];
}

- (NSArray<NSString *> *)supportedEvents
{
  return @[
    kNewRequestedEvent, kImportPdfRequestedEvent, kExportRequestedEvent, kPrintRequestedEvent, kHelpRequestedEvent, kSongWriterRequestedEvent,
    kOpenRequestedEvent, kFileOpenedEvent, kSaveRequestedEvent, kCloseTabRequestedEvent, kNextTabRequestedEvent, kPreviousTabRequestedEvent,
    kExportPngRequestedEvent, kExportMidiRequestedEvent, kExportAsciiTabRequestedEvent,
    kExportMusicXmlRequestedEvent, kExportCompressedMusicXmlRequestedEvent, kExportAudioRequestedEvent,
    kLyricsRequestedEvent, kScalesRequestedEvent, kTransposeRequestedEvent, kCommandPaletteRequestedEvent, kFocusRequestedEvent, kUndoRequestedEvent, kRedoRequestedEvent,
    kMultitrackRequestedEvent, kPreviousTrackRequestedEvent, kNextTrackRequestedEvent
  ];
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

/** File ▸ Export PNG…. */
- (void)onExportPngCommand:(NSNotification *)note
{
  if (hasListeners) {
    [self sendEventWithName:kExportPngRequestedEvent body:@{}];
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

/** View ▸ Multitrack, Previous Track, Next Track. */
- (void)onMultitrackCommand:(NSNotification *)note
{
  if (hasListeners) {
    [self sendEventWithName:kMultitrackRequestedEvent body:@{}];
  }
}

- (void)onPreviousTrackCommand:(NSNotification *)note
{
  if (hasListeners) {
    [self sendEventWithName:kPreviousTrackRequestedEvent body:@{}];
  }
}

- (void)onNextTrackCommand:(NSNotification *)note
{
  if (hasListeners) {
    [self sendEventWithName:kNextTrackRequestedEvent body:@{}];
  }
}

/** Edit ▸ Undo / Redo for the score (EditMenu.swift: not while a text field edits, its own undo then). */
- (void)onUndoCommand:(NSNotification *)note
{
  if (hasListeners) {
    [self sendEventWithName:kUndoRequestedEvent body:@{}];
  }
}

- (void)onRedoCommand:(NSNotification *)note
{
  if (hasListeners) {
    [self sendEventWithName:kRedoRequestedEvent body:@{}];
  }
}

/** View ▸ Focus / Unfocus. */
- (void)onFocusCommand:(NSNotification *)note
{
  if (hasListeners) {
    [self sendEventWithName:kFocusRequestedEvent body:@{}];
  }
}

- (void)onSongWriterCommand:(NSNotification *)note
{
  if (hasListeners) {
    [self sendEventWithName:kSongWriterRequestedEvent body:@{}];
  }
}

- (void)onLyricsCommand:(NSNotification *)note
{
  if (hasListeners) {
    [self sendEventWithName:kLyricsRequestedEvent body:@{}];
  }
}

- (void)onScalesCommand:(NSNotification *)note
{
  if (hasListeners) {
    [self sendEventWithName:kScalesRequestedEvent body:@{}];
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

- (void)onCloseTabCommand:(NSNotification *)note
{
  if (hasListeners) {
    [self sendEventWithName:kCloseTabRequestedEvent body:@{}];
  }
}

- (void)onNextTabCommand:(NSNotification *)note
{
  if (hasListeners) {
    [self sendEventWithName:kNextTabRequestedEvent body:@{}];
  }
}

- (void)onPreviousTabCommand:(NSNotification *)note
{
  if (hasListeners) {
    [self sendEventWithName:kPreviousTabRequestedEvent body:@{}];
  }
}

- (void)onExportMidiCommand:(NSNotification *)note
{
  if (hasListeners) {
    [self sendEventWithName:kExportMidiRequestedEvent body:@{}];
  }
}

- (void)onExportAsciiTabCommand:(NSNotification *)note
{
  if (hasListeners) {
    [self sendEventWithName:kExportAsciiTabRequestedEvent body:@{}];
  }
}

- (void)onExportMusicXmlCommand:(NSNotification *)note
{
  if (hasListeners) {
    [self sendEventWithName:kExportMusicXmlRequestedEvent body:@{}];
  }
}

- (void)onExportCompressedMusicXmlCommand:(NSNotification *)note
{
  if (hasListeners) {
    [self sendEventWithName:kExportCompressedMusicXmlRequestedEvent body:@{}];
  }
}

/** File ▸ Export Audio… (GPAudioExport.m renders and writes the files). */
- (void)onExportAudioCommand:(NSNotification *)note
{
  if (hasListeners) {
    [self sendEventWithName:kExportAudioRequestedEvent body:@{}];
  }
}

/** Tools ▸ Transpose…. */
- (void)onTransposeCommand:(NSNotification *)note
{
  if (hasListeners) {
    [self sendEventWithName:kTransposeRequestedEvent body:@{}];
  }
}

/** Tools ▸ Command Palette… (⇧⌘P), and Tools ▸ Expression Text… (⌥⌘E: the notification's object is @"expression"). */
- (void)onCommandPaletteCommand:(NSNotification *)note
{
  if (hasListeners) {
    NSString *mode = [note.object isKindOfClass:[NSString class]] && [note.object isEqualToString:@"expression"] ? @"expression" : @"commands";
    [self sendEventWithName:kCommandPaletteRequestedEvent body:@{@"mode": mode}];
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
  for (NSString *ext in @[ @"gp", @"gpx", @"gp5", @"gp4", @"gp3", @"gtp", @"ptb", @"tef", @"mid", @"midi", @"musicxml", @"mxl", @"xml" ]) {
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
    panel.message = GPLocalizedString(@"Open a Guitar Pro file (.gp, .gpx, .gp5, .gp4, .gp3, .gtp), a Power Tab (.ptb), TablEdit (.tef), MIDI (.mid) or MusicXML file (.musicxml, .xml, .mxl)");
    if ([panel runModal] != NSModalResponseOK || panel.URL == nil) {
      resolve([NSNull null]);
      return;
    }
    NSError *error = nil;
    NSDictionary *payload = [GPFiles payloadForPath:panel.URL.path error:&error];
    if (payload == nil) {
      reject(@"read_failed", error.localizedDescription ?: GPLocalizedString(@"Could not read the file"), error);
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
    reject(@"read_failed", error.localizedDescription ?: GPLocalizedString(@"Could not read the file"), error);
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
      *error = [NSError errorWithDomain:@"GPFiles" code:1 userInfo:@{NSLocalizedDescriptionKey : GPLocalizedString(@"The file data is not valid base64")}];
    }
    return nil;
  }
  // A file reopened from the recent files after a relaunch is writable only through its bookmark.
  __block BOOL isWritten = NO;
  __block NSError *writeError = nil;
  GPWithRecentFileAccess(path, ^{
    NSError *blockError = nil;
    isWritten = [data writeToFile:path options:NSDataWritingAtomic error:&blockError];
    writeError = blockError;
  });
  if (!isWritten) {
    if (error != NULL) {
      *error = writeError;
    }
    return nil;
  }
  return @{@"name" : path.lastPathComponent, @"path" : path};
}

/** The formats a save panel offers ({id, label, extension, note?} from JS), in order; anything else is left out. */
+ (NSArray<NSDictionary *> *)formatsFrom:(id)value
{
  NSMutableArray<NSDictionary *> *formats = [NSMutableArray array];
  for (id format in [value isKindOfClass:[NSArray class]] ? value : @[]) {
    BOOL isFormat = [format isKindOfClass:[NSDictionary class]] && [format[@"id"] isKindOfClass:[NSString class]] &&
                    [format[@"label"] isKindOfClass:[NSString class]] && [format[@"extension"] isKindOfClass:[NSString class]];
    if (isFormat) {
      [formats addObject:format];
    }
  }
  return formats;
}

/** Where to save without the panel: the unsandboxed QA copy (scripts/qa/run.sh) honours GPEDITOR_QA_SAVE_PATH. */
+ (nullable NSString *)qaSavePath
{
  NSString *path = [NSProcessInfo processInfo].environment[@"GPEDITOR_QA_SAVE_PATH"];
  return path.length > 0 && !GPIsSandboxed() ? path : nil;
}

/**
 * Save panel. With more than one format, a "Format" popup under it: choosing one gives the name its extension; the
 * panel's message is the chosen format's note. Resolves {name, path, formatId} (the file is not written yet), or null
 * when cancelled.
 */
RCT_EXPORT_METHOD(showSavePanel : (NSDictionary *)options resolve : (RCTPromiseResolveBlock)resolve reject : (RCTPromiseRejectBlock)reject)
{
  NSArray<NSDictionary *> *formats = [GPFiles formatsFrom:options[@"formats"]];
  if (formats.count == 0) {
    reject(@"no_format", GPLocalizedString(@"No file format to save in"), nil);
    return;
  }
  NSString *suggestedName = [options[@"suggestedName"] isKindOfClass:[NSString class]] ? options[@"suggestedName"] : @"";
  NSUInteger selected = [formats indexOfObjectPassingTest:^BOOL(NSDictionary *format, NSUInteger index, BOOL *stop) {
    return [format[@"id"] isEqual:options[@"formatId"]];
  }];
  dispatch_async(dispatch_get_main_queue(), ^{
    GPSaveFormatChooser *chooser = [[GPSaveFormatChooser alloc] initWithFormats:formats selected:selected == NSNotFound ? 0 : selected];
    NSString *qaPath = [GPFiles qaSavePath];
    if (qaPath != nil) {
      [chooser selectFormatWithExtension:qaPath.pathExtension];
      resolve(@{@"name" : qaPath.lastPathComponent, @"path" : qaPath, @"formatId" : chooser.selectedFormat[@"id"]});
      return;
    }
    NSSavePanel *panel = [NSSavePanel savePanel];
    panel.nameFieldStringValue = suggestedName;
    panel.canCreateDirectories = YES;
    [chooser attachToPanel:panel];
    if ([panel runModal] != NSModalResponseOK || panel.URL == nil) {
      resolve([NSNull null]);
      return;
    }
    resolve(@{@"name" : panel.URL.lastPathComponent, @"path" : panel.URL.path, @"formatId" : chooser.selectedFormat[@"id"]});
  });
}

RCT_EXPORT_METHOD(writeFile : (NSString *)path base64 : (NSString *)base64 resolve : (RCTPromiseResolveBlock)resolve reject : (RCTPromiseRejectBlock)reject)
{
  NSError *error = nil;
  NSDictionary *saved = [GPFiles writeBase64:base64 toPath:path error:&error];
  if (saved == nil) {
    reject(@"write_failed", error.localizedDescription ?: GPLocalizedString(@"Could not write the file"), error);
    return;
  }
  resolve(saved);
}

/** Writes text as UTF-8 to a file the user opened or chose in a save panel; the result names it like writeFile's. */
RCT_EXPORT_METHOD(writeTextFile : (NSString *)path text : (NSString *)text resolve : (RCTPromiseResolveBlock)resolve reject : (RCTPromiseRejectBlock)reject)
{
  NSError *error = nil;
  if (![text writeToFile:path atomically:YES encoding:NSUTF8StringEncoding error:&error]) {
    reject(@"write_failed", error.localizedDescription ?: GPLocalizedString(@"Could not write the file"), error);
    return;
  }
  resolve(@{@"name" : path.lastPathComponent, @"path" : path});
}

/** Whether the shown tab can undo / redo: Edit ▸ Undo / Redo of the menu bar follow it (EditMenu.swift). */
RCT_EXPORT_METHOD(setUndoState : (BOOL)canUndo canRedo : (BOOL)canRedo)
{
  dispatch_async(dispatch_get_main_queue(), ^{
    [[NSNotificationCenter defaultCenter] postNotificationName:GPEditorUndoStateNotification object:nil userInfo:@{@"canUndo" : @(canUndo), @"canRedo" : @(canRedo)}];
  });
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
