// Checks the MCP server's native half (built with clang against the app's source by run.sh) over real loopback
// sockets: the HTTP head reader, the listener's limits and the core's routing to a JS stand-in. argv[1] is the port
// (GPEDITOR_MCP_PORT says the same to GPMcpSettings).
#import <Foundation/Foundation.h>
#include <arpa/inet.h>
#include <ifaddrs.h>
#include <netinet/in.h>
#include <string.h>
#include <sys/socket.h>
#include <unistd.h>

#import "GPMcpHttp.h"
#import "GPMcpListener.h"
#import "GPMcpLog.h"
#import "GPMcpServerCore.h"

static int failed = 0;

static void check(BOOL condition, NSString *what)
{
  printf("%s %s\n", condition ? "PASS" : "FAIL", what.UTF8String);
  failed += condition ? 0 : 1;
}

/** Runs the main run loop until `done` or `seconds` pass (the core reports its state on the main queue). */
static BOOL waitFor(NSTimeInterval seconds, BOOL (^done)(void))
{
  NSDate *deadline = [NSDate dateWithTimeIntervalSinceNow:seconds];
  while (!done() && [deadline timeIntervalSinceNow] > 0) {
    [[NSRunLoop mainRunLoop] runUntilDate:[NSDate dateWithTimeIntervalSinceNow:0.02]];
  }
  return done();
}

/** Connects to `address`:port; -1 when nothing listens there. */
static int connectTo(const char *address, uint16_t port)
{
  int fd = socket(AF_INET, SOCK_STREAM, 0);
  struct sockaddr_in to = {.sin_family = AF_INET, .sin_port = htons(port)};
  inet_pton(AF_INET, address, &to.sin_addr);
  struct timeval timeout = {.tv_sec = 5};
  setsockopt(fd, SOL_SOCKET, SO_RCVTIMEO, &timeout, sizeof(timeout));
  if (connect(fd, (struct sockaddr *)&to, sizeof(to)) != 0) {
    close(fd);
    return -1;
  }
  return fd;
}

/** Everything the server sends until it closes (or 5 s pass). */
static NSString *readAll(int fd)
{
  NSMutableData *data = [NSMutableData data];
  char buffer[4096];
  ssize_t count;
  while ((count = recv(fd, buffer, sizeof(buffer), 0)) > 0) {
    [data appendBytes:buffer length:(NSUInteger)count];
  }
  close(fd);
  return [[NSString alloc] initWithData:data encoding:NSUTF8StringEncoding] ?: @"";
}

/** Sends `request` whole and reads the answer. */
static NSString *exchange(uint16_t port, NSString *request)
{
  int fd = connectTo("127.0.0.1", port);
  if (fd < 0) {
    return @"(refused)";
  }
  NSData *bytes = [request dataUsingEncoding:NSUTF8StringEncoding];
  send(fd, bytes.bytes, bytes.length, 0);
  return readAll(fd);
}

static NSString *post(NSString *body, NSString *extraHeaders)
{
  return [NSString stringWithFormat:@"POST /mcp HTTP/1.1\r\nHost: 127.0.0.1\r\nContent-Type: application/json\r\n%@Content-Length: %lu\r\n\r\n%@", extraHeaders, (unsigned long)[body dataUsingEncoding:NSUTF8StringEncoding].length, body];
}

/** A client that sends its head with Expect: 100-continue, waits for the 100, then sends the body. */
static BOOL continued(uint16_t port)
{
  int fd = connectTo("127.0.0.1", port);
  NSData *head = [@"POST /mcp HTTP/1.1\r\nHost: a\r\nExpect: 100-continue\r\nContent-Length: 5\r\n\r\n" dataUsingEncoding:NSUTF8StringEncoding];
  send(fd, head.bytes, head.length, 0);
  char buffer[64] = {0};
  ssize_t count = recv(fd, buffer, sizeof(buffer) - 1, 0);
  BOOL isContinue = count > 0 && strncmp(buffer, "HTTP/1.1 100 Continue\r\n\r\n", 25) == 0;
  send(fd, "hello", 5, 0);
  NSString *answer = readAll(fd);
  return isContinue && [answer hasPrefix:@"HTTP/1.1 200 OK"] && [answer hasSuffix:@"hello"];
}

static void checkHeadReader(void)
{
  NSString *text = @"POST /mcp?x=1 HTTP/1.1\r\nHost: 127.0.0.1:1\r\nX-Twice: a\r\nx-twice: b\r\nContent-Length: 5\r\nExpect: 100-continue\r\n\r\nhello";
  GPMcpRequestHead *head = nil;
  GPMcpHeadStatus status = GPMcpReadHead([text dataUsingEncoding:NSUTF8StringEncoding], &head);
  check(status == GPMcpHeadComplete && [head.method isEqualToString:@"POST"] && [head.target isEqualToString:@"/mcp?x=1"], @"reads the request line");
  check([head.headers[@"x-twice"] isEqualToString:@"a, b"] && [head.headers[@"host"] isEqualToString:@"127.0.0.1:1"], @"lower-cases header names and joins repeated ones");
  check(head.contentLength == 5 && head.expectsContinue && head.length == text.length - 5, @"reads Content-Length, Expect and where the body starts");
  check(GPMcpReadHead([@"POST /mcp HTTP/1.1\r\nHost: a" dataUsingEncoding:NSUTF8StringEncoding], NULL) == GPMcpHeadIncomplete, @"waits for the blank line");
  check(GPMcpReadHead([@"hello there\r\n\r\n" dataUsingEncoding:NSUTF8StringEncoding], NULL) == GPMcpHeadInvalid, @"refuses what is no request line");
  check(GPMcpReadHead([@"GET / HTTP/1.1\r\nHost: a\r\n folded\r\n\r\n" dataUsingEncoding:NSUTF8StringEncoding], NULL) == GPMcpHeadInvalid, @"refuses a folded header line");
  check(GPMcpReadHead([@"POST / HTTP/1.1\r\nContent-Length: 5, 6\r\n\r\n" dataUsingEncoding:NSUTF8StringEncoding], NULL) == GPMcpHeadInvalid, @"refuses two different Content-Lengths");
  NSString *response = [[NSString alloc] initWithData:GPMcpResponseData(200, @{@"content-type" : @"application/json", @"x-evil" : @"a\r\nInjected: 1"}, [@"{}" dataUsingEncoding:NSUTF8StringEncoding]) encoding:NSUTF8StringEncoding];
  check([response hasPrefix:@"HTTP/1.1 200 OK\r\n"] && [response containsString:@"Content-Length: 2\r\nConnection: close\r\n\r\n{}"] && ![response containsString:@"Injected"], @"writes a response, never a header with a line break");
}

static void checkListenerLimits(uint16_t port)
{
  dispatch_queue_t queue = dispatch_queue_create("mcp-check", DISPATCH_QUEUE_SERIAL);
  GPMcpListener *listener = [[GPMcpListener alloc] initWithPort:port queue:queue];
  __block GPMcpListenerState state = GPMcpListenerStarting;
  listener.onStateChange = ^(GPMcpListenerState next, NSString *failure) {
    state = next;
  };
  listener.readTimeout = 0.5;
  listener.handler = ^(GPMcpRequestHead *head, NSData *body, GPMcpRespond respond) {
    respond(200, @{@"content-type" : @"text/plain"}, body);
  };
  [listener start];
  check(waitFor(3, ^{ return (BOOL)(state == GPMcpListenerReady); }), @"listens on 127.0.0.1");
  check([exchange(port, post(@"{}", @"")) hasPrefix:@"HTTP/1.1 503 "], @"answers 503 before anybody takes requests (no body limit yet)");
  listener.maxBodyBytes = 64;
  check([exchange(port, post(@"hello", @"")) hasSuffix:@"\r\n\r\nhello"], @"hands a whole request to the handler and writes its answer");
  check(continued(port), @"answers Expect: 100-continue before the body, as curl waits for it");
  check([exchange(port, @"POST /mcp HTTP/1.1\r\nHost: a\r\nContent-Length: 100\r\n\r\n") hasPrefix:@"HTTP/1.1 413 "], @"answers 413 for a body over the limit, without reading it");
  check([exchange(port, @"POST /mcp HTTP/1.1\r\nHost: a\r\n\r\n") hasPrefix:@"HTTP/1.1 411 "], @"answers 411 for a POST without a length");
  check([exchange(port, @"POST /mcp HTTP/1.1\r\nTransfer-Encoding: chunked\r\n\r\n") hasPrefix:@"HTTP/1.1 411 "], @"answers 411 for a chunked body");
  check([exchange(port, @"not http\r\n\r\n") hasPrefix:@"HTTP/1.1 400 "], @"answers 400 for what is not HTTP");
  NSString *longHead = [NSString stringWithFormat:@"GET / HTTP/1.1\r\nX-Long: %@\r\n", [@"" stringByPaddingToLength:17000 withString:@"a" startingAtIndex:0]];
  check([exchange(port, longHead) hasPrefix:@"HTTP/1.1 431 "], @"answers 431 for a head over 16 KB");
  int slow = connectTo("127.0.0.1", port);
  send(slow, "POST /mcp HTTP/1.1\r\n", 20, 0);
  check([readAll(slow) hasPrefix:@"HTTP/1.1 408 "], @"answers 408 when the request does not arrive in time");
  GPMcpListener *second = [[GPMcpListener alloc] initWithPort:port queue:queue];
  __block NSString *secondFailure = nil;
  second.onStateChange = ^(GPMcpListenerState next, NSString *failure) {
    secondFailure = next == GPMcpListenerFailed ? failure : secondFailure;
  };
  [second start];
  check(waitFor(3, ^{ return (BOOL)(secondFailure != nil); }) && [secondFailure containsString:@"in use"], [NSString stringWithFormat:@"a second listener on the port fails: %@", secondFailure]);
  [listener stop];
  check(waitFor(3, ^{ return (BOOL)(state == GPMcpListenerStopped); }) && connectTo("127.0.0.1", port) < 0, @"closes the socket when stopped");
}

/** The first IPv4 address of this Mac off the loopback, if it has one. */
static NSString *_Nullable lanAddress(void)
{
  struct ifaddrs *addresses = NULL;
  NSString *found = nil;
  if (getifaddrs(&addresses) != 0) {
    return nil;
  }
  for (struct ifaddrs *each = addresses; each != NULL && found == nil; each = each->ifa_next) {
    if (each->ifa_addr != NULL && each->ifa_addr->sa_family == AF_INET && (ntohl(((struct sockaddr_in *)each->ifa_addr)->sin_addr.s_addr) >> 24) != 127) {
      char text[INET_ADDRSTRLEN];
      inet_ntop(AF_INET, &((struct sockaddr_in *)each->ifa_addr)->sin_addr, text, sizeof(text));
      found = @(text);
    }
  }
  freeifaddrs(addresses);
  return found;
}

/** JS's stand-in: answers each request (or, `isSilent`, never does). */
@interface GPCheckSink : NSObject <GPMcpRequestSink>
@property(nonatomic) BOOL isSilent;
@property(atomic) NSInteger received;
@end

@implementation GPCheckSink
- (BOOL)sendMcpRequest:(NSDictionary *)request
{
  self.received += 1;
  if (!self.isSilent) {
    NSDictionary *answer = @{@"status" : @200, @"headers" : @{@"content-type" : @"application/json"}, @"body" : request[@"body"], @"client" : @"check", @"request" : @"ping", @"outcome" : @"ok", @"isError" : @NO};
    dispatch_async(dispatch_get_global_queue(QOS_CLASS_DEFAULT, 0), ^{
      [[GPMcpServerCore shared] answerRequest:request[@"id"] response:answer];
    });
  }
  return YES;
}
@end

static void checkCore(uint16_t port)
{
  GPMcpServerCore *core = [GPMcpServerCore shared];
  [core start];
  check(waitFor(3, ^{ return core.isRunning; }) && core.port == port, [NSString stringWithFormat:@"the server runs on GPEDITOR_MCP_PORT: %@", core.statusText]);
  NSString *lan = lanAddress();
  check(lan == nil || connectTo(lan.UTF8String, port) < 0, [NSString stringWithFormat:@"nothing listens on this Mac's other address (%@)", lan ?: @"none"]);
  core.holdTimeout = 1;
  check([exchange(port, post(@"{}", @"")) hasPrefix:@"HTTP/1.1 503 "], @"answers 503 when JS does not attach within the hold time");
  GPCheckSink *sink = [GPCheckSink new];
  int early = connectTo("127.0.0.1", port);
  NSData *first = [post(@"{\"early\":1}", @"") dataUsingEncoding:NSUTF8StringEncoding];
  send(early, first.bytes, first.length, 0);
  waitFor(0.3, ^{ return NO; });
  [core attachSink:sink maxBodyBytes:1024 responseTimeout:1];
  check([readAll(early) hasSuffix:@"\r\n\r\n{\"early\":1}"], @"holds a request read before JS attaches, then writes JS's answer");
  check([exchange(port, post(@"{\"jsonrpc\":\"2.0\"}", @"")) hasSuffix:@"\r\n\r\n{\"jsonrpc\":\"2.0\"}"], @"writes JS's answer back");
  sink.isSilent = YES;
  check([exchange(port, post(@"{}", @"")) hasPrefix:@"HTTP/1.1 504 "], @"answers 504 when JS does not answer in time");
  int waiting = connectTo("127.0.0.1", port);
  NSData *bytes = [post(@"{}", @"") dataUsingEncoding:NSUTF8StringEncoding];
  send(waiting, bytes.bytes, bytes.length, 0);
  waitFor(0.3, ^{ return NO; });
  [core detachSink:sink];
  check([readAll(waiting) hasPrefix:@"HTTP/1.1 503 "], @"answers 503 for what was waiting when JS goes (a reload)");
  check(waitFor(2, ^{ return (BOOL)([GPMcpLog shared].entries.count >= 6); }), [NSString stringWithFormat:@"logs the server's events and each request (%lu entries)", (unsigned long)[GPMcpLog shared].entries.count]);
  [core stop];
  check(waitFor(3, ^{ return (BOOL)(core.state == GPMcpServerStopped && connectTo("127.0.0.1", port) < 0); }), @"stops");
}

int main(int argc, const char *argv[])
{
  @autoreleasepool {
    uint16_t port = argc > 1 ? (uint16_t)atoi(argv[1]) : 41999;
    checkHeadReader();
    checkListenerLimits(port);
    waitFor(0.5, ^{ return NO; });
    checkCore(port);
    printf(failed == 0 ? "all MCP server checks passed\n" : "%d MCP server check(s) failed\n", failed);
  }
  return failed == 0 ? 0 : 1;
}
