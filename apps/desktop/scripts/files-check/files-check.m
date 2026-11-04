// GPFiles.m's writes (files-check): Save and the exports write through writeFile / writeTextFile. An atomic write
// replaces the file, so a read-only one (permissions 444, or locked in Finder) was overwritten without a word in
// 0.21's QA (⌘S on a 444 .gp5): it must be refused, the file left as it was, and other files written as before.

#import <AppKit/AppKit.h>
#import <React/RCTEventEmitter.h>
#import <sys/stat.h>

@implementation RCTEventEmitter
- (void)sendEventWithName:(NSString *)name body:(id)body
{
}
- (NSArray<NSString *> *)supportedEvents
{
  return @[];
}
- (void)startObserving
{
}
- (void)stopObserving
{
}
@end

/** The recent files' bookmark access: here the file is reached directly. */
void GPWithRecentFileAccess(NSString *path, NS_NOESCAPE void (^work)(void))
{
  work();
}

@interface GPFiles : RCTEventEmitter
+ (NSDictionary *)writeBase64:(NSString *)base64 toPath:(NSString *)path error:(NSError **)error;
- (void)writeTextFile:(NSString *)path text:(NSString *)text resolve:(RCTPromiseResolveBlock)resolve reject:(RCTPromiseRejectBlock)reject;
@end

static int failures = 0;

static void Report(BOOL isOk, NSString *name, NSString *detail)
{
  printf("%s %s: %s\n", isOk ? "PASS" : "FAIL", name.UTF8String, detail.UTF8String);
  failures += isOk ? 0 : 1;
}

static NSString *Contents(NSString *path)
{
  return [NSString stringWithContentsOfFile:path encoding:NSUTF8StringEncoding error:nil] ?: @"(none)";
}

/** A file holding "old", with these permissions (and Finder's lock). */
static NSString *MakeFile(NSString *folder, NSString *name, mode_t mode, BOOL isLocked)
{
  NSString *path = [folder stringByAppendingPathComponent:name];
  [@"old" writeToFile:path atomically:NO encoding:NSUTF8StringEncoding error:nil];
  chmod(path.fileSystemRepresentation, mode);
  if (isLocked) {
    chflags(path.fileSystemRepresentation, UF_IMMUTABLE);
  }
  return path;
}

static void CheckBytes(NSString *folder)
{
  NSString *readOnly = MakeFile(folder, @"ro.gp5", 0444, NO);
  NSString *locked = MakeFile(folder, @"locked.gp5", 0644, YES);
  NSString *writable = MakeFile(folder, @"rw.gp5", 0644, NO);
  NSString *fresh = [folder stringByAppendingPathComponent:@"new.gp5"];
  NSString *base64 = [[@"new" dataUsingEncoding:NSUTF8StringEncoding] base64EncodedStringWithOptions:0];
  NSError *error = nil;
  NSDictionary *refused = [GPFiles writeBase64:base64 toPath:readOnly error:&error];
  struct stat info;
  stat(readOnly.fileSystemRepresentation, &info);
  Report(refused == nil && [error.localizedDescription containsString:@"read-only"], @"a read-only file", error.localizedDescription ?: @"written");
  Report([Contents(readOnly) isEqualToString:@"old"] && (info.st_mode & 0777) == 0444, @"a read-only file left as it was", Contents(readOnly));
  error = nil;
  NSDictionary *lockedWrite = [GPFiles writeBase64:base64 toPath:locked error:&error];
  Report(lockedWrite == nil && [Contents(locked) isEqualToString:@"old"], @"a file locked in Finder", error.localizedDescription ?: @"written");
  Report([GPFiles writeBase64:base64 toPath:writable error:nil] != nil && [Contents(writable) isEqualToString:@"new"], @"a writable file", Contents(writable));
  Report([GPFiles writeBase64:base64 toPath:fresh error:nil] != nil && [Contents(fresh) isEqualToString:@"new"], @"a new file", Contents(fresh));
  chflags(locked.fileSystemRepresentation, 0);
}

static void CheckText(NSString *folder)
{
  NSString *readOnly = MakeFile(folder, @"ro.txt", 0444, NO);
  NSString *writable = MakeFile(folder, @"rw.txt", 0644, NO);
  GPFiles *files = [[GPFiles alloc] init];
  __block NSString *message = nil;
  [files writeTextFile:readOnly text:@"new" resolve:^(id result) {
    message = @"written";
  } reject:^(NSString *code, NSString *text, NSError *error) {
    message = text;
  }];
  Report([message containsString:@"read-only"] && [Contents(readOnly) isEqualToString:@"old"], @"an export onto a read-only file", message ?: @"(no answer)");
  __block BOOL isWritten = NO;
  [files writeTextFile:writable text:@"new" resolve:^(id result) {
    isWritten = YES;
  } reject:^(NSString *code, NSString *text, NSError *error) {
  }];
  Report(isWritten && [Contents(writable) isEqualToString:@"new"], @"an export onto a writable file", Contents(writable));
}

int main(void)
{
  @autoreleasepool {
    NSString *folder = [NSTemporaryDirectory() stringByAppendingPathComponent:[NSString stringWithFormat:@"files-check-%d", getpid()]];
    [[NSFileManager defaultManager] createDirectoryAtPath:folder withIntermediateDirectories:YES attributes:nil error:nil];
    CheckBytes(folder);
    CheckText(folder);
    [[NSFileManager defaultManager] removeItemAtPath:folder error:nil];
    printf("%s: %d failed\n", failures == 0 ? "OK" : "FAILED", failures);
  }
  return failures == 0 ? 0 : 1;
}
