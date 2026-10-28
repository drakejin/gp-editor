// File access for the JS side: the open and save panels, reading a file the user picked or dropped, files handed to
// the app by Finder ("Open With", dock drop), writing bytes and text, and the menu commands AppDelegate.swift and
// EditMenu.swift post (GPEditorNotifications.h), forwarded to JS as events by one table, GPMenuEvents: the File menu
// (New, Open…, Import PDF…, Export PDF… / PNG… / MIDI… / ASCII Tab… / MusicXML… / Compressed MusicXML… / Audio…,
// Print…, Save, Save As…, Close Tab, Next Tab, Previous Tab), Edit ▸ Undo / Redo (with JS's undo state back:
// setUndoState), Delete Notes / Delete Bars, Lyrics…, Annotation… and AI Wizard ▸ Song Writer…, Tools ▸ Scales…, Transpose…,
// Command Palette… / Expression Text…, View ▸ Focus / Unfocus, Multitrack, Previous / Next Track, Drum Key, and Help ▸
// Keyboard Shortcuts. Export's files, like Save's, go through showSavePanel, then writeFile / writeTextFile; Open reads
// MusicXML files too.

#import <AppKit/AppKit.h>
#import <React/RCTBridgeModule.h>
#import <React/RCTEventEmitter.h>
#import <UniformTypeIdentifiers/UniformTypeIdentifiers.h>
#import <os/log.h>

#import "GPEditorNotifications.h"
#import "GPRecentFiles.h"
#import "GPSandbox.h"
#import "GPAppStrings.h"

static NSString *const kFileOpenedEvent = @"fileOpened";

/** The body of the event a menu notification becomes. */
typedef NSDictionary *_Nonnull (*GPMenuEventBody)(NSNotification *_Nonnull note);

static NSDictionary *GPNoBody(NSNotification *note)
{
  return @{};
}

/** File ▸ New: the score mode the item asks for (JS checks it; an unknown or missing one is score + tab). */
static NSDictionary *GPNewBody(NSNotification *note)
{
  return @{@"mode" : [note.object isKindOfClass:[NSString class]] ? note.object : @""};
}

/** File ▸ Save: overwrite where it can. */
static NSDictionary *GPSaveBody(NSNotification *note)
{
  return @{@"saveAs" : @NO};
}

/** File ▸ Save As…: always ask where. */
static NSDictionary *GPSaveAsBody(NSNotification *note)
{
  return @{@"saveAs" : @YES};
}

/** Edit ▸ Delete Notes / Delete Bars: what goes, "notes" or "bars" (JS checks it and ignores anything else). */
static NSDictionary *GPDeleteBody(NSNotification *note)
{
  return @{@"what" : [note.object isKindOfClass:[NSString class]] ? note.object : @""};
}

/** Tools ▸ Command Palette… (⇧⌘P), or Expression Text… (⌥⌘E: the notification's object is @"expression"). */
static NSDictionary *GPCommandPaletteBody(NSNotification *note)
{
  BOOL isExpression = [note.object isKindOfClass:[NSString class]] && [note.object isEqualToString:@"expression"];
  return @{@"mode" : isExpression ? @"expression" : @"commands"};
}

/** One menu notification forwarded to JS: the event's name and how its body is made. */
@interface GPMenuEvent : NSObject
@property(nonatomic, copy, readonly) NSString *name;
@property(nonatomic, readonly) GPMenuEventBody body;
@end

@implementation GPMenuEvent
- (instancetype)initWithName:(NSString *)name body:(GPMenuEventBody)body
{
  if (self = [super init]) {
    _name = [name copy];
    _body = body;
  }
  return self;
}
@end

static GPMenuEvent *GPEvent(NSString *name, GPMenuEventBody body)
{
  return [[GPMenuEvent alloc] initWithName:name body:body];
}

/** Every menu notification GPFiles forwards, by name: the event JS receives (src/native/gp-files.ts). */
static NSDictionary<NSNotificationName, GPMenuEvent *> *GPMenuEvents(void)
{
  static NSDictionary<NSNotificationName, GPMenuEvent *> *events;
  static dispatch_once_t once;
  dispatch_once(&once, ^{
    events = @{
      GPEditorNewCommandNotification : GPEvent(@"newRequested", GPNewBody),
      GPEditorOpenCommandNotification : GPEvent(@"openRequested", GPNoBody),
      GPEditorImportPdfCommandNotification : GPEvent(@"importPdfRequested", GPNoBody),
      GPEditorExportCommandNotification : GPEvent(@"exportRequested", GPNoBody),
      GPEditorExportPngCommandNotification : GPEvent(@"exportPngRequested", GPNoBody),
      GPEditorExportMidiCommandNotification : GPEvent(@"exportMidiRequested", GPNoBody),
      GPEditorExportAsciiTabCommandNotification : GPEvent(@"exportAsciiTabRequested", GPNoBody),
      GPEditorExportMusicXmlCommandNotification : GPEvent(@"exportMusicXmlRequested", GPNoBody),
      GPEditorExportCompressedMusicXmlCommandNotification : GPEvent(@"exportCompressedMusicXmlRequested", GPNoBody),
      // GPAudioExport.m renders and writes the files.
      GPEditorExportAudioCommandNotification : GPEvent(@"exportAudioRequested", GPNoBody),
      GPEditorPrintCommandNotification : GPEvent(@"printRequested", GPNoBody),
      GPEditorSaveCommandNotification : GPEvent(@"saveRequested", GPSaveBody),
      GPEditorSaveAsCommandNotification : GPEvent(@"saveRequested", GPSaveAsBody),
      GPEditorCloseTabCommandNotification : GPEvent(@"closeTabRequested", GPNoBody),
      GPEditorNextTabCommandNotification : GPEvent(@"nextTabRequested", GPNoBody),
      GPEditorPreviousTabCommandNotification : GPEvent(@"previousTabRequested", GPNoBody),
      // The score's undo and redo (EditMenu.swift: not while a text field edits, its own undo then).
      GPEditorUndoCommandNotification : GPEvent(@"undoRequested", GPNoBody),
      GPEditorRedoCommandNotification : GPEvent(@"redoRequested", GPNoBody),
      // The score's notes (D) or bars (⌘D) deleted (EditMenu.swift: not while a text field has the keyboard).
      GPEditorDeleteCommandNotification : GPEvent(@"deleteRequested", GPDeleteBody),
      GPEditorSongWriterCommandNotification : GPEvent(@"songWriterRequested", GPNoBody),
      GPEditorLyricsCommandNotification : GPEvent(@"lyricsRequested", GPNoBody),
      GPEditorAnnotationCommandNotification : GPEvent(@"annotationRequested", GPNoBody),
      GPEditorScalesCommandNotification : GPEvent(@"scalesRequested", GPNoBody),
      GPEditorTransposeCommandNotification : GPEvent(@"transposeRequested", GPNoBody),
      GPEditorCommandPaletteCommandNotification : GPEvent(@"commandPaletteRequested", GPCommandPaletteBody),
      GPEditorFocusCommandNotification : GPEvent(@"focusRequested", GPNoBody),
      GPEditorMultitrackCommandNotification : GPEvent(@"multitrackRequested", GPNoBody),
      GPEditorPreviousTrackCommandNotification : GPEvent(@"previousTrackRequested", GPNoBody),
      GPEditorNextTrackCommandNotification : GPEvent(@"nextTrackRequested", GPNoBody),
      GPEditorDrumKeyCommandNotification : GPEvent(@"drumKeyRequested", GPNoBody),
      GPEditorHelpCommandNotification : GPEvent(@"helpRequested", GPNoBody),
    };
  });
  return events;
}

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
    for (NSNotificationName name in GPMenuEvents()) {
      [center addObserver:self selector:@selector(onMenuCommand:) name:name object:nil];
    }
    [center addObserver:self selector:@selector(onOpenURLs:) name:GPEditorOpenURLsNotification object:nil];
  }
  return self;
}

- (void)dealloc
{
  [[NSNotificationCenter defaultCenter] removeObserver:self];
}

- (NSArray<NSString *> *)supportedEvents
{
  NSArray<NSString *> *menuEvents = [GPMenuEvents().allValues valueForKey:@"name"];
  return [[NSOrderedSet orderedSetWithArray:[menuEvents arrayByAddingObject:kFileOpenedEvent]] array];
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

/** A menu command (GPMenuEvents) to JS, while it listens. */
- (void)onMenuCommand:(NSNotification *)note
{
  GPMenuEvent *event = GPMenuEvents()[note.name];
  if (hasListeners && event != nil) {
    [self sendEventWithName:event.name body:event.body(note)];
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
