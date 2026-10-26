#import "GPMcpServerCore.h"

#import "GPAppStrings.h"
#import "GPEditorNotifications.h"
#import "GPMcpListener.h"
#import "GPMcpLog.h"
#import "GPMcpSettings.h"

/** A pause between stopping and starting again, for the old socket to close before the port is taken again. */
static const NSTimeInterval kRestartPause = 0.3;
/** The body a request may have while JS is not attached yet (it is held): initialize and tools/list are far smaller. */
static const NSUInteger kHeldBodyBytes = 64 * 1024;
/** How long a request read before JS attaches waits for it (the window opening, a reload). */
static const NSTimeInterval kDefaultHoldTimeout = 20;

/** A request on its way to JS: held until JS attaches, then sent and waiting for JS's answer. */
@interface GPMcpPending : NSObject
@property(nonatomic, copy) GPMcpRespond respond;
@property(nonatomic) CFAbsoluteTime start;
@property(nonatomic, copy) NSString *client;
@property(nonatomic, copy) NSString *request;
/** The `mcpRequest` event JS gets. */
@property(nonatomic, copy) NSDictionary *event;
@property(nonatomic) BOOL isSent;
/** When the server answers it itself (503 held too long, 504 JS too slow); a later deadline replaces an earlier one. */
@property(nonatomic) CFAbsoluteTime deadline;
@end

@implementation GPMcpPending
@end

@interface GPMcpServerCore ()
@property(nonatomic, readwrite) GPMcpServerState state;
@property(nonatomic, readwrite) NSInteger port;
@property(nonatomic, copy, readwrite, nullable) NSString *failure;
/** JS, while it is attached. */
@property(atomic, weak, nullable) id<GPMcpRequestSink> sink;
@property(atomic) NSUInteger maxBodyBytes;
@property(atomic) NSTimeInterval responseTimeout;
@end

@implementation GPMcpServerCore {
  dispatch_queue_t _queue;
  GPMcpListener *_listener;
  /** Requests JS has not answered, by id (on `_queue` only). */
  NSMutableDictionary<NSString *, GPMcpPending *> *_pending;
}

+ (instancetype)shared
{
  static GPMcpServerCore *core;
  static dispatch_once_t once;
  dispatch_once(&once, ^{
    core = [GPMcpServerCore new];
  });
  return core;
}

- (instancetype)init
{
  if (self = [super init]) {
    _queue = dispatch_queue_create("com.drakejin.gpeditor.mcp-server", DISPATCH_QUEUE_SERIAL);
    _pending = [NSMutableDictionary dictionary];
    _port = GPMcpSettings.effectivePort;
    _holdTimeout = kDefaultHoldTimeout;
  }
  return self;
}

- (NSString *)endpointURL
{
  return [NSString stringWithFormat:@"http://127.0.0.1:%ld/mcp", (long)self.port];
}

- (NSString *)setupCommand
{
  return [NSString stringWithFormat:@"claude mcp add --transport http gp-editor %@", self.endpointURL];
}

- (BOOL)isRunning
{
  return self.state == GPMcpServerRunning;
}

- (NSString *)statusText
{
  switch (self.state) {
    case GPMcpServerRunning:
      return GPLocalizedFormat(@"Running · %@", self.endpointURL);
    case GPMcpServerStarting:
      return GPLocalizedString(@"Starting…");
    case GPMcpServerFailed:
      return GPLocalizedFormat(@"Error: %@", self.failure ?: @"");
    case GPMcpServerStopped:
      return GPLocalizedString(@"Stopped");
  }
}

- (void)changeState:(GPMcpServerState)state failure:(nullable NSString *)failure
{
  self.state = state;
  self.failure = failure;
  [[NSNotificationCenter defaultCenter] postNotificationName:GPEditorMcpServerStateNotification object:nil];
}

- (void)startAtLaunch
{
  if (GPMcpSettings.isEnabledAtLaunch) {
    [self start];
  }
}

- (void)start
{
  if (_listener != nil) {
    return;
  }
  self.port = GPMcpSettings.effectivePort;
  GPMcpListener *listener = [[GPMcpListener alloc] initWithPort:(uint16_t)self.port queue:_queue];
  listener.maxBodyBytes = self.sink == nil ? kHeldBodyBytes : self.maxBodyBytes;
  __weak GPMcpServerCore *weakSelf = self;
  listener.handler = ^(GPMcpRequestHead *head, NSData *body, GPMcpRespond respond) {
    [weakSelf take:head body:body respond:respond];
  };
  listener.onRefusal = ^(GPMcpRequestHead *_Nullable head, NSInteger status, NSString *reason) {
    NSString *request = head == nil ? @"—" : [NSString stringWithFormat:@"%@ %@", head.method, head.target];
    [[GPMcpLog shared] addRequestFrom:head.headers[@"user-agent"] ?: @"unknown" request:request durationMs:0 outcome:[NSString stringWithFormat:@"refused %ld: %@", (long)status, reason] isError:YES];
  };
  __weak GPMcpListener *weakListener = listener;
  listener.onStateChange = ^(GPMcpListenerState state, NSString *_Nullable failure) {
    dispatch_async(dispatch_get_main_queue(), ^{
      [weakSelf listener:weakListener changedTo:state failure:failure];
    });
  };
  _listener = listener;
  [self changeState:GPMcpServerStarting failure:nil];
  [listener start];
}

- (void)listener:(nullable GPMcpListener *)listener changedTo:(GPMcpListenerState)state failure:(nullable NSString *)failure
{
  if (listener == nil || listener != _listener) {
    return;
  }
  if (state == GPMcpListenerReady) {
    [self changeState:GPMcpServerRunning failure:nil];
    [[GPMcpLog shared] addEvent:GPLocalizedFormat(@"Started on %@", self.endpointURL) isError:NO];
  } else if (state == GPMcpListenerFailed) {
    _listener = nil;
    NSString *reason = GPLocalizedFormat(@"port %ld is not available (%@)", (long)self.port, failure ?: @"");
    [self changeState:GPMcpServerFailed failure:reason];
    [[GPMcpLog shared] addEvent:GPLocalizedFormat(@"Could not start: %@", reason) isError:YES];
  }
}

- (void)stop
{
  GPMcpListener *listener = _listener;
  _listener = nil;
  [listener stop];
  [self answerPending:503 reason:@"Service unavailable: the MCP server stopped"];
  if (self.state != GPMcpServerStopped) {
    BOOL wasListening = self.state == GPMcpServerRunning || self.state == GPMcpServerStarting;
    [self changeState:GPMcpServerStopped failure:nil];
    if (wasListening) {
      [[GPMcpLog shared] addEvent:GPLocalizedString(@"Stopped") isError:NO];
    }
  }
}

- (void)restart
{
  [self stop];
  dispatch_after(dispatch_time(DISPATCH_TIME_NOW, (int64_t)(kRestartPause * NSEC_PER_SEC)), dispatch_get_main_queue(), ^{
    [self start];
  });
}

#pragma mark - Requests

- (void)attachSink:(id<GPMcpRequestSink>)sink maxBodyBytes:(NSUInteger)maxBodyBytes responseTimeout:(NSTimeInterval)responseTimeout
{
  self.maxBodyBytes = maxBodyBytes;
  self.responseTimeout = responseTimeout;
  self.sink = sink;
  _listener.maxBodyBytes = maxBodyBytes;
  dispatch_async(_queue, ^{
    [self sendHeld];
  });
}

- (void)detachSink:(id<GPMcpRequestSink>)sink
{
  if (self.sink != sink && self.sink != nil) {
    return;
  }
  self.sink = nil;
  _listener.maxBodyBytes = kHeldBodyBytes;
  dispatch_async(_queue, ^{
    [self finishSent:503 reason:@"Service unavailable: GP Editor's window was reloaded; send the request again"];
  });
}

/** On `_queue`: a request read whole goes to JS, which answers it through answerRequest:response:; held until JS attaches. */
- (void)take:(GPMcpRequestHead *)head body:(NSData *)body respond:(GPMcpRespond)respond
{
  NSString *text = [[NSString alloc] initWithData:body encoding:NSUTF8StringEncoding];
  NSString *client = head.headers[@"user-agent"] ?: @"unknown";
  NSString *request = [NSString stringWithFormat:@"%@ %@", head.method, head.target];
  if (text == nil) {
    NSString *reason = @"Bad request: the body is not UTF-8";
    respond(400, @{@"content-type" : @"application/json"}, GPMcpErrorBody(-32700, reason));
    [[GPMcpLog shared] addRequestFrom:client request:request durationMs:0 outcome:[NSString stringWithFormat:@"refused 400: %@", reason] isError:YES];
    return;
  }
  NSString *requestId = [NSUUID UUID].UUIDString;
  GPMcpPending *pending = [GPMcpPending new];
  pending.respond = respond;
  pending.start = CFAbsoluteTimeGetCurrent();
  pending.client = client;
  pending.request = request;
  pending.event = @{@"id" : requestId, @"method" : head.method, @"target" : head.target, @"headers" : head.headers, @"body" : text, @"port" : @(self.port)};
  _pending[requestId] = pending;
  if (![self send:requestId]) {
    [self expire:requestId after:self.holdTimeout status:503 reason:@"Service unavailable: GP Editor's window did not open in time; try again"];
  }
}

/** On `_queue`: the request to JS, now that it is attached; NO when it is not (the request waits). */
- (BOOL)send:(NSString *)requestId
{
  GPMcpPending *pending = _pending[requestId];
  id<GPMcpRequestSink> sink = self.sink;
  if (pending == nil || pending.isSent || sink == nil || ![sink sendMcpRequest:pending.event]) {
    return NO;
  }
  pending.isSent = YES;
  [self expire:requestId after:self.responseTimeout status:504 reason:@"Gateway timeout: GP Editor did not answer in time (is a panel or alert open in its window?)"];
  return YES;
}

/** On `_queue`: what waited for JS goes to it. */
- (void)sendHeld
{
  for (NSString *requestId in [_pending.allKeys copy]) {
    [self send:requestId];
  }
}

/** On `_queue`: the request is answered with `status` after `seconds`, unless it was answered or given more time. */
- (void)expire:(NSString *)requestId after:(NSTimeInterval)seconds status:(NSInteger)status reason:(NSString *)reason
{
  CFAbsoluteTime deadline = CFAbsoluteTimeGetCurrent() + seconds;
  _pending[requestId].deadline = deadline;
  __weak GPMcpServerCore *weakSelf = self;
  dispatch_after(dispatch_time(DISPATCH_TIME_NOW, (int64_t)(seconds * NSEC_PER_SEC)), _queue, ^{
    GPMcpServerCore *core = weakSelf;
    if (core != nil && core->_pending[requestId].deadline == deadline) {
      [core finish:requestId status:status reason:reason];
    }
  });
}

/** On `_queue`: answers a waiting request with an error the server gives itself. */
- (void)finish:(NSString *)requestId status:(NSInteger)status reason:(NSString *)reason
{
  GPMcpPending *pending = _pending[requestId];
  if (pending == nil) {
    return;
  }
  [_pending removeObjectForKey:requestId];
  pending.respond(status, @{@"content-type" : @"application/json"}, GPMcpErrorBody(-32603, reason));
  NSInteger duration = (NSInteger)((CFAbsoluteTimeGetCurrent() - pending.start) * 1000);
  [[GPMcpLog shared] addRequestFrom:pending.client request:pending.request durationMs:duration outcome:[NSString stringWithFormat:@"error %ld: %@", (long)status, reason] isError:YES];
}

/** On `_queue`: the requests JS was given (and will not answer now) get `status`; the ones still waiting go on waiting. */
- (void)finishSent:(NSInteger)status reason:(NSString *)reason
{
  for (NSString *requestId in [_pending.allKeys copy]) {
    if (_pending[requestId].isSent) {
      [self finish:requestId status:status reason:reason];
    }
  }
}

- (void)answerPending:(NSInteger)status reason:(NSString *)reason
{
  dispatch_async(_queue, ^{
    for (NSString *requestId in [self->_pending.allKeys copy]) {
      [self finish:requestId status:status reason:reason];
    }
  });
}

static NSString *GPMcpString(id value, NSString *fallback)
{
  return [value isKindOfClass:[NSString class]] ? value : fallback;
}

- (void)answerRequest:(NSString *)requestId response:(NSDictionary *)response
{
  dispatch_async(_queue, ^{
    GPMcpPending *pending = self->_pending[requestId];
    if (pending == nil) {
      return;
    }
    [self->_pending removeObjectForKey:requestId];
    NSInteger status = [response[@"status"] isKindOfClass:[NSNumber class]] ? [response[@"status"] integerValue] : 500;
    NSMutableDictionary<NSString *, NSString *> *headers = [NSMutableDictionary dictionary];
    NSDictionary *given = [response[@"headers"] isKindOfClass:[NSDictionary class]] ? response[@"headers"] : @{};
    [given enumerateKeysAndObjectsUsingBlock:^(id name, id value, BOOL *stop) {
      if ([name isKindOfClass:[NSString class]] && [value isKindOfClass:[NSString class]]) {
        headers[name] = value;
      }
    }];
    NSData *body = [GPMcpString(response[@"body"], @"") dataUsingEncoding:NSUTF8StringEncoding];
    pending.respond(status, headers, body);
    NSInteger duration = (NSInteger)((CFAbsoluteTimeGetCurrent() - pending.start) * 1000);
    NSString *client = GPMcpString(response[@"client"], pending.client);
    BOOL isError = [response[@"isError"] boolValue];
    [[GPMcpLog shared] addRequestFrom:client request:GPMcpString(response[@"request"], pending.request) durationMs:duration outcome:GPMcpString(response[@"outcome"], @"") isError:isError];
  });
}

@end
