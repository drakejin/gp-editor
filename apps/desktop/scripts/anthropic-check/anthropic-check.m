// Checks the native half of the Messages API calls (GPAnthropic.m, built with clang by run.sh) against a mock Messages
// API on a loopback socket, with an idle timeout of 1.5 s in place of the app's 600 s — the PDF import's long pages,
// ten minutes of thinking and writing, in seconds. argv[1] is the port; GPEDITOR_ANTHROPIC_URL points the module at it
// (honoured outside the App Sandbox only); CFFIXED_USER_HOME is a temporary home for the key it saves.
#import <Foundation/Foundation.h>
#include <arpa/inet.h>
#include <netinet/in.h>
#include <signal.h>
#include <sys/socket.h>
#include <unistd.h>

#import <React/RCTBridgeModule.h>

@interface GPAnthropic : NSObject <RCTBridgeModule>
- (instancetype)initWithIdleTimeout:(NSTimeInterval)idleTimeout resourceTimeout:(NSTimeInterval)resourceTimeout;
- (void)setApiKey:(NSString *)key resolve:(RCTPromiseResolveBlock)resolve reject:(RCTPromiseRejectBlock)reject;
- (void)send:(NSString *)body resolve:(RCTPromiseResolveBlock)resolve reject:(RCTPromiseRejectBlock)reject;
@end

/** The check's idle timeout; the mock's answers take three of them. */
static const NSTimeInterval kIdle = 1.5;
static const NSTimeInterval kAnswerSeconds = 4.5;
static NSString *const kFakeKey = @"sk-ant-check-not-a-real-key";

static int failed = 0;
/** What the mock was sent, one dictionary per request: "headers" (lower-case names) and "body". */
static NSMutableArray<NSDictionary *> *received;

static void check(BOOL condition, NSString *what)
{
  printf("%s %s\n", condition ? "PASS" : "FAIL", what.UTF8String);
  failed += condition ? 0 : 1;
}

// MARK: - The mock Messages API

static void writeAll(int fd, NSString *text)
{
  NSData *data = [text dataUsingEncoding:NSUTF8StringEncoding];
  const uint8_t *bytes = data.bytes;
  size_t left = data.length;
  while (left > 0) {
    ssize_t sent = send(fd, bytes, left, 0);
    if (sent <= 0) {
      return;
    }
    bytes += sent;
    left -= (size_t)sent;
  }
}

/** One event of the stream, in its own HTTP chunk (the API sends chunked server-sent events). */
static void writeEvent(int fd, NSString *type, NSString *json)
{
  NSString *event = [NSString stringWithFormat:@"event: %@\ndata: %@\n\n", type, json];
  writeAll(fd, [NSString stringWithFormat:@"%lx\r\n%@\r\n", (unsigned long)[event lengthOfBytesUsingEncoding:NSUTF8StringEncoding], event]);
}

static void writeStreamHead(int fd)
{
  writeAll(fd, @"HTTP/1.1 200 OK\r\nContent-Type: text/event-stream; charset=utf-8\r\nTransfer-Encoding: chunked\r\nConnection: close\r\n\r\n");
}

static void writeJson(int fd, NSInteger status, NSString *json)
{
  NSString *head = [NSString stringWithFormat:@"HTTP/1.1 %ld %@\r\nContent-Type: application/json\r\nContent-Length: %lu\r\nConnection: close\r\n\r\n", (long)status,
                                              status == 200 ? @"OK" : @"Error", (unsigned long)[json lengthOfBytesUsingEncoding:NSUTF8StringEncoding]];
  writeAll(fd, [head stringByAppendingString:json]);
}

/** A tool call streamed over kAnswerSeconds: an event every half second, pings among them, then the message's end. */
static void writeFlowingStream(int fd)
{
  writeStreamHead(fd);
  NSArray<NSArray<NSString *> *> *events = @[
    @[ @"message_start", @"{\"type\":\"message_start\",\"message\":{\"id\":\"msg_check\",\"type\":\"message\",\"role\":\"assistant\",\"content\":[],\"stop_reason\":null,\"usage\":{\"input_tokens\":1200,\"output_tokens\":1}}}" ],
    @[ @"ping", @"{\"type\":\"ping\"}" ],
    @[ @"content_block_start", @"{\"type\":\"content_block_start\",\"index\":0,\"content_block\":{\"type\":\"tool_use\",\"id\":\"toolu_check\",\"name\":\"record_transcription\",\"input\":{}}}" ],
    @[ @"content_block_delta", @"{\"type\":\"content_block_delta\",\"index\":0,\"delta\":{\"type\":\"input_json_delta\",\"partial_json\":\"{\\\"measures\\\": [\"}}" ],
    @[ @"ping", @"{\"type\":\"ping\"}" ],
    @[ @"content_block_delta", @"{\"type\":\"content_block_delta\",\"index\":0,\"delta\":{\"type\":\"input_json_delta\",\"partial_json\":\"]}\"}}" ],
    @[ @"content_block_stop", @"{\"type\":\"content_block_stop\",\"index\":0}" ],
    @[ @"message_delta", @"{\"type\":\"message_delta\",\"delta\":{\"stop_reason\":\"tool_use\"},\"usage\":{\"output_tokens\":40}}" ],
    @[ @"message_stop", @"{\"type\":\"message_stop\"}" ],
  ];
  for (NSArray<NSString *> *event in events) {
    writeEvent(fd, event[0], event[1]);
    [NSThread sleepForTimeInterval:kAnswerSeconds / events.count];
  }
  writeAll(fd, @"0\r\n\r\n");
}

/** Answers one request as its body's "scenario" asks. */
static void answer(int fd, NSString *scenario)
{
  if ([scenario isEqualToString:@"stream"]) {
    writeFlowingStream(fd);
  } else if ([scenario isEqualToString:@"silent"]) {
    [NSThread sleepForTimeInterval:kAnswerSeconds];
    writeJson(fd, 200, @"{\"type\":\"message\",\"content\":[],\"stop_reason\":\"end_turn\",\"usage\":{}}");
  } else if ([scenario isEqualToString:@"stall"]) {
    writeStreamHead(fd);
    writeEvent(fd, @"message_start", @"{\"type\":\"message_start\",\"message\":{\"content\":[],\"usage\":{\"input_tokens\":1,\"output_tokens\":1}}}");
    [NSThread sleepForTimeInterval:kAnswerSeconds];
    writeAll(fd, @"0\r\n\r\n");
  } else {
    writeJson(fd, 529, @"{\"type\":\"error\",\"error\":{\"type\":\"overloaded_error\",\"message\":\"Overloaded\"}}");
  }
}

/** Reads one request (head and Content-Length body), records it and answers it. */
static void handle(int fd)
{
  NSMutableData *data = [NSMutableData data];
  char buffer[8192];
  NSRange headEnd = NSMakeRange(NSNotFound, 0);
  NSInteger length = -1;
  while (length < 0 || (NSInteger)data.length < (NSInteger)NSMaxRange(headEnd) + length) {
    ssize_t count = recv(fd, buffer, sizeof(buffer), 0);
    if (count <= 0) {
      return;
    }
    [data appendBytes:buffer length:(NSUInteger)count];
    headEnd = [data rangeOfData:[@"\r\n\r\n" dataUsingEncoding:NSUTF8StringEncoding] options:0 range:NSMakeRange(0, data.length)];
    if (headEnd.location != NSNotFound && length < 0) {
      NSString *head = [[NSString alloc] initWithData:[data subdataWithRange:NSMakeRange(0, headEnd.location)] encoding:NSUTF8StringEncoding];
      NSMutableDictionary *headers = [NSMutableDictionary dictionary];
      for (NSString *line in [head componentsSeparatedByString:@"\r\n"]) {
        NSRange colon = [line rangeOfString:@":"];
        if (colon.location != NSNotFound) {
          headers[[line substringToIndex:colon.location].lowercaseString] = [[line substringFromIndex:colon.location + 1] stringByTrimmingCharactersInSet:NSCharacterSet.whitespaceCharacterSet];
        }
      }
      length = [headers[@"content-length"] integerValue];
      @synchronized(received) {
        [received addObject:@{@"headers" : headers}];
      }
    }
  }
  NSData *bodyData = [data subdataWithRange:NSMakeRange(NSMaxRange(headEnd), (NSUInteger)length)];
  NSString *body = [[NSString alloc] initWithData:bodyData encoding:NSUTF8StringEncoding] ?: @"";
  @synchronized(received) {
    NSMutableDictionary *last = [received.lastObject mutableCopy];
    last[@"body"] = body;
    received[received.count - 1] = last;
  }
  NSDictionary *json = [NSJSONSerialization JSONObjectWithData:bodyData options:0 error:nil];
  answer(fd, [json isKindOfClass:[NSDictionary class]] ? json[@"scenario"] : @"");
}

/** Listens on 127.0.0.1:port; each connection is answered on a queue of its own. */
static BOOL startMock(uint16_t port)
{
  int listener = socket(AF_INET, SOCK_STREAM, 0);
  int yes = 1;
  setsockopt(listener, SOL_SOCKET, SO_REUSEADDR, &yes, sizeof(yes));
  struct sockaddr_in address = {.sin_family = AF_INET, .sin_port = htons(port)};
  inet_pton(AF_INET, "127.0.0.1", &address.sin_addr);
  if (bind(listener, (struct sockaddr *)&address, sizeof(address)) != 0 || listen(listener, 16) != 0) {
    return NO;
  }
  dispatch_async(dispatch_get_global_queue(QOS_CLASS_DEFAULT, 0), ^{
    for (;;) {
      int client = accept(listener, NULL, NULL);
      if (client < 0) {
        continue;
      }
      setsockopt(client, SOL_SOCKET, SO_NOSIGPIPE, &yes, sizeof(yes));
      dispatch_async(dispatch_get_global_queue(QOS_CLASS_DEFAULT, 0), ^{
        handle(client);
        close(client);
      });
    }
  });
  return YES;
}

// MARK: - The checks

@interface Outcome : NSObject
@property(nonatomic, nullable) NSDictionary *answer;
@property(nonatomic, nullable) NSError *error;
@property(nonatomic) NSTimeInterval seconds;
@end

@implementation Outcome
@end

/** Sends a request asking the mock for `scenario` and waits for the module's answer or failure. */
static Outcome *sendScenario(GPAnthropic *module, NSString *scenario)
{
  Outcome *outcome = [Outcome new];
  dispatch_semaphore_t done = dispatch_semaphore_create(0);
  NSDate *start = [NSDate date];
  NSString *body = [NSString stringWithFormat:@"{\"scenario\":\"%@\",\"stream\":true,\"model\":\"claude-opus-5-5\"}", scenario];
  [module send:body
      resolve:^(id result) {
        outcome.answer = result;
        dispatch_semaphore_signal(done);
      }
      reject:^(NSString *code, NSString *message, NSError *error) {
        outcome.error = error ?: [NSError errorWithDomain:code code:0 userInfo:@{NSLocalizedDescriptionKey : message ?: @""}];
        dispatch_semaphore_signal(done);
      }];
  dispatch_semaphore_wait(done, dispatch_time(DISPATCH_TIME_NOW, (int64_t)(60 * NSEC_PER_SEC)));
  outcome.seconds = -start.timeIntervalSinceNow;
  return outcome;
}

static BOOL isTimeout(Outcome *outcome)
{
  return [outcome.error.domain isEqualToString:NSURLErrorDomain] && outcome.error.code == NSURLErrorTimedOut;
}

/** The key file goes under Application Support: refuse to run unless that is inside the temporary home. */
static BOOL saveFakeKey(void)
{
  NSString *home = NSProcessInfo.processInfo.environment[@"CFFIXED_USER_HOME"];
  NSURL *support = [NSFileManager.defaultManager URLForDirectory:NSApplicationSupportDirectory inDomain:NSUserDomainMask appropriateForURL:nil create:YES error:nil];
  BOOL isTemporary = home.length > 0 && [support.path.stringByResolvingSymlinksInPath hasPrefix:home.stringByResolvingSymlinksInPath];
  check(isTemporary, [NSString stringWithFormat:@"Application Support is inside the temporary home (%@)", support.path]);
  if (!isTemporary) {
    return NO;
  }
  __block BOOL isSaved = NO;
  dispatch_semaphore_t done = dispatch_semaphore_create(0);
  [[GPAnthropic new] setApiKey:kFakeKey
      resolve:^(id result) {
        isSaved = YES;
        dispatch_semaphore_signal(done);
      }
      reject:^(NSString *code, NSString *message, NSError *error) {
        dispatch_semaphore_signal(done);
      }];
  dispatch_semaphore_wait(done, dispatch_time(DISPATCH_TIME_NOW, (int64_t)(5 * NSEC_PER_SEC)));
  check(isSaved, @"the check's key is saved in the temporary home");
  return isSaved;
}

static void checkStreamedAnswer(void)
{
  Outcome *outcome = sendScenario([[GPAnthropic alloc] initWithIdleTimeout:kIdle resourceTimeout:60], @"stream");
  NSString *body = outcome.answer[@"body"];
  check(outcome.error == nil && [outcome.answer[@"status"] integerValue] == 200,
        [NSString stringWithFormat:@"a streamed answer flowing for %.1f s comes in with an idle timeout of %.1f s (%@)", outcome.seconds, kIdle, outcome.error.localizedDescription ?: @"200"]);
  check(outcome.seconds > kIdle * 2, @"…and it took longer than the idle timeout twice over");
  check([outcome.answer[@"contentType"] isEqualToString:@"text/event-stream"], [NSString stringWithFormat:@"…with its content type: %@", outcome.answer[@"contentType"]]);
  check([body hasPrefix:@"event: message_start\n"] && [body hasSuffix:@"event: message_stop\ndata: {\"type\":\"message_stop\"}\n\n"] && [body containsString:@"\"partial_json\":\"]}\""],
        @"…whole: every event, in order, the chunks joined");
}

static void checkSilentAnswer(void)
{
  Outcome *outcome = sendScenario([[GPAnthropic alloc] initWithIdleTimeout:kIdle resourceTimeout:60], @"silent");
  check(isTimeout(outcome) && outcome.seconds < kAnswerSeconds,
        [NSString stringWithFormat:@"the same answer sent silently, as a request without stream gets it, times out after %.1f s (%@)", outcome.seconds, outcome.error.localizedDescription]);
}

static void checkStalledStream(void)
{
  Outcome *outcome = sendScenario([[GPAnthropic alloc] initWithIdleTimeout:kIdle resourceTimeout:60], @"stall");
  check(isTimeout(outcome) && outcome.seconds < kAnswerSeconds, [NSString stringWithFormat:@"a stream that goes quiet times out after %.1f s, for JS to ask again (%@)", outcome.seconds, outcome.error.localizedDescription]);
}

static void checkHttpError(void)
{
  Outcome *outcome = sendScenario([[GPAnthropic alloc] initWithIdleTimeout:kIdle resourceTimeout:60], @"error");
  check([outcome.answer[@"status"] integerValue] == 529 && [outcome.answer[@"contentType"] isEqualToString:@"application/json"] && [outcome.answer[@"body"] containsString:@"overloaded_error"],
        [NSString stringWithFormat:@"an HTTP error before any stream comes as JSON with its status: %@ %@", outcome.answer[@"status"], outcome.answer[@"contentType"]]);
}

static void checkResourceLimit(void)
{
  Outcome *outcome = sendScenario([[GPAnthropic alloc] initWithIdleTimeout:kIdle resourceTimeout:3], @"stream");
  check(isTimeout(outcome) && outcome.seconds < kAnswerSeconds,
        [NSString stringWithFormat:@"the whole-answer limit ends even a flowing stream (3 s: %.1f s, %@) — so the app's must outlast its longest answer", outcome.seconds, outcome.error.localizedDescription]);
}

static void checkRequests(void)
{
  NSArray<NSDictionary *> *requests;
  @synchronized(received) {
    requests = [received copy];
  }
  NSDictionary *first = requests.firstObject;
  NSDictionary *headers = first[@"headers"];
  check(requests.count == 5, [NSString stringWithFormat:@"the mock was sent the 5 requests (%lu)", (unsigned long)requests.count]);
  check([headers[@"x-api-key"] isEqualToString:kFakeKey] && [headers[@"anthropic-version"] isEqualToString:@"2023-06-01"] && [headers[@"content-type"] isEqualToString:@"application/json"],
        @"each request carries the saved key, the API version and the JSON content type");
  check([first[@"body"] containsString:@"\"stream\":true"], @"the request body goes as JS wrote it");
}

int main(int argc, const char *argv[])
{
  @autoreleasepool {
    signal(SIGPIPE, SIG_IGN);
    received = [NSMutableArray array];
    uint16_t port = argc > 1 ? (uint16_t)atoi(argv[1]) : 0;
    if (port == 0 || !startMock(port)) {
      printf("FAIL the mock Messages API could not listen on 127.0.0.1:%u\n", port);
      return 1;
    }
    if (!saveFakeKey()) {
      return 1;
    }
    checkStreamedAnswer();
    checkSilentAnswer();
    checkStalledStream();
    checkHttpError();
    checkResourceLimit();
    checkRequests();
    printf(failed == 0 ? "anthropic-check: all checks passed\n" : "anthropic-check: %d check(s) failed\n", failed);
    return failed == 0 ? 0 : 1;
  }
}
