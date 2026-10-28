// The MCP server's HTTP/1.1, as little as its one endpoint needs: a request head read from the bytes received (request
// line, headers, Content-Length, Expect: 100-continue) and a response written with Content-Length and Connection: close.
// Foundation only, so scripts/mcp-check builds it with clang. The protocol itself is JS's (src/mcp/).

#import <Foundation/Foundation.h>

NS_ASSUME_NONNULL_BEGIN

/** Largest request head (request line and headers) the listener reads; a longer one is answered 431. */
FOUNDATION_EXPORT const NSUInteger GPMcpMaxHeadBytes;

/** A request head as read: header names in lower case, a repeated header's values joined by ", ". */
@interface GPMcpRequestHead : NSObject
@property(nonatomic, copy, readonly) NSString *method;
@property(nonatomic, copy, readonly) NSString *target;
@property(nonatomic, copy, readonly) NSDictionary<NSString *, NSString *> *headers;
/** The body's length; -1 when the request names none. */
@property(nonatomic, readonly) long long contentLength;
@property(nonatomic, readonly) BOOL isChunked;
@property(nonatomic, readonly) BOOL expectsContinue;
/** Bytes up to the blank line that ends the head. */
@property(nonatomic, readonly) NSUInteger length;
@end

typedef NS_ENUM(NSInteger, GPMcpHeadStatus) {
  /** More bytes are needed. */
  GPMcpHeadIncomplete,
  GPMcpHeadComplete,
  /** Not an HTTP/1.x request head (answered 400). */
  GPMcpHeadInvalid,
};

/** Reads the head at the start of `data`; `head` is set when it is complete. */
FOUNDATION_EXPORT GPMcpHeadStatus GPMcpReadHead(NSData *data, GPMcpRequestHead *_Nullable *_Nullable head);

/** A response's bytes: the status line and its reason, the headers, Content-Length, Connection: close, the body. */
FOUNDATION_EXPORT NSData *GPMcpResponseData(NSInteger status, NSDictionary<NSString *, NSString *> *headers, NSData *body);

/** A JSON-RPC error without an id, as JSON (what the listener answers itself: 413, 503, 504 …). */
FOUNDATION_EXPORT NSData *GPMcpErrorBody(NSInteger code, NSString *message);

NS_ASSUME_NONNULL_END
