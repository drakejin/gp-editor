// PDF import projects for the JS side: every import gets a folder in ~/Documents/GP Editor Projects (the one place
// in Documents the sandbox lets the app write, see GPEditor.entitlements) holding the original PDF, project.json, the
// per-page transcriptions and the resulting .gp5. Also extracts pages of the PDF (PDFKit) to send them one at a time.

#import <AppKit/AppKit.h>
#import <PDFKit/PDFKit.h>
#import <React/RCTBridgeModule.h>
#import <UniformTypeIdentifiers/UniformTypeIdentifiers.h>
#import <pwd.h>
#import <sys/resource.h>
#import <unistd.h>

static NSString *const kProjectsFolder = @"Documents/GP Editor Projects";
/** Every page is one paid request: a PDF longer than this is refused (split it). */
static const NSUInteger kMaxImportPages = 60;
static const unsigned long long kMaxImportBytes = 100ULL * 1024 * 1024;

@interface GPProjects : NSObject <RCTBridgeModule>
@end

// Documents is often synced by iCloud Drive, which evicts files to "dataless" placeholders. Reading one downloads it
// unless the process inherited a policy that forbids that (a tool that launched the app may have), and the read then
// fails. Projects must stay readable, so the app allows it for itself. (RCT_EXPORT_MODULE owns +load.)
__attribute__((constructor)) static void GPProjectsAllowDatalessDownloads(void)
{
  setiopolicy_np(IOPOL_TYPE_VFS_MATERIALIZE_DATALESS_FILES, IOPOL_SCOPE_PROCESS, IOPOL_MATERIALIZE_DATALESS_FILES_ON);
}

@implementation GPProjects

RCT_EXPORT_MODULE();

+ (BOOL)requiresMainQueueSetup
{
  return NO;
}

- (dispatch_queue_t)methodQueue
{
  return dispatch_get_main_queue();
}

/** ~/Documents/GP Editor Projects in the real home (NSHomeDirectory() is the sandbox container), created when missing. */
+ (nullable NSURL *)projectsRoot
{
  struct passwd *user = getpwuid(getuid());
  if (user == NULL) {
    return nil;
  }
  NSURL *home = [NSURL fileURLWithPath:[NSString stringWithUTF8String:user->pw_dir] isDirectory:YES];
  NSURL *root = [home URLByAppendingPathComponent:kProjectsFolder isDirectory:YES];
  return [[NSFileManager defaultManager] createDirectoryAtURL:root withIntermediateDirectories:YES attributes:nil error:nil] ? root : nil;
}

/**
 * True when the projects root, or anything below it on the way to `url`, is a symbolic link. The checks on JS paths
 * are textual, so a link planted in a project (by another program) could otherwise lead a read or write anywhere.
 */
+ (BOOL)hasSymbolicLinkFrom:(NSURL *)root to:(NSURL *)url
{
  NSArray<NSString *> *rootComponents = root.URLByStandardizingPath.pathComponents;
  NSArray<NSString *> *components = url.URLByStandardizingPath.pathComponents;
  NSURL *current = root.URLByStandardizingPath;
  for (NSUInteger index = rootComponents.count - 1; index < components.count; index++) {
    if (index >= rootComponents.count) {
      current = [current URLByAppendingPathComponent:components[index]];
    }
    NSNumber *isLink = nil;
    if ([current getResourceValue:&isLink forKey:NSURLIsSymbolicLinkKey error:nil] && isLink.boolValue) {
      return YES;
    }
  }
  return NO;
}

/** The project folder when `path` is one directly inside the projects root (no links); nil otherwise (never trust a JS path). */
+ (nullable NSURL *)projectURL:(NSString *)path
{
  NSURL *root = [self projectsRoot];
  NSURL *project = [[NSURL fileURLWithPath:path isDirectory:YES] URLByStandardizingPath];
  BOOL isDirectChild = root != nil && [project.URLByDeletingLastPathComponent.path isEqualToString:root.URLByStandardizingPath.path];
  return isDirectChild && ![self hasSymbolicLinkFrom:root to:project] ? project : nil;
}

/** A file inside the project for a relative path without "..", "~", a leading "/" or links on the way; nil otherwise. */
+ (nullable NSURL *)fileURLInProject:(NSString *)projectPath relativePath:(NSString *)relativePath
{
  NSURL *project = [self projectURL:projectPath];
  BOOL isSafe = relativePath.length > 0 && ![relativePath hasPrefix:@"/"] && ![relativePath hasPrefix:@"~"] &&
                ![relativePath.pathComponents containsObject:@".."];
  NSURL *file = project != nil && isSafe ? [project URLByAppendingPathComponent:relativePath] : nil;
  return file != nil && ![self hasSymbolicLinkFrom:[self projectsRoot] to:file] ? file : nil;
}

+ (NSURL *)uniqueFolderIn:(NSURL *)root named:(NSString *)name
{
  NSString *base = name.length > 0 ? name : @"Untitled";
  NSURL *candidate = [root URLByAppendingPathComponent:base isDirectory:YES];
  for (NSInteger number = 2; [[NSFileManager defaultManager] fileExistsAtPath:candidate.path]; number++) {
    candidate = [root URLByAppendingPathComponent:[NSString stringWithFormat:@"%@ %ld", base, (long)number] isDirectory:YES];
  }
  return candidate;
}

RCT_EXPORT_METHOD(choosePdf : (RCTPromiseResolveBlock)resolve reject : (RCTPromiseRejectBlock)reject)
{
  NSOpenPanel *panel = [NSOpenPanel openPanel];
  panel.canChooseFiles = YES;
  panel.canChooseDirectories = NO;
  panel.allowsMultipleSelection = NO;
  panel.allowedContentTypes = @[ UTTypePDF ];
  panel.message = @"Import a PDF of sheet music or tab — it becomes a project in Documents/GP Editor Projects";
  if ([panel runModal] != NSModalResponseOK || panel.URL == nil) {
    resolve([NSNull null]);
    return;
  }
  resolve(@{@"path" : panel.URL.path, @"name" : panel.URL.lastPathComponent});
}

/** New project folder named after the PDF (a path or file URL), with a copy of it; resolves { path, name, sourceFile, pageCount }. */
RCT_EXPORT_METHOD(createProject : (NSString *)pdfPathOrURL resolve : (RCTPromiseResolveBlock)resolve reject : (RCTPromiseRejectBlock)reject)
{
  NSURL *given = [NSURL URLWithString:pdfPathOrURL];
  NSURL *pdf = (given != nil && given.isFileURL) ? given : [NSURL fileURLWithPath:pdfPathOrURL];
  NSNumber *size = nil;
  [pdf getResourceValue:&size forKey:NSURLFileSizeKey error:nil];
  if (size.unsignedLongLongValue > kMaxImportBytes) {
    reject(@"too_large", @"The PDF is larger than 100 MB", nil);
    return;
  }
  PDFDocument *document = [[PDFDocument alloc] initWithURL:pdf];
  if (document == nil || document.isLocked || document.pageCount == 0) {
    reject(@"bad_pdf", @"The file is not a readable PDF, or it is password protected", nil);
    return;
  }
  if (document.pageCount > kMaxImportPages) {
    NSString *message = [NSString stringWithFormat:@"The PDF has %lu pages; at most %lu can be imported at once (each page is one request to Claude) — split it",
                                                   (unsigned long)document.pageCount, (unsigned long)kMaxImportPages];
    reject(@"too_many_pages", message, nil);
    return;
  }
  NSURL *root = [GPProjects projectsRoot];
  if (root == nil) {
    reject(@"no_projects_folder", @"Could not create Documents/GP Editor Projects", nil);
    return;
  }
  NSString *name = pdf.lastPathComponent.stringByDeletingPathExtension;
  NSURL *folder = [GPProjects uniqueFolderIn:root named:name];
  NSString *sourceFile = pdf.lastPathComponent;
  NSError *error = nil;
  NSFileManager *files = [NSFileManager defaultManager];
  if (![files createDirectoryAtURL:folder withIntermediateDirectories:NO attributes:nil error:&error] ||
      ![files copyItemAtURL:pdf toURL:[folder URLByAppendingPathComponent:sourceFile] error:&error]) {
    reject(@"create_failed", error.localizedDescription ?: @"Could not create the project", error);
    return;
  }
  resolve(@{@"path" : folder.path, @"name" : folder.lastPathComponent, @"sourceFile" : sourceFile, @"pageCount" : @(document.pageCount)});
}

/** Pages first…last (1-based, inclusive) of a PDF in the project, as a new PDF in base64. */
RCT_EXPORT_METHOD(pdfPages : (NSString *)projectPath file : (NSString *)file first : (double)first last : (double)last resolve : (RCTPromiseResolveBlock)resolve reject : (RCTPromiseRejectBlock)reject)
{
  NSURL *url = [GPProjects fileURLInProject:projectPath relativePath:file];
  PDFDocument *source = url == nil ? nil : [[PDFDocument alloc] initWithURL:url];
  NSInteger firstIndex = (NSInteger)first - 1;
  NSInteger lastIndex = (NSInteger)last - 1;
  if (source == nil || firstIndex < 0 || lastIndex < firstIndex || lastIndex >= (NSInteger)source.pageCount) {
    reject(@"bad_pages", @"Those pages are not in the project's PDF", nil);
    return;
  }
  PDFDocument *extract = [PDFDocument new];
  for (NSInteger index = firstIndex; index <= lastIndex; index++) {
    PDFPage *page = [[source pageAtIndex:index] copy];
    [extract insertPage:page atIndex:extract.pageCount];
  }
  NSData *data = [extract dataRepresentation];
  if (data == nil) {
    reject(@"bad_pages", @"Could not extract the pages", nil);
    return;
  }
  resolve([data base64EncodedStringWithOptions:0]);
}

RCT_EXPORT_METHOD(writeText : (NSString *)projectPath file : (NSString *)file text : (NSString *)text resolve : (RCTPromiseResolveBlock)resolve reject : (RCTPromiseRejectBlock)reject)
{
  [self write:[text dataUsingEncoding:NSUTF8StringEncoding] project:projectPath file:file resolve:resolve reject:reject];
}

RCT_EXPORT_METHOD(writeBase64 : (NSString *)projectPath file : (NSString *)file base64 : (NSString *)base64 resolve : (RCTPromiseResolveBlock)resolve reject : (RCTPromiseRejectBlock)reject)
{
  [self write:[[NSData alloc] initWithBase64EncodedString:base64 options:0] project:projectPath file:file resolve:resolve reject:reject];
}

- (void)write:(nullable NSData *)data project:(NSString *)projectPath file:(NSString *)file resolve:(RCTPromiseResolveBlock)resolve reject:(RCTPromiseRejectBlock)reject
{
  NSURL *url = [GPProjects fileURLInProject:projectPath relativePath:file];
  if (url == nil || data == nil) {
    reject(@"bad_path", @"Can only write files inside a project", nil);
    return;
  }
  NSError *error = nil;
  [[NSFileManager defaultManager] createDirectoryAtURL:url.URLByDeletingLastPathComponent withIntermediateDirectories:YES attributes:nil error:nil];
  if (![data writeToURL:url options:NSDataWritingAtomic error:&error]) {
    reject(@"write_failed", error.localizedDescription ?: @"Could not write the file", error);
    return;
  }
  resolve(url.path);
}

/** A text file of the project; null when it does not exist. */
RCT_EXPORT_METHOD(readText : (NSString *)projectPath file : (NSString *)file resolve : (RCTPromiseResolveBlock)resolve reject : (RCTPromiseRejectBlock)reject)
{
  NSURL *url = [GPProjects fileURLInProject:projectPath relativePath:file];
  if (url == nil) {
    reject(@"bad_path", @"Can only read files inside a project", nil);
    return;
  }
  NSString *text = [NSString stringWithContentsOfURL:url encoding:NSUTF8StringEncoding error:nil];
  resolve(text ?: [NSNull null]);
}

/** Every project folder, newest first: { path, name, modified (ms), project (project.json text or null) }. */
RCT_EXPORT_METHOD(listProjects : (RCTPromiseResolveBlock)resolve reject : (RCTPromiseRejectBlock)reject)
{
  NSURL *root = [GPProjects projectsRoot];
  NSArray<NSURL *> *folders = root == nil ? @[] : [[NSFileManager defaultManager] contentsOfDirectoryAtURL:root includingPropertiesForKeys:@[ NSURLContentModificationDateKey, NSURLIsDirectoryKey, NSURLIsSymbolicLinkKey ] options:NSDirectoryEnumerationSkipsHiddenFiles error:nil];
  NSMutableArray *projects = [NSMutableArray array];
  for (NSURL *folder in folders) {
    NSNumber *isDirectory = nil;
    NSNumber *isLink = nil;
    NSDate *modified = nil;
    [folder getResourceValue:&isDirectory forKey:NSURLIsDirectoryKey error:nil];
    [folder getResourceValue:&isLink forKey:NSURLIsSymbolicLinkKey error:nil];
    [folder getResourceValue:&modified forKey:NSURLContentModificationDateKey error:nil];
    if (!isDirectory.boolValue || isLink.boolValue) {
      continue;
    }
    NSString *project = [NSString stringWithContentsOfURL:[folder URLByAppendingPathComponent:@"project.json"] encoding:NSUTF8StringEncoding error:nil];
    [projects addObject:@{
      @"path" : folder.path,
      @"name" : folder.lastPathComponent,
      @"modified" : @((modified ?: [NSDate distantPast]).timeIntervalSince1970 * 1000),
      @"project" : project ?: [NSNull null],
    }];
  }
  [projects sortUsingComparator:^NSComparisonResult(NSDictionary *a, NSDictionary *b) {
    return [b[@"modified"] compare:a[@"modified"]];
  }];
  resolve(projects);
}

RCT_EXPORT_METHOD(revealProject : (NSString *)projectPath resolve : (RCTPromiseResolveBlock)resolve reject : (RCTPromiseRejectBlock)reject)
{
  NSURL *project = [GPProjects projectURL:projectPath];
  if (project == nil) {
    reject(@"bad_path", @"Not a project folder", nil);
    return;
  }
  [[NSWorkspace sharedWorkspace] activateFileViewerSelectingURLs:@[ project ]];
  resolve(nil);
}

@end
