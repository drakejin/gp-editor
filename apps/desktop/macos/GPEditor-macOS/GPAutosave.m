// Autosave's files (src/native/autosave.ts, src/hooks/use-autosave.ts): Application Support/GPEditor/Autosave — inside
// the sandbox container in the shipped app —, a folder per day (2026-11-04) and in it one per document, holding
// snapshot.gp (the song as a .gp file, written by gp-core) and manifest.json (what it is of, JSON from JS). Each file is
// written atomically (a temporary file, then a rename), the snapshot before its manifest. Folders are named only as
// JS's ids allow (letters, digits, - and _), never a path. At launch JS lists the manifests, removes the days kept long
// enough and asks whether the processes of the sessions that left unsaved work still run (kill(pid, 0), as
// GPAudioAssets does). Methods run on a queue of their own, so a big snapshot never waits on the main thread.

#import <AppKit/AppKit.h>
#import <React/RCTBridgeModule.h>
#include <signal.h>

#import "GPAppStrings.h"

static NSString *const kSnapshotFile = @"snapshot.gp";
static NSString *const kManifestFile = @"manifest.json";
/** Snapshots listed at most (seven days of a busy week). */
static const NSUInteger kMaxListed = 500;
/** A manifest larger than this is no manifest JS wrote. */
static const unsigned long long kMaxManifestBytes = 64 * 1024;
/** A snapshot read back at most (a .gp file holds its audio track's recording). */
static const unsigned long long kMaxSnapshotBytes = 512ull * 1024 * 1024;
/** The longest folder id (a session's, a document's), as autosave-days.ts allows. */
static const NSUInteger kMaxIdLength = 80;

@interface GPAutosave : NSObject <RCTBridgeModule>
@end

/** `2026-11-04`: ten characters, digits and two dashes. */
static BOOL IsDayName(NSString *name)
{
  if (name.length != 10) {
    return NO;
  }
  for (NSUInteger index = 0; index < name.length; index++) {
    unichar character = [name characterAtIndex:index];
    BOOL isDash = index == 4 || index == 7;
    if (isDash ? character != '-' : (character < '0' || character > '9')) {
      return NO;
    }
  }
  return YES;
}

/** Letters, digits, `-` and `_`, at most kMaxIdLength: one folder, never `..` or a path. */
static BOOL IsFolderId(NSString *name)
{
  if (name.length == 0 || name.length > kMaxIdLength) {
    return NO;
  }
  NSMutableCharacterSet *allowed = [NSMutableCharacterSet characterSetWithCharactersInString:@"-_"];
  [allowed addCharactersInRange:NSMakeRange('a', 26)];
  [allowed addCharactersInRange:NSMakeRange('A', 26)];
  [allowed addCharactersInRange:NSMakeRange('0', 10)];
  return [name rangeOfCharacterFromSet:allowed.invertedSet].location == NSNotFound;
}

static NSError *AutosaveError(NSString *message)
{
  return [NSError errorWithDomain:@"GPAutosave" code:1 userInfo:@{NSLocalizedDescriptionKey : message}];
}

static BOOL IsSymbolicLink(NSURL *url)
{
  NSNumber *isLink = nil;
  [url getResourceValue:&isLink forKey:NSURLIsSymbolicLinkKey error:nil];
  return isLink.boolValue;
}

static NSArray<NSURL *> *Children(NSURL *folder)
{
  NSArray<NSURLResourceKey> *keys = @[ NSURLIsDirectoryKey, NSURLIsSymbolicLinkKey ];
  return [[NSFileManager defaultManager] contentsOfDirectoryAtURL:folder includingPropertiesForKeys:keys options:NSDirectoryEnumerationSkipsHiddenFiles error:nil] ?: @[];
}

/** The day folders, oldest first, each a real folder (no link). */
static NSArray<NSURL *> *DayFolders(NSURL *root)
{
  NSMutableArray<NSURL *> *days = [NSMutableArray array];
  for (NSURL *url in Children(root)) {
    if (IsDayName(url.lastPathComponent) && !IsSymbolicLink(url)) {
      [days addObject:url];
    }
  }
  return [days sortedArrayUsingComparator:^NSComparisonResult(NSURL *a, NSURL *b) {
    return [a.lastPathComponent compare:b.lastPathComponent];
  }];
}

@implementation GPAutosave {
  dispatch_queue_t queue;
}

RCT_EXPORT_MODULE();

+ (BOOL)requiresMainQueueSetup
{
  return NO;
}

- (dispatch_queue_t)methodQueue
{
  if (queue == nil) {
    queue = dispatch_queue_create("com.drakejin.gpeditor.autosave", DISPATCH_QUEUE_SERIAL);
  }
  return queue;
}

/** Application Support/GPEditor/Autosave, created when missing; nil when Application Support is not there. */
+ (nullable NSURL *)rootFolder
{
  NSFileManager *files = [NSFileManager defaultManager];
  NSURL *support = [files URLForDirectory:NSApplicationSupportDirectory inDomain:NSUserDomainMask appropriateForURL:nil create:YES error:nil];
  NSURL *root = [support URLByAppendingPathComponent:@"GPEditor/Autosave" isDirectory:YES];
  if (root == nil || ![files createDirectoryAtURL:root withIntermediateDirectories:YES attributes:nil error:nil]) {
    return nil;
  }
  return root;
}

/** A document's folder from `<day>/<document>`; nil for anything else. */
+ (nullable NSURL *)documentFolder:(NSString *)folder
{
  NSArray<NSString *> *parts = [folder componentsSeparatedByString:@"/"];
  if (parts.count != 2 || !IsDayName(parts[0]) || !IsFolderId(parts[1])) {
    return nil;
  }
  return [[[GPAutosave rootFolder] URLByAppendingPathComponent:parts[0] isDirectory:YES] URLByAppendingPathComponent:parts[1] isDirectory:YES];
}

- (void)rejectBadFolder:(RCTPromiseRejectBlock)reject
{
  reject(@"bad_folder", GPLocalizedString(@"Not an autosave folder"), nil);
}

RCT_EXPORT_METHOD(processId : (RCTPromiseResolveBlock)resolve reject : (RCTPromiseRejectBlock)reject)
{
  resolve(@(getpid()));
}

/** The snapshot (base64 bytes), then its manifest, each written whole in place of the last. */
RCT_EXPORT_METHOD(writeSnapshot : (NSString *)folder base64 : (NSString *)base64 manifest : (NSString *)manifest resolve : (RCTPromiseResolveBlock)resolve reject : (RCTPromiseRejectBlock)reject)
{
  NSURL *document = [GPAutosave documentFolder:folder];
  if (document == nil) {
    [self rejectBadFolder:reject];
    return;
  }
  NSData *bytes = [[NSData alloc] initWithBase64EncodedString:base64 options:0];
  NSData *text = [manifest dataUsingEncoding:NSUTF8StringEncoding];
  if (bytes == nil || text == nil) {
    reject(@"bad_data", GPLocalizedString(@"The autosaved work could not be written"), nil);
    return;
  }
  NSError *error = nil;
  BOOL isWritten = [[NSFileManager defaultManager] createDirectoryAtURL:document withIntermediateDirectories:YES attributes:nil error:&error] &&
                   [bytes writeToURL:[document URLByAppendingPathComponent:kSnapshotFile] options:NSDataWritingAtomic error:&error] &&
                   [text writeToURL:[document URLByAppendingPathComponent:kManifestFile] options:NSDataWritingAtomic error:&error];
  if (!isWritten) {
    reject(@"write_failed", error.localizedDescription ?: GPLocalizedString(@"The autosaved work could not be written"), error);
    return;
  }
  resolve(nil);
}

/** A snapshot's manifest rewritten (a new status); never a manifest without its snapshot. */
RCT_EXPORT_METHOD(writeManifest : (NSString *)folder manifest : (NSString *)manifest resolve : (RCTPromiseResolveBlock)resolve reject : (RCTPromiseRejectBlock)reject)
{
  NSURL *document = [GPAutosave documentFolder:folder];
  if (document == nil) {
    [self rejectBadFolder:reject];
    return;
  }
  if (![[NSFileManager defaultManager] fileExistsAtPath:[document URLByAppendingPathComponent:kSnapshotFile].path]) {
    reject(@"missing", GPLocalizedString(@"The autosaved work is no longer there"), nil);
    return;
  }
  NSError *error = nil;
  if (![[manifest dataUsingEncoding:NSUTF8StringEncoding] writeToURL:[document URLByAppendingPathComponent:kManifestFile] options:NSDataWritingAtomic error:&error]) {
    reject(@"write_failed", error.localizedDescription ?: GPLocalizedString(@"The autosaved work could not be written"), error);
    return;
  }
  resolve(nil);
}

/** A document folder's manifest text, when the folder and the file are what JS writes. */
+ (nullable NSString *)manifestIn:(NSURL *)document
{
  if (!IsFolderId(document.lastPathComponent) || IsSymbolicLink(document)) {
    return nil;
  }
  NSURL *url = [document URLByAppendingPathComponent:kManifestFile];
  NSNumber *size = nil;
  [url getResourceValue:&size forKey:NSURLFileSizeKey error:nil];
  if (size == nil || size.unsignedLongLongValue > kMaxManifestBytes || IsSymbolicLink(url)) {
    return nil;
  }
  return [NSString stringWithContentsOfURL:url encoding:NSUTF8StringEncoding error:nil];
}

/** Every snapshot's manifest: [{ folder: "<day>/<document>", manifest: text }], at most kMaxListed, the newest days first. */
RCT_EXPORT_METHOD(listSnapshots : (RCTPromiseResolveBlock)resolve reject : (RCTPromiseRejectBlock)reject)
{
  NSURL *root = [GPAutosave rootFolder];
  NSMutableArray<NSDictionary *> *entries = [NSMutableArray array];
  for (NSURL *day in [(root == nil ? @[] : DayFolders(root)) reverseObjectEnumerator]) {
    for (NSURL *document in Children(day)) {
      NSString *manifest = [GPAutosave manifestIn:document];
      if (manifest != nil && entries.count < kMaxListed) {
        [entries addObject:@{@"folder" : [NSString stringWithFormat:@"%@/%@", day.lastPathComponent, document.lastPathComponent], @"manifest" : manifest}];
      }
    }
  }
  resolve(entries);
}

/** A snapshot's bytes as base64. */
RCT_EXPORT_METHOD(readSnapshot : (NSString *)folder resolve : (RCTPromiseResolveBlock)resolve reject : (RCTPromiseRejectBlock)reject)
{
  NSURL *document = [GPAutosave documentFolder:folder];
  if (document == nil) {
    [self rejectBadFolder:reject];
    return;
  }
  NSURL *url = [document URLByAppendingPathComponent:kSnapshotFile];
  NSNumber *size = nil;
  [url getResourceValue:&size forKey:NSURLFileSizeKey error:nil];
  NSData *data = size != nil && size.unsignedLongLongValue <= kMaxSnapshotBytes ? [NSData dataWithContentsOfURL:url] : nil;
  if (data == nil) {
    reject(@"missing", GPLocalizedString(@"The autosaved work is no longer there"), AutosaveError(url.path));
    return;
  }
  resolve([data base64EncodedStringWithOptions:0]);
}

/** Removes the day folders before `day` (kept long enough); resolves how many went. */
RCT_EXPORT_METHOD(removeDaysBefore : (NSString *)day resolve : (RCTPromiseResolveBlock)resolve reject : (RCTPromiseRejectBlock)reject)
{
  NSURL *root = [GPAutosave rootFolder];
  if (!IsDayName(day) || root == nil) {
    [self rejectBadFolder:reject];
    return;
  }
  NSUInteger removed = 0;
  for (NSURL *folder in DayFolders(root)) {
    if ([folder.lastPathComponent compare:day] == NSOrderedAscending && [[NSFileManager defaultManager] removeItemAtURL:folder error:nil]) {
      removed += 1;
    }
  }
  resolve(@(removed));
}

/** For each process id, whether it runs (EPERM: it does, out of the sandbox's reach); anything else is not one. */
RCT_EXPORT_METHOD(runningProcesses : (NSArray *)pids resolve : (RCTPromiseResolveBlock)resolve reject : (RCTPromiseRejectBlock)reject)
{
  NSMutableArray<NSNumber *> *running = [NSMutableArray array];
  for (id value in pids) {
    BOOL isId = [value isKindOfClass:[NSNumber class]] && [value intValue] > 0 && [value doubleValue] == [value intValue];
    [running addObject:@(isId && (kill([value intValue], 0) == 0 || errno == EPERM))];
  }
  resolve(running);
}

/** The autosave folder in Finder. */
RCT_EXPORT_METHOD(revealFolder : (RCTPromiseResolveBlock)resolve reject : (RCTPromiseRejectBlock)reject)
{
  NSURL *root = [GPAutosave rootFolder];
  if (root == nil) {
    [self rejectBadFolder:reject];
    return;
  }
  dispatch_async(dispatch_get_main_queue(), ^{
    [[NSWorkspace sharedWorkspace] activateFileViewerSelectingURLs:@[ root ]];
    resolve(nil);
  });
}

@end
