#import "GPMcpHttp.h"

const NSUInteger GPMcpMaxHeadBytes = 16 * 1024;

static NSData *GPMcpBlankLine(void)
{
  static NSData *blankLine;
  static dispatch_once_t once;
  dispatch_once(&once, ^{
    blankLine = [NSData dataWithBytes:"\r\n\r\n" length:4];
  });
  return blankLine;
}

@implementation GPMcpRequestHead

- (instancetype)initWithMethod:(NSString *)method target:(NSString *)target headers:(NSDictionary<NSString *, NSString *> *)headers length:(NSUInteger)length
{
  if (self = [super init]) {
    _method = [method copy];
    _target = [target copy];
    _headers = [headers copy];
    _length = length;
    NSString *declared = headers[@"content-length"];
    _contentLength = declared == nil ? -1 : declared.longLongValue;
    _isChunked = [[headers[@"transfer-encoding"] lowercaseString] containsString:@"chunked"];
    _expectsContinue = [[headers[@"expect"] lowercaseString] isEqualToString:@"100-continue"];
  }
  return self;
}

@end

/** A header name is an HTTP token: letters, digits and !#$%&'*+-.^_`|~. */
static BOOL GPMcpIsToken(NSString *name)
{
  static NSCharacterSet *notToken;
  static dispatch_once_t once;
  dispatch_once(&once, ^{
    NSMutableCharacterSet *token = [NSMutableCharacterSet alphanumericCharacterSet];
    [token addCharactersInString:@"!#$%&'*+-.^_`|~"];
    notToken = token.invertedSet;
  });
  return name.length > 0 && [name rangeOfCharacterFromSet:notToken].location == NSNotFound && [name canBeConvertedToEncoding:NSASCIIStringEncoding];
}

/** Content-Length is digits only, and a repeated one says the same. */
static BOOL GPMcpIsContentLength(NSString *value)
{
  NSArray<NSString *> *parts = [value componentsSeparatedByString:@", "];
  NSCharacterSet *notDigits = [NSCharacterSet decimalDigitCharacterSet].invertedSet;
  for (NSString *part in parts) {
    if (part.length == 0 || part.length > 15 || [part rangeOfCharacterFromSet:notDigits].location != NSNotFound || ![part isEqualToString:parts.firstObject]) {
      return NO;
    }
  }
  return YES;
}

/** The header lines into a dictionary (names in lower case); nil when one is not "name: value". */
static NSDictionary<NSString *, NSString *> *_Nullable GPMcpReadHeaders(NSArray<NSString *> *lines)
{
  NSMutableDictionary<NSString *, NSString *> *headers = [NSMutableDictionary dictionary];
  for (NSString *line in lines) {
    NSRange colon = [line rangeOfString:@":"];
    NSString *name = colon.location == NSNotFound ? @"" : [line substringToIndex:colon.location].lowercaseString;
    if (!GPMcpIsToken(name)) {
      return nil;
    }
    NSString *value = [[line substringFromIndex:colon.location + 1] stringByTrimmingCharactersInSet:[NSCharacterSet whitespaceCharacterSet]];
    headers[name] = headers[name] == nil ? value : [NSString stringWithFormat:@"%@, %@", headers[name], value];
  }
  NSString *contentLength = headers[@"content-length"];
  return contentLength == nil || GPMcpIsContentLength(contentLength) ? headers : nil;
}

GPMcpHeadStatus GPMcpReadHead(NSData *data, GPMcpRequestHead *_Nullable *_Nullable head)
{
  NSRange end = [data rangeOfData:GPMcpBlankLine() options:0 range:NSMakeRange(0, MIN(data.length, GPMcpMaxHeadBytes))];
  if (end.location == NSNotFound) {
    return GPMcpHeadIncomplete;
  }
  // Header bytes as Latin-1: every byte is a character, so nothing is refused for its encoding here.
  NSString *text = [[NSString alloc] initWithData:[data subdataWithRange:NSMakeRange(0, end.location)] encoding:NSISOLatin1StringEncoding];
  NSArray<NSString *> *lines = [text componentsSeparatedByString:@"\r\n"];
  NSArray<NSString *> *requestLine = [lines.firstObject componentsSeparatedByString:@" "];
  BOOL isRequestLine = requestLine.count == 3 && GPMcpIsToken(requestLine[0]) && requestLine[1].length > 0 && [requestLine[2] hasPrefix:@"HTTP/1."];
  NSDictionary<NSString *, NSString *> *headers = isRequestLine ? GPMcpReadHeaders([lines subarrayWithRange:NSMakeRange(1, lines.count - 1)]) : nil;
  if (headers == nil) {
    return GPMcpHeadInvalid;
  }
  if (head != NULL) {
    *head = [[GPMcpRequestHead alloc] initWithMethod:requestLine[0] target:requestLine[1] headers:headers length:NSMaxRange(end)];
  }
  return GPMcpHeadComplete;
}

static NSString *GPMcpReason(NSInteger status)
{
  NSDictionary<NSNumber *, NSString *> *reasons = @{
    @100 : @"Continue", @200 : @"OK", @202 : @"Accepted", @400 : @"Bad Request", @403 : @"Forbidden", @404 : @"Not Found", @405 : @"Method Not Allowed",
    @406 : @"Not Acceptable", @408 : @"Request Timeout", @411 : @"Length Required", @413 : @"Content Too Large", @415 : @"Unsupported Media Type",
    @431 : @"Request Header Fields Too Large", @500 : @"Internal Server Error", @501 : @"Not Implemented", @503 : @"Service Unavailable", @504 : @"Gateway Timeout",
  };
  return reasons[@(status)] ?: @"Status";
}

NSData *GPMcpResponseData(NSInteger status, NSDictionary<NSString *, NSString *> *headers, NSData *body)
{
  NSMutableString *head = [NSMutableString stringWithFormat:@"HTTP/1.1 %ld %@\r\n", (long)status, GPMcpReason(status)];
  for (NSString *name in [headers.allKeys sortedArrayUsingSelector:@selector(compare:)]) {
    NSString *value = headers[name];
    // A value with a line break would start a header of its own: never written.
    if ([value rangeOfCharacterFromSet:[NSCharacterSet newlineCharacterSet]].location == NSNotFound && GPMcpIsToken(name)) {
      [head appendFormat:@"%@: %@\r\n", name, value];
    }
  }
  [head appendFormat:@"Content-Length: %lu\r\nConnection: close\r\n\r\n", (unsigned long)body.length];
  NSMutableData *data = [[head dataUsingEncoding:NSUTF8StringEncoding] mutableCopy];
  [data appendData:body];
  return data;
}

NSData *GPMcpErrorBody(NSInteger code, NSString *message)
{
  NSDictionary *error = @{@"jsonrpc" : @"2.0", @"error" : @{@"code" : @(code), @"message" : message}};
  return [NSJSONSerialization dataWithJSONObject:error options:0 error:nil] ?: [NSData data];
}
