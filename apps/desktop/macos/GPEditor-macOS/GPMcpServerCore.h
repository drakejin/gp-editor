// The MCP server while the app runs (AppDelegate starts it at launch when GPMcpSettings says so and stops it on quit):
// its listener (GPMcpListener: 127.0.0.1 only), its state for the menus, and the requests on their way to JS and back.
// JS (src/hooks/use-mcp-server.ts, through GPMcpServer.m) attaches when the window is up and gives the body limit and
// how long to wait for its answer; a request read before it does (the app just launched, a reload) waits for it — up to
// `holdTimeout`, then 503 —, at most 16 wait at once (503 beyond), and an answer JS does not give in time is answered 504
// (JS skips it then). The listener outlives a JS reload.

#import <Foundation/Foundation.h>

NS_ASSUME_NONNULL_BEGIN

typedef NS_ENUM(NSInteger, GPMcpServerState) {
  GPMcpServerStopped,
  GPMcpServerStarting,
  GPMcpServerRunning,
  GPMcpServerFailed,
};

/** Where requests go: JS, through the GPMcpServer module. NO when it cannot take one now. */
@protocol GPMcpRequestSink <NSObject>
- (BOOL)sendMcpRequest:(NSDictionary *)request;
@end

@interface GPMcpServerCore : NSObject

+ (instancetype)shared;

/** Read on the main thread (GPEditorMcpServerStateNotification after each change). */
@property(nonatomic, readonly) GPMcpServerState state;
/** The port it listens on, or tried to. */
@property(nonatomic, readonly) NSInteger port;
/** Why it could not listen. */
@property(nonatomic, copy, readonly, nullable) NSString *failure;
/** http://127.0.0.1:<port>/mcp */
@property(nonatomic, copy, readonly) NSString *endpointURL;
/** claude mcp add --transport http gp-editor http://127.0.0.1:<port>/mcp */
@property(nonatomic, copy, readonly) NSString *setupCommand;
/** "Running · http://127.0.0.1:18256/mcp", "Stopped", "Error: …" in the shown language. */
@property(nonatomic, copy, readonly) NSString *statusText;
@property(nonatomic, readonly) BOOL isRunning;
/** How long a request read before JS attaches waits for it (20 s). */
@property(atomic) NSTimeInterval holdTimeout;

/** Starts it when it is to start with the app (GPMcpSettings.isEnabledAtLaunch). */
- (void)startAtLaunch;
- (void)start;
- (void)stop;
/** Stops and starts again (a new port, a stuck client). */
- (void)restart;

/** JS takes requests: its body limit, how long the server waits for its answer, the host names a request may name. */
- (void)attachSink:(id<GPMcpRequestSink>)sink maxBodyBytes:(NSUInteger)maxBodyBytes responseTimeout:(NSTimeInterval)responseTimeout loopbackNames:(NSArray<NSString *> *)loopbackNames;
/** Sends what waits for JS again (JS started listening after it attached). */
- (void)resendHeld;
- (void)detachSink:(id<GPMcpRequestSink>)sink;
/** JS's answer to a request: {status, headers, body, client, request, outcome, isError}. */
- (void)answerRequest:(NSString *)requestId response:(NSDictionary *)response;

@end

NS_ASSUME_NONNULL_END
