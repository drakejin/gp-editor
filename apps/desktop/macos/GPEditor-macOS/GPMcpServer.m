// The MCP server's bridge to JS (src/native/mcp-server.ts): JS attaches with its limits and gets the app's version and
// whether it runs sandboxed; each request the listener read arrives as an "mcpRequest" event and JS answers it with
// respond(). A JS reload invalidates this module: the core answers what was waiting with 503 and the new module
// attaches again. runCommand() is the command palette's way to Tools ▸ MCP Server ▸ … (GPEditorMcpCommandNotification).

#import <React/RCTBridgeModule.h>
#import <React/RCTEventEmitter.h>

#import "GPEditorNotifications.h"
#import "GPMcpServerCore.h"
#import "GPSandbox.h"

static NSString *const kRequestEvent = @"mcpRequest";
/** The bounds JS's limits are kept within. */
static const NSUInteger kMinBodyBytes = 1024;
static const NSUInteger kMaxBodyBytes = 16 * 1024 * 1024;
static const NSTimeInterval kMinTimeout = 1;
static const NSTimeInterval kMaxTimeout = 120;

@interface GPMcpServer : RCTEventEmitter <RCTBridgeModule, GPMcpRequestSink>
@end

@implementation GPMcpServer {
  BOOL hasListeners;
}

RCT_EXPORT_MODULE();

+ (BOOL)requiresMainQueueSetup
{
  return NO;
}

- (NSArray<NSString *> *)supportedEvents
{
  return @[ kRequestEvent ];
}

- (void)startObserving
{
  hasListeners = YES;
}

- (void)stopObserving
{
  hasListeners = NO;
}

- (BOOL)sendMcpRequest:(NSDictionary *)request
{
  if (!hasListeners) {
    return NO;
  }
  [self sendEventWithName:kRequestEvent body:request];
  return YES;
}

- (void)invalidate
{
  dispatch_async(dispatch_get_main_queue(), ^{
    [[GPMcpServerCore shared] detachSink:self];
  });
  [super invalidate];
}

static double GPClamp(id value, double low, double high, double fallback)
{
  double number = [value isKindOfClass:[NSNumber class]] ? [value doubleValue] : fallback;
  return MIN(high, MAX(low, number));
}

RCT_EXPORT_METHOD(attach : (NSDictionary *)limits resolve : (RCTPromiseResolveBlock)resolve reject : (RCTPromiseRejectBlock)reject)
{
  NSUInteger maxBodyBytes = (NSUInteger)GPClamp(limits[@"maxBodyBytes"], kMinBodyBytes, kMaxBodyBytes, kMinBodyBytes);
  NSTimeInterval timeout = GPClamp(limits[@"responseTimeoutMs"], kMinTimeout * 1000, kMaxTimeout * 1000, kMaxTimeout * 1000) / 1000;
  dispatch_async(dispatch_get_main_queue(), ^{
    [[GPMcpServerCore shared] attachSink:self maxBodyBytes:maxBodyBytes responseTimeout:timeout];
    NSString *version = [NSBundle mainBundle].infoDictionary[@"CFBundleShortVersionString"] ?: @"";
    resolve(@{@"version" : version, @"isSandboxed" : @(GPIsSandboxed())});
  });
}

RCT_EXPORT_METHOD(detach)
{
  dispatch_async(dispatch_get_main_queue(), ^{
    [[GPMcpServerCore shared] detachSink:self];
  });
}

RCT_EXPORT_METHOD(respond : (NSString *)requestId response : (NSDictionary *)response)
{
  [[GPMcpServerCore shared] answerRequest:requestId response:response];
}

/** "start", "stop", "restart", "settings", "log", "copyUrl", "copySetupCommand" (McpServerMenu.swift answers them). */
RCT_EXPORT_METHOD(runCommand : (NSString *)command)
{
  dispatch_async(dispatch_get_main_queue(), ^{
    [[NSNotificationCenter defaultCenter] postNotificationName:GPEditorMcpCommandNotification object:command];
  });
}

@end
