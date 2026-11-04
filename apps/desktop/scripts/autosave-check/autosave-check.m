// GPAutosave.m's files (autosave-check): every 30 s JS writes a snapshot of each edited tab and its manifest into
// Application Support/GPEditor/Autosave/<day>/<document>/, reads them back at the next launch and removes old days.
// The folder names come from JS: none may reach outside the autosave folder. Run by run.sh with a temporary home.

#import <AppKit/AppKit.h>
#import <React/RCTBridgeModule.h>

@interface GPAutosave : NSObject <RCTBridgeModule>
+ (nullable NSURL *)rootFolder;
- (void)sessionInfo:(RCTPromiseResolveBlock)resolve reject:(RCTPromiseRejectBlock)reject;
- (void)writeSnapshot:(NSString *)folder base64:(NSString *)base64 manifest:(NSString *)manifest resolve:(RCTPromiseResolveBlock)resolve reject:(RCTPromiseRejectBlock)reject;
- (void)writeManifest:(NSString *)folder manifest:(NSString *)manifest resolve:(RCTPromiseResolveBlock)resolve reject:(RCTPromiseRejectBlock)reject;
- (void)listSnapshots:(RCTPromiseResolveBlock)resolve reject:(RCTPromiseRejectBlock)reject;
- (void)readSnapshot:(NSString *)folder resolve:(RCTPromiseResolveBlock)resolve reject:(RCTPromiseRejectBlock)reject;
- (void)removeDaysBefore:(NSString *)day resolve:(RCTPromiseResolveBlock)resolve reject:(RCTPromiseRejectBlock)reject;
- (void)runningProcesses:(NSArray *)pids resolve:(RCTPromiseResolveBlock)resolve reject:(RCTPromiseRejectBlock)reject;
@end

static int failures = 0;

static void Report(BOOL isOk, NSString *name, NSString *detail)
{
  printf("%s %s: %s\n", isOk ? "PASS" : "FAIL", name.UTF8String, detail.UTF8String);
  failures += isOk ? 0 : 1;
}

/** A method's answer: what it resolved, or the reject's code. */
@interface Answer : NSObject
@property(nonatomic, strong) id result;
@property(nonatomic, copy) NSString *code;
@end
@implementation Answer
@end

static Answer *Call(void (^call)(RCTPromiseResolveBlock resolve, RCTPromiseRejectBlock reject))
{
  Answer *answer = [Answer new];
  call(
      ^(id result) {
        answer.result = result ?: [NSNull null];
      },
      ^(NSString *code, NSString *message, NSError *error) {
        answer.code = code;
      });
  return answer;
}

static NSString *Base64(NSString *text)
{
  return [[text dataUsingEncoding:NSUTF8StringEncoding] base64EncodedStringWithOptions:0];
}

static NSString *Contents(NSURL *url)
{
  return [NSString stringWithContentsOfURL:url encoding:NSUTF8StringEncoding error:nil] ?: @"(none)";
}

static NSArray<NSString *> *Names(NSURL *folder)
{
  return [[[NSFileManager defaultManager] contentsOfDirectoryAtPath:folder.path error:nil] sortedArrayUsingSelector:@selector(compare:)] ?: @[];
}

/** Application Support must be inside the temporary home, or the check would write into the user's. */
static BOOL CheckHome(void)
{
  NSString *home = NSProcessInfo.processInfo.environment[@"CFFIXED_USER_HOME"];
  NSURL *root = [GPAutosave rootFolder];
  BOOL isTemporary = home.length > 0 && [root.path.stringByResolvingSymlinksInPath hasPrefix:home.stringByResolvingSymlinksInPath];
  Report(isTemporary, @"the autosave folder is inside the temporary home", root.path ?: @"(none)");
  Report([root.path hasSuffix:@"Application Support/GPEditor/Autosave"], @"the autosave folder is Application Support/GPEditor/Autosave", root.path ?: @"(none)");
  return isTemporary;
}

static void CheckWrites(GPAutosave *autosave, NSURL *root)
{
  NSString *folder = @"2026-11-04/session-tab-1";
  Answer *first = Call(^(RCTPromiseResolveBlock resolve, RCTPromiseRejectBlock reject) {
    [autosave writeSnapshot:folder base64:Base64(@"song one") manifest:@"{\"n\":1}" resolve:resolve reject:reject];
  });
  NSURL *document = [root URLByAppendingPathComponent:folder isDirectory:YES];
  Report(first.code == nil && [Contents([document URLByAppendingPathComponent:@"snapshot.gp"]) isEqualToString:@"song one"], @"a snapshot is written", Contents([document URLByAppendingPathComponent:@"snapshot.gp"]));
  Report([Contents([document URLByAppendingPathComponent:@"manifest.json"]) isEqualToString:@"{\"n\":1}"], @"its manifest beside it", Contents([document URLByAppendingPathComponent:@"manifest.json"]));
  Answer *second = Call(^(RCTPromiseResolveBlock resolve, RCTPromiseRejectBlock reject) {
    [autosave writeSnapshot:folder base64:Base64(@"song two") manifest:@"{\"n\":2}" resolve:resolve reject:reject];
  });
  BOOL isReplaced = second.code == nil && [Contents([document URLByAppendingPathComponent:@"snapshot.gp"]) isEqualToString:@"song two"];
  Report(isReplaced && [Names(document) isEqualToArray:@[ @"manifest.json", @"snapshot.gp" ]], @"the next one replaces it, nothing else left in the folder", [Names(document) componentsJoinedByString:@", "]);
  Answer *manifest = Call(^(RCTPromiseResolveBlock resolve, RCTPromiseRejectBlock reject) {
    [autosave writeManifest:folder manifest:@"{\"n\":3}" resolve:resolve reject:reject];
  });
  Report(manifest.code == nil && [Contents([document URLByAppendingPathComponent:@"manifest.json"]) isEqualToString:@"{\"n\":3}"], @"a manifest is rewritten alone", Contents([document URLByAppendingPathComponent:@"manifest.json"]));
  Answer *orphan = Call(^(RCTPromiseResolveBlock resolve, RCTPromiseRejectBlock reject) {
    [autosave writeManifest:@"2026-11-04/nothing-here" manifest:@"{}" resolve:resolve reject:reject];
  });
  Report(orphan.code != nil && ![[NSFileManager defaultManager] fileExistsAtPath:[root URLByAppendingPathComponent:@"2026-11-04/nothing-here"].path], @"no manifest without its snapshot", orphan.code ?: @"written");
  Answer *badData = Call(^(RCTPromiseResolveBlock resolve, RCTPromiseRejectBlock reject) {
    [autosave writeSnapshot:@"2026-11-04/bad-data" base64:@"%%%" manifest:@"{}" resolve:resolve reject:reject];
  });
  Report(badData.code != nil, @"bytes that are no base64 are refused", badData.code ?: @"written");
}

static void CheckFolderNames(GPAutosave *autosave, NSURL *root)
{
  NSArray<NSString *> *bad = @[ @"", @"../escape", @"2026-11-04", @"2026-11-04/../../escape", @"2026-11-04/a/b", @"notes/abc", @"2026-11-04/a b", @"2026-11-04/..", @"/tmp/x" ];
  NSUInteger refused = 0;
  for (NSString *folder in bad) {
    Answer *write = Call(^(RCTPromiseResolveBlock resolve, RCTPromiseRejectBlock reject) {
      [autosave writeSnapshot:folder base64:Base64(@"x") manifest:@"{}" resolve:resolve reject:reject];
    });
    Answer *read = Call(^(RCTPromiseResolveBlock resolve, RCTPromiseRejectBlock reject) {
      [autosave readSnapshot:folder resolve:resolve reject:reject];
    });
    refused += [write.code isEqualToString:@"bad_folder"] && [read.code isEqualToString:@"bad_folder"] ? 1 : 0;
  }
  NSURL *outside = [[root URLByDeletingLastPathComponent] URLByAppendingPathComponent:@"escape"];
  Report(refused == bad.count && ![[NSFileManager defaultManager] fileExistsAtPath:outside.path], @"folder names that are no <day>/<document> are refused", [NSString stringWithFormat:@"%lu of %lu", (unsigned long)refused, (unsigned long)bad.count]);
}

/** A document folder (or a day's) that is a link elsewhere is neither written nor read through. */
static void CheckLinks(GPAutosave *autosave, NSURL *root)
{
  NSFileManager *files = [NSFileManager defaultManager];
  NSURL *elsewhere = [[root URLByDeletingLastPathComponent] URLByAppendingPathComponent:@"elsewhere" isDirectory:YES];
  [files createDirectoryAtURL:elsewhere withIntermediateDirectories:YES attributes:nil error:nil];
  [files createSymbolicLinkAtURL:[root URLByAppendingPathComponent:@"2026-11-04/linked-doc"] withDestinationURL:elsewhere error:nil];
  [files createSymbolicLinkAtURL:[root URLByAppendingPathComponent:@"2026-11-05"] withDestinationURL:elsewhere error:nil];
  NSUInteger refused = 0;
  for (NSString *folder in @[ @"2026-11-04/linked-doc", @"2026-11-05/doc" ]) {
    Answer *write = Call(^(RCTPromiseResolveBlock resolve, RCTPromiseRejectBlock reject) {
      [autosave writeSnapshot:folder base64:Base64(@"x") manifest:@"{}" resolve:resolve reject:reject];
    });
    Answer *read = Call(^(RCTPromiseResolveBlock resolve, RCTPromiseRejectBlock reject) {
      [autosave readSnapshot:folder resolve:resolve reject:reject];
    });
    refused += write.code != nil && read.code != nil ? 1 : 0;
  }
  Report(refused == 2 && Names(elsewhere).count == 0, @"a linked day or document folder is neither written nor read through", [Names(elsewhere) componentsJoinedByString:@", "]);
  [files removeItemAtURL:[root URLByAppendingPathComponent:@"2026-11-04/linked-doc"] error:nil];
  [files removeItemAtURL:[root URLByAppendingPathComponent:@"2026-11-05"] error:nil];
  [files removeItemAtURL:elsewhere error:nil];
}

static void CheckList(GPAutosave *autosave, NSURL *root)
{
  NSFileManager *files = [NSFileManager defaultManager];
  NSURL *odd = [root URLByAppendingPathComponent:@"notes/doc" isDirectory:YES];
  [files createDirectoryAtURL:odd withIntermediateDirectories:YES attributes:nil error:nil];
  [@"{}" writeToURL:[odd URLByAppendingPathComponent:@"manifest.json"] atomically:YES encoding:NSUTF8StringEncoding error:nil];
  NSURL *huge = [root URLByAppendingPathComponent:@"2026-11-03/huge" isDirectory:YES];
  [files createDirectoryAtURL:huge withIntermediateDirectories:YES attributes:nil error:nil];
  [[@"" stringByPaddingToLength:70000 withString:@" " startingAtIndex:0] writeToURL:[huge URLByAppendingPathComponent:@"manifest.json"] atomically:YES encoding:NSUTF8StringEncoding error:nil];
  NSURL *linked = [root URLByAppendingPathComponent:@"2026-11-03/linked"];
  [files createSymbolicLinkAtURL:linked withDestinationURL:[root URLByAppendingPathComponent:@"2026-11-04/session-tab-1"] error:nil];
  Answer *list = Call(^(RCTPromiseResolveBlock resolve, RCTPromiseRejectBlock reject) {
    [autosave listSnapshots:resolve reject:reject];
  });
  NSArray *entries = [list.result isKindOfClass:[NSArray class]] ? list.result : @[];
  NSArray *folders = [entries valueForKey:@"folder"];
  BOOL isOnlyGood = [folders isEqualToArray:@[ @"2026-11-04/session-tab-1" ]] && [[entries.firstObject valueForKey:@"manifest"] isEqualToString:@"{\"n\":3}"];
  Report(isOnlyGood, @"the list holds only well-named folders' manifests (no odd day, no link, none too long)", [folders componentsJoinedByString:@", "]);
  Answer *read = Call(^(RCTPromiseResolveBlock resolve, RCTPromiseRejectBlock reject) {
    [autosave readSnapshot:@"2026-11-04/session-tab-1" resolve:resolve reject:reject];
  });
  Report([read.result isEqual:Base64(@"song two")], @"a snapshot is read back as base64", [read.result description] ?: read.code);
  Answer *missing = Call(^(RCTPromiseResolveBlock resolve, RCTPromiseRejectBlock reject) {
    [autosave readSnapshot:@"2026-11-04/gone" resolve:resolve reject:reject];
  });
  Report(missing.code != nil, @"a snapshot that is not there is refused", missing.code ?: @"read");
  [files removeItemAtURL:linked error:nil];
}

static void CheckRemoval(GPAutosave *autosave, NSURL *root)
{
  NSFileManager *files = [NSFileManager defaultManager];
  for (NSString *day in @[ @"2026-10-28", @"2026-10-31", @"2026-11-01" ]) {
    [files createDirectoryAtURL:[root URLByAppendingPathComponent:[day stringByAppendingString:@"/doc"]] withIntermediateDirectories:YES attributes:nil error:nil];
  }
  Answer *removed = Call(^(RCTPromiseResolveBlock resolve, RCTPromiseRejectBlock reject) {
    [autosave removeDaysBefore:@"2026-11-01" resolve:resolve reject:reject];
  });
  NSArray<NSString *> *left = Names(root);
  BOOL isKept = [left isEqualToArray:@[ @"2026-11-01", @"2026-11-03", @"2026-11-04", @"notes" ]];
  Report([removed.result isEqual:@2] && isKept, @"days before the oldest kept are removed, the rest (and other names) kept", [left componentsJoinedByString:@", "]);
  Answer *bad = Call(^(RCTPromiseResolveBlock resolve, RCTPromiseRejectBlock reject) {
    [autosave removeDaysBefore:@"9999" resolve:resolve reject:reject];
  });
  Report(bad.code != nil && [Names(root) isEqualToArray:left], @"no removal for a day that is not one", bad.code ?: @"removed");
}

static void CheckProcesses(GPAutosave *autosave)
{
  NSTask *task = [NSTask launchedTaskWithExecutableURL:[NSURL fileURLWithPath:@"/usr/bin/true"] arguments:@[] error:nil terminationHandler:nil];
  [task waitUntilExit];
  NSNumber *ended = @(task.processIdentifier);
  Answer *running = Call(^(RCTPromiseResolveBlock resolve, RCTPromiseRejectBlock reject) {
    [autosave runningProcesses:@[ @(getpid()), ended, @"x" ] resolve:resolve reject:reject];
  });
  Report([running.result isEqual:@[ @YES, @NO, @NO ]], @"a running process is told from one that ended", [running.result description] ?: running.code);
  Answer *mine = Call(^(RCTPromiseResolveBlock resolve, RCTPromiseRejectBlock reject) {
    [autosave sessionInfo:resolve reject:reject];
  });
  NSString *bootId = [mine.result isKindOfClass:[NSDictionary class]] ? mine.result[@"bootId"] : nil;
  BOOL isSession = [mine.result isKindOfClass:[NSDictionary class]] && [mine.result[@"processId"] isEqual:@(getpid())] && [bootId isKindOfClass:[NSString class]] && [NSUUID.alloc initWithUUIDString:bootId] != nil;
  Report(isSession, @"the app's own process id and this boot's id (a session from another boot is over, whatever its pid)", [mine.result description] ?: mine.code);
}

int main(void)
{
  @autoreleasepool {
    if (!CheckHome()) {
      printf("FAILED: not run outside a temporary home\n");
      return 1;
    }
    GPAutosave *autosave = [GPAutosave new];
    NSURL *root = [GPAutosave rootFolder];
    CheckWrites(autosave, root);
    CheckFolderNames(autosave, root);
    CheckLinks(autosave, root);
    CheckList(autosave, root);
    CheckRemoval(autosave, root);
    CheckProcesses(autosave);
    printf("%s: %d failed\n", failures == 0 ? "OK" : "FAILED", failures);
  }
  return failures == 0 ? 0 : 1;
}
