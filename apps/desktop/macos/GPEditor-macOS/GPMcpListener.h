// The MCP server's socket (Network.framework): TCP on 127.0.0.1:<port> only — never another interface — taking
// connections from the loopback alone, at most `maxConnections` at a time. Each connection carries one HTTP request: its
// head is read (431 over GPMcpMaxHeadBytes, 400 when it is no HTTP/1.x; 403 when its Host or Origin names anything but
// `loopbackNames`), its body up to `maxBodyBytes` (413 over it, 411 without a length), both within `readTimeout` (408),
// then the handler answers it once, the answer is sent within `readTimeout` too, and the connection closes. Foundation
// and Network only, so scripts/mcp-check builds it with clang.

#import <Foundation/Foundation.h>

#import "GPMcpHttp.h"

NS_ASSUME_NONNULL_BEGIN

typedef NS_ENUM(NSInteger, GPMcpListenerState) {
  GPMcpListenerStarting,
  GPMcpListenerReady,
  GPMcpListenerFailed,
  GPMcpListenerStopped,
};

/** Answers a request once (later calls are ignored): status, headers (lower case), body. */
typedef void (^GPMcpRespond)(NSInteger status, NSDictionary<NSString *, NSString *> *headers, NSData *body);

/** A request whose head and body were read. */
typedef void (^GPMcpRequestHandler)(GPMcpRequestHead *head, NSData *body, GPMcpRespond respond);

/** An answer the listener gave itself (a request refused before the handler: 400, 408, 411, 413, 431, 503). */
typedef void (^GPMcpRefusal)(GPMcpRequestHead *_Nullable head, NSInteger status, NSString *reason);

@interface GPMcpListener : NSObject

/** A listener for 127.0.0.1:`port`, its callbacks on `queue`. Nothing listens until `start`. */
- (instancetype)initWithPort:(uint16_t)port queue:(dispatch_queue_t)queue;

@property(nonatomic, readonly) uint16_t port;
/** Largest body taken; 0: every request is refused with 503 before its body is read (nobody answers yet). */
@property(atomic) NSUInteger maxBodyBytes;
/** How long a client has to send its whole request, and to take the answer. */
@property(nonatomic) NSTimeInterval readTimeout;
/** Connections open at once; more are closed as they come (64). */
@property(nonatomic) NSUInteger maxConnections;
/**
 * The host names Host and Origin may name with the port ("127.0.0.1", "localhost", "[::1]": JS's LOOPBACK_NAMES, given
 * when it attaches): anything else is refused with 403 before the body is read. Empty: not checked here (JS checks).
 */
@property(atomic, copy) NSArray<NSString *> *loopbackNames;
@property(nonatomic, copy, nullable) GPMcpRequestHandler handler;
@property(nonatomic, copy, nullable) GPMcpRefusal onRefusal;
/** Ready, or failed with why (the port in use …), or stopped. */
@property(nonatomic, copy, nullable) void (^onStateChange)(GPMcpListenerState state, NSString *_Nullable failure);

- (void)start;
/** Closes the socket and every open connection. */
- (void)stop;

@end

NS_ASSUME_NONNULL_END
