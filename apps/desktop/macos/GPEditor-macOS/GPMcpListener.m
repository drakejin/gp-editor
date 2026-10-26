#import "GPMcpListener.h"

#import <Network/Network.h>
#include <arpa/inet.h>
#include <netinet/in.h>
#include <string.h>

/** One connection and the request read from it so far. */
@interface GPMcpConnection : NSObject
@property(nonatomic, strong) nw_connection_t connection;
@property(nonatomic, strong) NSMutableData *buffer;
@property(nonatomic, strong, nullable) GPMcpRequestHead *head;
@property(nonatomic, strong, nullable) dispatch_source_t readTimer;
/** The request went to the handler. */
@property(nonatomic) BOOL isHandedOver;
/** An answer was sent (once). */
@property(nonatomic) BOOL isAnswered;
@property(nonatomic) BOOL hasSentContinue;
@end

@implementation GPMcpConnection
@end

/** Whether a peer is this Mac's loopback (127.0.0.0/8, ::1, or 127.x mapped into IPv6). */
static BOOL GPMcpIsLoopback(nw_endpoint_t endpoint)
{
  const struct sockaddr *address = endpoint == nil || nw_endpoint_get_type(endpoint) != nw_endpoint_type_address ? NULL : nw_endpoint_get_address(endpoint);
  if (address == NULL) {
    return NO;
  }
  if (address->sa_family == AF_INET) {
    return (ntohl(((const struct sockaddr_in *)address)->sin_addr.s_addr) >> 24) == 127;
  }
  if (address->sa_family != AF_INET6) {
    return NO;
  }
  const struct in6_addr *ip = &((const struct sockaddr_in6 *)address)->sin6_addr;
  return IN6_IS_ADDR_LOOPBACK(ip) || (IN6_IS_ADDR_V4MAPPED(ip) && ip->s6_addr[12] == 127);
}

/** Why the socket could not listen, in words ("Address already in use"). */
static NSString *GPMcpFailure(nw_error_t error)
{
  if (error == nil) {
    return @"unknown error";
  }
  int code = nw_error_get_error_code(error);
  return nw_error_get_error_domain(error) == nw_error_domain_posix ? [NSString stringWithUTF8String:strerror(code)] : [NSString stringWithFormat:@"network error %d", code];
}

@implementation GPMcpListener {
  dispatch_queue_t _queue;
  nw_listener_t _listener;
  NSMutableSet<GPMcpConnection *> *_connections;
}

- (instancetype)initWithPort:(uint16_t)port queue:(dispatch_queue_t)queue
{
  if (self = [super init]) {
    _port = port;
    _queue = queue;
    _connections = [NSMutableSet set];
    _readTimeout = 10;
    _maxConnections = 64;
    _loopbackNames = @[];
  }
  return self;
}

- (void)report:(GPMcpListenerState)state failure:(nullable NSString *)failure
{
  if (self.onStateChange != nil) {
    self.onStateChange(state, failure);
  }
}

- (void)start
{
  dispatch_async(_queue, ^{
    [self listen];
  });
}

/** TCP on 127.0.0.1:port, required to stay on the loopback interface. */
- (void)listen
{
  nw_parameters_t parameters = nw_parameters_create_secure_tcp(NW_PARAMETERS_DISABLE_PROTOCOL, NW_PARAMETERS_DEFAULT_CONFIGURATION);
  NSString *port = [NSString stringWithFormat:@"%u", self.port];
  nw_parameters_set_local_endpoint(parameters, nw_endpoint_create_host("127.0.0.1", port.UTF8String));
  nw_parameters_set_required_interface_type(parameters, nw_interface_type_loopback);
  nw_parameters_set_reuse_local_address(parameters, false);
  nw_listener_t listener = nw_listener_create(parameters);
  if (listener == nil) {
    [self report:GPMcpListenerFailed failure:@"could not create the socket"];
    return;
  }
  _listener = listener;
  nw_listener_set_queue(listener, _queue);
  __weak GPMcpListener *weakSelf = self;
  nw_listener_set_state_changed_handler(listener, ^(nw_listener_state_t state, nw_error_t error) {
    [weakSelf listener:listener changedTo:state error:error];
  });
  nw_listener_set_new_connection_handler(listener, ^(nw_connection_t connection) {
    [weakSelf accept:connection];
  });
  [self report:GPMcpListenerStarting failure:nil];
  nw_listener_start(listener);
}

- (void)listener:(nw_listener_t)listener changedTo:(nw_listener_state_t)state error:(nw_error_t)error
{
  if (listener != _listener) {
    return;
  }
  if (state == nw_listener_state_ready) {
    [self report:GPMcpListenerReady failure:nil];
  } else if (state == nw_listener_state_failed || (state == nw_listener_state_waiting && error != nil)) {
    // Waiting would retry when the network changes; a port taken on the loopback does not free itself that way.
    _listener = nil;
    nw_listener_cancel(listener);
    [self report:GPMcpListenerFailed failure:GPMcpFailure(error)];
  }
}

- (void)stop
{
  dispatch_async(_queue, ^{
    if (self->_listener != nil) {
      nw_listener_cancel(self->_listener);
      self->_listener = nil;
    }
    for (GPMcpConnection *entry in [self->_connections copy]) {
      [self close:entry];
    }
    [self report:GPMcpListenerStopped failure:nil];
  });
}

- (void)accept:(nw_connection_t)connection
{
  nw_endpoint_t remote = nw_connection_copy_endpoint(connection);
  if (!GPMcpIsLoopback(remote) || _connections.count >= self.maxConnections) {
    nw_connection_cancel(connection);
    return;
  }
  GPMcpConnection *entry = [GPMcpConnection new];
  entry.connection = connection;
  entry.buffer = [NSMutableData data];
  [_connections addObject:entry];
  nw_connection_set_queue(connection, _queue);
  __weak GPMcpListener *weakSelf = self;
  __weak GPMcpConnection *weakEntry = entry;
  nw_connection_set_state_changed_handler(connection, ^(nw_connection_state_t state, nw_error_t error) {
    if ((state == nw_connection_state_failed || state == nw_connection_state_cancelled) && weakEntry != nil) {
      [weakSelf forget:weakEntry];
    }
  });
  nw_connection_start(connection);
  [self startTimer:entry];
  [self receive:entry];
}

/** `readTimeout` for the request to arrive (else 408), then again for the answer to be taken (else the connection closes). */
- (void)startTimer:(GPMcpConnection *)entry
{
  dispatch_source_t timer = dispatch_source_create(DISPATCH_SOURCE_TYPE_TIMER, 0, 0, _queue);
  dispatch_source_set_timer(timer, dispatch_time(DISPATCH_TIME_NOW, (int64_t)(self.readTimeout * NSEC_PER_SEC)), DISPATCH_TIME_FOREVER, NSEC_PER_SEC / 10);
  __weak GPMcpListener *weakSelf = self;
  __weak GPMcpConnection *weakEntry = entry;
  dispatch_source_set_event_handler(timer, ^{
    GPMcpConnection *timedOut = weakEntry;
    if (timedOut != nil && timedOut.isAnswered) {
      [weakSelf close:timedOut];
    } else if (timedOut != nil && !timedOut.isHandedOver) {
      [weakSelf refuse:timedOut status:408 reason:@"Request timeout: the request did not arrive in time"];
    }
  });
  entry.readTimer = timer;
  dispatch_resume(timer);
}

- (void)receive:(GPMcpConnection *)entry
{
  __weak GPMcpListener *weakSelf = self;
  nw_connection_receive(entry.connection, 1, 65536, ^(dispatch_data_t content, nw_content_context_t context, bool isComplete, nw_error_t error) {
    GPMcpListener *listener = weakSelf;
    if (listener == nil) {
      return;
    }
    if (content != nil) {
      [entry.buffer appendData:(NSData *)content];
    }
    if (error != nil) {
      [listener close:entry];
    } else if (![listener process:entry]) {
      isComplete ? [listener close:entry] : [listener receive:entry];
    }
  });
}

/** Reads what arrived; YES once the request is answered or handed over (nothing more to receive). */
- (BOOL)process:(GPMcpConnection *)entry
{
  // Closed meanwhile (the server stopped): nothing more is read or handed over.
  if (entry.isHandedOver || entry.isAnswered || ![_connections containsObject:entry]) {
    return YES;
  }
  if (entry.head == nil && ![self readHead:entry]) {
    return entry.isAnswered;
  }
  GPMcpRequestHead *head = entry.head;
  NSUInteger bodyLength = (NSUInteger)MAX(0, head.contentLength);
  if (entry.buffer.length < head.length + bodyLength) {
    return NO;
  }
  [self handOver:entry body:[entry.buffer subdataWithRange:NSMakeRange(head.length, bodyLength)]];
  return YES;
}

/** The head once it is complete and acceptable; NO while it is not (or when it was refused: `isAnswered`). */
- (BOOL)readHead:(GPMcpConnection *)entry
{
  GPMcpRequestHead *head = nil;
  GPMcpHeadStatus status = GPMcpReadHead(entry.buffer, &head);
  if (status == GPMcpHeadInvalid) {
    [self refuse:entry status:400 reason:@"Bad request: not an HTTP/1.1 request"];
    return NO;
  }
  if (status == GPMcpHeadIncomplete) {
    if (entry.buffer.length > GPMcpMaxHeadBytes) {
      [self refuse:entry status:431 reason:@"Request header fields too large"];
    }
    return NO;
  }
  entry.head = head;
  if ([self refuseHead:entry]) {
    return NO;
  }
  // A client that waits for 100 Continue (curl does past 1 KB) gets it; one that already sent its body needs none.
  BOOL isBodyMissing = entry.buffer.length < head.length + (NSUInteger)MAX(0, head.contentLength);
  if (head.expectsContinue && isBodyMissing && !entry.hasSentContinue) {
    entry.hasSentContinue = YES;
    NSData *proceed = [@"HTTP/1.1 100 Continue\r\n\r\n" dataUsingEncoding:NSASCIIStringEncoding];
    nw_connection_send(entry.connection, dispatch_data_create(proceed.bytes, proceed.length, _queue, DISPATCH_DATA_DESTRUCTOR_DEFAULT), NW_CONNECTION_DEFAULT_MESSAGE_CONTEXT, true, ^(nw_error_t error) {
    });
  }
  return YES;
}

/** `value` names a loopback host on the listener's port (`scheme` "http://" for an Origin, "" for a Host). */
- (BOOL)isLoopback:(nullable NSString *)value scheme:(NSString *)scheme
{
  NSString *given = [value stringByTrimmingCharactersInSet:[NSCharacterSet whitespaceCharacterSet]].lowercaseString;
  for (NSString *name in self.loopbackNames) {
    if ([given isEqualToString:[NSString stringWithFormat:@"%@%@:%u", scheme, name.lowercaseString, self.port]]) {
      return YES;
    }
  }
  return NO;
}

/** A Host or Origin that names anything but the loopback (a web page, DNS rebinding), when JS gave the names. */
- (BOOL)isForeign:(GPMcpRequestHead *)head
{
  NSString *origin = head.headers[@"origin"];
  return self.loopbackNames.count > 0 && (![self isLoopback:head.headers[@"host"] scheme:@""] || (origin != nil && ![self isLoopback:origin scheme:@"http://"]));
}

/** Refuses what no body needs to be read for: nobody to answer, a foreign Host or Origin, no length, too long. */
- (BOOL)refuseHead:(GPMcpConnection *)entry
{
  GPMcpRequestHead *head = entry.head;
  NSUInteger limit = self.maxBodyBytes;
  if (limit == 0) {
    [self refuse:entry status:503 reason:@"Service unavailable: GP Editor's window is not ready; try again in a moment"];
  } else if ([self isForeign:head]) {
    [self refuse:entry status:403 reason:@"Forbidden: this server takes requests from this Mac's own programs only, not from web pages"];
  } else if (head.isChunked || (head.contentLength < 0 && [head.method isEqualToString:@"POST"])) {
    [self refuse:entry status:411 reason:@"Length required: send the body with a Content-Length"];
  } else if (head.contentLength > (long long)limit) {
    [self refuse:entry status:413 reason:[NSString stringWithFormat:@"Payload too large: at most %lu bytes", (unsigned long)limit]];
  } else {
    return NO;
  }
  return YES;
}

- (void)handOver:(GPMcpConnection *)entry body:(NSData *)body
{
  entry.isHandedOver = YES;
  [self cancelTimer:entry];
  GPMcpRequestHandler handler = self.handler;
  if (handler == nil) {
    [self refuse:entry status:503 reason:@"Service unavailable: nobody answers yet"];
    return;
  }
  __weak GPMcpListener *weakSelf = self;
  dispatch_queue_t queue = _queue;
  handler(entry.head, body, ^(NSInteger status, NSDictionary<NSString *, NSString *> *headers, NSData *answer) {
    dispatch_async(queue, ^{
      [weakSelf send:entry status:status headers:headers body:answer];
    });
  });
}

- (void)refuse:(GPMcpConnection *)entry status:(NSInteger)status reason:(NSString *)reason
{
  if (entry.isAnswered) {
    return;
  }
  if (self.onRefusal != nil) {
    self.onRefusal(entry.head, status, reason);
  }
  NSData *body = GPMcpErrorBody(status >= 500 ? -32603 : -32600, reason);
  [self send:entry status:status headers:@{@"content-type" : @"application/json"} body:body];
}

/** The answer, once; the connection closes after it is sent. */
- (void)send:(GPMcpConnection *)entry status:(NSInteger)status headers:(NSDictionary<NSString *, NSString *> *)headers body:(NSData *)body
{
  if (entry.isAnswered || ![_connections containsObject:entry]) {
    return;
  }
  entry.isAnswered = YES;
  [self cancelTimer:entry];
  [self startTimer:entry];
  NSData *data = GPMcpResponseData(status, headers, body);
  __weak GPMcpListener *weakSelf = self;
  nw_connection_send(entry.connection, dispatch_data_create(data.bytes, data.length, _queue, DISPATCH_DATA_DESTRUCTOR_DEFAULT), NW_CONNECTION_FINAL_MESSAGE_CONTEXT, true, ^(nw_error_t error) {
    [weakSelf close:entry];
  });
}

- (void)cancelTimer:(GPMcpConnection *)entry
{
  if (entry.readTimer != nil) {
    dispatch_source_cancel(entry.readTimer);
    entry.readTimer = nil;
  }
}

- (void)close:(GPMcpConnection *)entry
{
  [self cancelTimer:entry];
  nw_connection_cancel(entry.connection);
  [self forget:entry];
}

- (void)forget:(GPMcpConnection *)entry
{
  [self cancelTimer:entry];
  [_connections removeObject:entry];
}

@end
