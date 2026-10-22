// Anthropic Messages API for the PDF import. The API key lives in the app's own Application Support folder (inside the
// sandbox container, owner-only permissions) and never goes to JS: JS sends the request body, this module adds the key
// and returns { status, body }. Model and key are app settings, not part of any song or project.

#import <Foundation/Foundation.h>
#import <React/RCTBridgeModule.h>
#import <Security/Security.h>

static NSString *const kMessagesURL = @"https://api.anthropic.com/v1/messages";
static NSString *const kApiVersion = @"2023-06-01";
static NSString *const kKeyFile = @"GPEditor/anthropic-api-key";
static NSString *const kModelDefault = @"GPEditorTranscriptionModel";
/** A page can take minutes to transcribe; the default 60 s would cut it off. */
static const NSTimeInterval kRequestTimeout = 600;

@interface GPAnthropic : NSObject <RCTBridgeModule>
@end

@implementation GPAnthropic {
  NSURLSession *_session;
}

RCT_EXPORT_MODULE();

+ (BOOL)requiresMainQueueSetup
{
  return NO;
}

- (instancetype)init
{
  if (self = [super init]) {
    NSURLSessionConfiguration *configuration = [NSURLSessionConfiguration ephemeralSessionConfiguration];
    configuration.timeoutIntervalForRequest = kRequestTimeout;
    configuration.timeoutIntervalForResource = kRequestTimeout * 2;
    _session = [NSURLSession sessionWithConfiguration:configuration];
  }
  return self;
}

/** True when the app runs in the App Sandbox — always the case for the shipped app (GPEditor.entitlements). */
+ (BOOL)isSandboxed
{
  SecTaskRef task = SecTaskCreateFromSelf(kCFAllocatorDefault);
  if (task == NULL) {
    return YES;
  }
  CFTypeRef value = SecTaskCopyValueForEntitlement(task, CFSTR("com.apple.security.app-sandbox"), NULL);
  CFRelease(task);
  BOOL isSandboxed = value != NULL && CFGetTypeID(value) == CFBooleanGetTypeID() && CFBooleanGetValue((CFBooleanRef)value);
  if (value != NULL) {
    CFRelease(value);
  }
  return isSandboxed;
}

/**
 * The Messages API. Only the unsandboxed QA copy (scripts/qa/run.sh) may point it at a mock, and only on this machine
 * (http://127.0.0.1 or localhost) — the shipped, sandboxed app ignores GPEDITOR_ANTHROPIC_URL, so no environment
 * variable can send the key anywhere else.
 */
+ (NSURL *)messagesURL
{
  NSURL *api = [NSURL URLWithString:kMessagesURL];
  NSString *mock = [NSProcessInfo processInfo].environment[@"GPEDITOR_ANTHROPIC_URL"];
  if (mock.length == 0 || [self isSandboxed]) {
    return api;
  }
  NSURL *mockURL = [NSURL URLWithString:mock];
  BOOL isLoopback = [mockURL.scheme isEqualToString:@"http"] &&
                    ([mockURL.host isEqualToString:@"127.0.0.1"] || [mockURL.host isEqualToString:@"localhost"]);
  return isLoopback ? mockURL : api;
}

+ (nullable NSURL *)keyURL
{
  NSURL *support = [[NSFileManager defaultManager] URLForDirectory:NSApplicationSupportDirectory inDomain:NSUserDomainMask appropriateForURL:nil create:YES error:nil];
  return [support URLByAppendingPathComponent:kKeyFile];
}

+ (nullable NSString *)apiKey
{
  NSURL *url = [self keyURL];
  NSString *key = url == nil ? nil : [NSString stringWithContentsOfURL:url encoding:NSUTF8StringEncoding error:nil];
  NSString *trimmed = [key stringByTrimmingCharactersInSet:[NSCharacterSet whitespaceAndNewlineCharacterSet]];
  return trimmed.length > 0 ? trimmed : nil;
}

RCT_EXPORT_METHOD(hasApiKey : (RCTPromiseResolveBlock)resolve reject : (RCTPromiseRejectBlock)reject)
{
  resolve(@([GPAnthropic apiKey] != nil));
}

RCT_EXPORT_METHOD(setApiKey : (NSString *)key resolve : (RCTPromiseResolveBlock)resolve reject : (RCTPromiseRejectBlock)reject)
{
  NSString *trimmed = [key stringByTrimmingCharactersInSet:[NSCharacterSet whitespaceAndNewlineCharacterSet]];
  NSURL *url = [GPAnthropic keyURL];
  if (trimmed.length == 0 || url == nil) {
    reject(@"bad_key", @"Enter an Anthropic API key", nil);
    return;
  }
  NSFileManager *files = [NSFileManager defaultManager];
  [files createDirectoryAtURL:url.URLByDeletingLastPathComponent withIntermediateDirectories:YES attributes:nil error:nil];
  NSError *error = nil;
  if (![trimmed writeToURL:url atomically:YES encoding:NSUTF8StringEncoding error:&error] ||
      ![files setAttributes:@{NSFilePosixPermissions : @0600} ofItemAtPath:url.path error:&error]) {
    reject(@"save_failed", error.localizedDescription ?: @"Could not save the key", error);
    return;
  }
  resolve(nil);
}

RCT_EXPORT_METHOD(clearApiKey : (RCTPromiseResolveBlock)resolve reject : (RCTPromiseRejectBlock)reject)
{
  NSURL *url = [GPAnthropic keyURL];
  if (url != nil) {
    [[NSFileManager defaultManager] removeItemAtURL:url error:nil];
  }
  resolve(nil);
}

/** The model chosen for transcriptions; null when none was chosen (JS then uses its default). */
RCT_EXPORT_METHOD(model : (RCTPromiseResolveBlock)resolve reject : (RCTPromiseRejectBlock)reject)
{
  resolve([[NSUserDefaults standardUserDefaults] stringForKey:kModelDefault] ?: [NSNull null]);
}

RCT_EXPORT_METHOD(setModel : (NSString *)model resolve : (RCTPromiseResolveBlock)resolve reject : (RCTPromiseRejectBlock)reject)
{
  [[NSUserDefaults standardUserDefaults] setObject:model forKey:kModelDefault];
  resolve(nil);
}

/** POSTs a Messages API request body (JSON text) with the stored key; resolves { status, body } for any HTTP answer. */
RCT_EXPORT_METHOD(send : (NSString *)body resolve : (RCTPromiseResolveBlock)resolve reject : (RCTPromiseRejectBlock)reject)
{
  NSString *key = [GPAnthropic apiKey];
  if (key == nil) {
    reject(@"no_key", @"No Anthropic API key — add one in the import settings", nil);
    return;
  }
  NSMutableURLRequest *request = [NSMutableURLRequest requestWithURL:[GPAnthropic messagesURL]];
  request.HTTPMethod = @"POST";
  request.timeoutInterval = kRequestTimeout;
  [request setValue:key forHTTPHeaderField:@"x-api-key"];
  [request setValue:kApiVersion forHTTPHeaderField:@"anthropic-version"];
  [request setValue:@"application/json" forHTTPHeaderField:@"content-type"];
  request.HTTPBody = [body dataUsingEncoding:NSUTF8StringEncoding];
  NSURLSessionDataTask *task = [_session dataTaskWithRequest:request completionHandler:^(NSData *data, NSURLResponse *response, NSError *error) {
    if (error != nil) {
      reject(@"network", error.localizedDescription, error);
      return;
    }
    NSInteger status = [response isKindOfClass:[NSHTTPURLResponse class]] ? ((NSHTTPURLResponse *)response).statusCode : 0;
    NSString *text = data == nil ? @"" : ([[NSString alloc] initWithData:data encoding:NSUTF8StringEncoding] ?: @"");
    resolve(@{@"status" : @(status), @"body" : text});
  }];
  [task resume];
}

@end
