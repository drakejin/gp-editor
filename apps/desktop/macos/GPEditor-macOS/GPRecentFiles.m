// Recent files for the JS side (src/native/recent-files.ts, which orders the list: src/lib/recent-files.ts): the list
// in user defaults, where File ▸ Open Recent reads it (RecentFilesMenu.swift), and a security-scoped bookmark per file
// (GPEditor.entitlements: com.apple.security.files.bookmarks.app-scope). The sandbox lets the app open a file only in
// the session the user picked it; the bookmark, made then, opens it again after a relaunch. Also forwards the Open
// Recent menu's notifications (GPEditorNotifications.h) to JS as events.

#import <AppKit/AppKit.h>
#import <React/RCTBridgeModule.h>
#import <React/RCTEventEmitter.h>

#import "GPEditorNotifications.h"
#import "GPRecentFiles.h"

NSString *const GPRecentFilesDefaultsKey = @"GPRecentFiles";
/** User defaults key of the bookmarks: path → bookmark data, for the listed files only. */
static NSString *const kBookmarksKey = @"GPRecentFileBookmarks";
/** The JS side keeps at most MAX_RECENT_FILES (20); a longer list is refused. */
static const NSUInteger kMaxFiles = 20;

static NSString *const kOpenRecentRequestedEvent = @"openRecentRequested";
static NSString *const kClearRecentRequestedEvent = @"clearRecentRequested";
static NSString *const kRecentFilesRequestedEvent = @"recentFilesRequested";

static NSDictionary<NSString *, NSData *> *StoredBookmarks(void)
{
  return [[NSUserDefaults standardUserDefaults] dictionaryForKey:kBookmarksKey] ?: @{};
}

/** A security-scoped bookmark (read-write, as the panel granted the file); a plain one where that fails (no sandbox). */
static NSData *_Nullable NewBookmark(NSURL *url)
{
  NSData *data = [url bookmarkDataWithOptions:NSURLBookmarkCreationWithSecurityScope includingResourceValuesForKeys:nil relativeToURL:nil error:nil];
  return data ?: [url bookmarkDataWithOptions:0 includingResourceValuesForKeys:nil relativeToURL:nil error:nil];
}

/** Where a file moved to the Trash went: it counts as gone. */
static BOOL IsInTrash(NSURL *url)
{
  NSArray<NSString *> *components = url.pathComponents;
  return [components containsObject:@".Trash"] || [components containsObject:@".Trashes"];
}

/** Where the bookmarked file is now (followed when it was moved or renamed); nil when it cannot be found or is in the Trash. */
static NSURL *_Nullable ResolveBookmark(NSData *_Nullable bookmark, BOOL *isStale)
{
  if (bookmark == nil) {
    return nil;
  }
  NSURLBookmarkResolutionOptions options = NSURLBookmarkResolutionWithoutUI | NSURLBookmarkResolutionWithoutMounting;
  NSURL *url = [NSURL URLByResolvingBookmarkData:bookmark options:options | NSURLBookmarkResolutionWithSecurityScope relativeToURL:nil bookmarkDataIsStale:isStale error:nil];
  url = url ?: [NSURL URLByResolvingBookmarkData:bookmark options:options relativeToURL:nil bookmarkDataIsStale:isStale error:nil];
  return url != nil && !IsInTrash(url) ? url : nil;
}

void GPWithRecentFileAccess(NSString *path, NS_NOESCAPE void (^work)(void))
{
  BOOL isStale = NO;
  NSURL *url = ResolveBookmark(StoredBookmarks()[path], &isStale);
  BOOL isAccessing = [url.path isEqualToString:path] && [url startAccessingSecurityScopedResource];
  work();
  if (isAccessing) {
    [url stopAccessingSecurityScopedResource];
  }
}

@interface GPRecentFiles : RCTEventEmitter <RCTBridgeModule>
@end

@implementation GPRecentFiles {
  BOOL hasListeners;
}

RCT_EXPORT_MODULE();

+ (BOOL)requiresMainQueueSetup
{
  return YES;
}

- (dispatch_queue_t)methodQueue
{
  return dispatch_get_main_queue();
}

- (instancetype)init
{
  if (self = [super init]) {
    NSNotificationCenter *center = [NSNotificationCenter defaultCenter];
    [center addObserver:self selector:@selector(onOpenRecentCommand:) name:GPEditorOpenRecentCommandNotification object:nil];
    [center addObserver:self selector:@selector(onClearRecentCommand:) name:GPEditorClearRecentCommandNotification object:nil];
    [center addObserver:self selector:@selector(onRecentFilesCommand:) name:GPEditorRecentFilesCommandNotification object:nil];
  }
  return self;
}

- (void)dealloc
{
  [[NSNotificationCenter defaultCenter] removeObserver:self];
}

- (NSArray<NSString *> *)supportedEvents
{
  return @[ kOpenRecentRequestedEvent, kClearRecentRequestedEvent, kRecentFilesRequestedEvent ];
}

- (void)startObserving
{
  hasListeners = YES;
}

- (void)stopObserving
{
  hasListeners = NO;
}

- (void)onOpenRecentCommand:(NSNotification *)note
{
  if (hasListeners && [note.object isKindOfClass:[NSString class]]) {
    [self sendEventWithName:kOpenRecentRequestedEvent body:@{@"path" : note.object}];
  }
}

- (void)onClearRecentCommand:(NSNotification *)note
{
  if (hasListeners) {
    [self sendEventWithName:kClearRecentRequestedEvent body:@{}];
  }
}

- (void)onRecentFilesCommand:(NSNotification *)note
{
  if (hasListeners) {
    [self sendEventWithName:kRecentFilesRequestedEvent body:@{}];
  }
}

/** One stored or JS entry as a property-list dictionary; nil unless it has an absolute path. */
+ (nullable NSDictionary *)entryFrom:(id)value
{
  NSDictionary *entry = [value isKindOfClass:[NSDictionary class]] ? value : nil;
  NSString *path = [entry[@"path"] isKindOfClass:[NSString class]] ? entry[@"path"] : nil;
  if (![path hasPrefix:@"/"]) {
    return nil;
  }
  NSString *name = [entry[@"name"] isKindOfClass:[NSString class]] ? entry[@"name"] : path.lastPathComponent;
  NSNumber *(^number)(NSString *) = ^NSNumber *(NSString *key) {
    return [entry[key] isKindOfClass:[NSNumber class]] ? entry[key] : @0;
  };
  return @{
    @"path" : path,
    @"name" : name,
    @"isPinned" : @(number(@"isPinned").boolValue),
    @"openedAt" : @(number(@"openedAt").doubleValue),
    @"isMissing" : @(number(@"isMissing").boolValue),
  };
}

+ (NSArray<NSDictionary *> *)storedFiles
{
  NSMutableArray<NSDictionary *> *files = [NSMutableArray array];
  for (id value in [[NSUserDefaults standardUserDefaults] arrayForKey:GPRecentFilesDefaultsKey] ?: @[]) {
    NSDictionary *entry = [self entryFrom:value];
    if (entry != nil && files.count < kMaxFiles) {
      [files addObject:entry];
    }
  }
  return files;
}

/** Stores the list and the bookmarks of its files only, then tells File ▸ Open Recent. */
+ (void)storeFiles:(NSArray<NSDictionary *> *)files bookmarks:(NSDictionary<NSString *, NSData *> *)bookmarks
{
  NSSet<NSString *> *paths = [NSSet setWithArray:[files valueForKey:@"path"]];
  NSMutableDictionary<NSString *, NSData *> *kept = [NSMutableDictionary dictionary];
  [bookmarks enumerateKeysAndObjectsUsingBlock:^(NSString *path, NSData *bookmark, BOOL *stop) {
    if ([paths containsObject:path]) {
      kept[path] = bookmark;
    }
  }];
  NSUserDefaults *defaults = [NSUserDefaults standardUserDefaults];
  [defaults setObject:files forKey:GPRecentFilesDefaultsKey];
  [defaults setObject:kept forKey:kBookmarksKey];
  [[NSNotificationCenter defaultCenter] postNotificationName:GPEditorRecentFilesChangedNotification object:nil];
}

/**
 * The entry as the file is now: followed to where its bookmark resolves (bookmarked again there, or when the bookmark
 * is stale), or missing when it is nowhere to be found.
 */
+ (NSDictionary *)checked:(NSDictionary *)entry bookmarks:(NSMutableDictionary<NSString *, NSData *> *)bookmarks
{
  NSString *path = entry[@"path"];
  BOOL isStale = NO;
  NSURL *url = ResolveBookmark(bookmarks[path], &isStale) ?: [NSURL fileURLWithPath:path];
  BOOL isAccessing = [url startAccessingSecurityScopedResource];
  BOOL exists = [[NSFileManager defaultManager] fileExistsAtPath:url.path];
  BOOL hasMoved = ![url.path isEqualToString:path];
  NSData *fresh = exists && (isStale || hasMoved) ? NewBookmark(url) : nil;
  if (isAccessing) {
    [url stopAccessingSecurityScopedResource];
  }
  if (fresh != nil || (exists && hasMoved)) {
    NSData *bookmark = fresh ?: bookmarks[path];
    [bookmarks removeObjectForKey:path];
    if (bookmark != nil) {
      bookmarks[url.path] = bookmark;
    }
  }
  NSMutableDictionary *checked = [entry mutableCopy];
  // A BOOL, so JS gets a boolean (`@(!exists)` would box an int, which arrives as 1).
  checked[@"isMissing"] = [NSNumber numberWithBool:!exists];
  if (exists && hasMoved) {
    checked[@"path"] = url.path;
    checked[@"name"] = url.lastPathComponent;
  }
  return checked;
}

/** The stored list, each file checked (moved ones followed, gone ones marked missing); stored again as checked. */
RCT_EXPORT_METHOD(loadRecentFiles : (RCTPromiseResolveBlock)resolve reject : (RCTPromiseRejectBlock)reject)
{
  NSMutableDictionary<NSString *, NSData *> *bookmarks = [StoredBookmarks() mutableCopy];
  NSMutableArray<NSDictionary *> *files = [NSMutableArray array];
  for (NSDictionary *entry in [GPRecentFiles storedFiles]) {
    [files addObject:[GPRecentFiles checked:entry bookmarks:bookmarks]];
  }
  [GPRecentFiles storeFiles:files bookmarks:bookmarks];
  resolve(files);
}

/**
 * Stores the list JS ordered. Each listed file without a bookmark gets one, and `touchedPath` (a file just opened or
 * saved, which the app may access now) a fresh one; bookmarks of files no longer listed are dropped.
 */
RCT_EXPORT_METHOD(saveRecentFiles : (NSString *)filesJson touchedPath : (NSString *)touchedPath resolve : (RCTPromiseResolveBlock)resolve reject : (RCTPromiseRejectBlock)reject)
{
  id parsed = [NSJSONSerialization JSONObjectWithData:[filesJson dataUsingEncoding:NSUTF8StringEncoding] options:0 error:nil];
  NSMutableArray<NSDictionary *> *files = [NSMutableArray array];
  for (id value in [parsed isKindOfClass:[NSArray class]] ? parsed : @[]) {
    NSDictionary *entry = [GPRecentFiles entryFrom:value];
    if (entry != nil) {
      [files addObject:entry];
    }
  }
  if (![parsed isKindOfClass:[NSArray class]] || files.count != [parsed count] || files.count > kMaxFiles) {
    reject(@"bad_list", @"The recent files list is not valid", nil);
    return;
  }
  NSMutableDictionary<NSString *, NSData *> *bookmarks = [StoredBookmarks() mutableCopy];
  for (NSDictionary *entry in files) {
    NSString *path = entry[@"path"];
    if (bookmarks[path] == nil || [path isEqualToString:touchedPath]) {
      // Inside the old bookmark's access, if any: a file reopened after a relaunch is reachable only through it.
      __block NSData *bookmark = nil;
      GPWithRecentFileAccess(path, ^{
        bookmark = NewBookmark([NSURL fileURLWithPath:path]);
      });
      if (bookmark != nil) {
        bookmarks[path] = bookmark;
      }
    }
  }
  [GPRecentFiles storeFiles:files bookmarks:bookmarks];
  resolve(nil);
}

/**
 * A listed file read through its bookmark, as GPFiles.readFile reads one: { name, path (where it is now), base64 }.
 * Rejects "missing" when the file is gone.
 */
RCT_EXPORT_METHOD(readRecentFile : (NSString *)path resolve : (RCTPromiseResolveBlock)resolve reject : (RCTPromiseRejectBlock)reject)
{
  NSMutableDictionary<NSString *, NSData *> *bookmarks = [StoredBookmarks() mutableCopy];
  BOOL isStale = NO;
  NSURL *url = ResolveBookmark(bookmarks[path], &isStale) ?: [NSURL fileURLWithPath:path];
  BOOL isAccessing = [url startAccessingSecurityScopedResource];
  BOOL exists = [[NSFileManager defaultManager] fileExistsAtPath:url.path];
  NSError *error = nil;
  NSData *data = exists ? [NSData dataWithContentsOfURL:url options:0 error:&error] : nil;
  NSData *fresh = data != nil && (isStale || ![url.path isEqualToString:path]) ? NewBookmark(url) : nil;
  if (isAccessing) {
    [url stopAccessingSecurityScopedResource];
  }
  if (fresh != nil) {
    [bookmarks removeObjectForKey:path];
    bookmarks[url.path] = fresh;
    [[NSUserDefaults standardUserDefaults] setObject:bookmarks forKey:kBookmarksKey];
  }
  if (!exists) {
    NSString *message = [NSString stringWithFormat:@"“%@” is no longer there: it was deleted or moved to the Trash, or its disk is not connected", path.lastPathComponent];
    reject(@"missing", message, nil);
    return;
  }
  if (data == nil) {
    reject(@"read_failed", error.localizedDescription ?: @"Could not read the file", error);
    return;
  }
  resolve(@{@"name" : url.lastPathComponent, @"path" : url.path, @"base64" : [data base64EncodedStringWithOptions:0]});
}

@end
