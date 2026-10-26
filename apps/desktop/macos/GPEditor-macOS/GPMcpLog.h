// The MCP server's log (Tools ▸ MCP Server ▸ Show Log…): each request — when, which client, which method or tool, how
// long, how it ended — and the server's own events (started, stopped, could not listen). The last GPMcpLogCapacity
// entries stay in memory for the log window; every entry is also appended to Application Support/GPEditor/
// mcp-server.log (moved to mcp-server.1.log past GPMcpLogFileLimit bytes). Entries change on the main thread.

#import <Foundation/Foundation.h>

NS_ASSUME_NONNULL_BEGIN

FOUNDATION_EXPORT const NSUInteger GPMcpLogCapacity;
FOUNDATION_EXPORT const unsigned long long GPMcpLogFileLimit;

@interface GPMcpLogEntry : NSObject
/** Distinct for every entry (the log window's rows). */
@property(nonatomic, readonly) NSInteger serial;
@property(nonatomic, readonly) NSDate *date;
/** Who sent the request ("claude-code 2.1.0", a User-Agent); empty for a server event. */
@property(nonatomic, copy, readonly) NSString *client;
/** The method and tool ("tools/call write_note"), or the event's text. */
@property(nonatomic, copy, readonly) NSString *request;
/** Milliseconds from the request's arrival to its answer; -1 for a server event. */
@property(nonatomic, readonly) NSInteger durationMs;
/** "ok", "error: …", "refused 403: …"; empty for a server event. */
@property(nonatomic, copy, readonly) NSString *outcome;
@property(nonatomic, readonly) BOOL isError;
@property(nonatomic, readonly) BOOL isEvent;
/** The entry as one line of the file and of Copy. */
@property(nonatomic, copy, readonly) NSString *line;
/** The time of day, as the log window shows it ("14:03:07.215"). */
@property(nonatomic, copy, readonly) NSString *timeText;
@end

@interface GPMcpLog : NSObject

+ (instancetype)shared;

/** Oldest first. Read on the main thread. */
@property(nonatomic, copy, readonly) NSArray<GPMcpLogEntry *> *entries;
/** Application Support/GPEditor/mcp-server.log (in the sandbox, the app container's). */
@property(nonatomic, readonly) NSURL *fileURL;

- (void)addRequestFrom:(NSString *)client request:(NSString *)request durationMs:(NSInteger)durationMs outcome:(NSString *)outcome isError:(BOOL)isError;
- (void)addEvent:(NSString *)text isError:(BOOL)isError;
/** Empties the window's list; the file keeps its history. */
- (void)clear;
/** Every entry in memory, one line each (the log window's Copy). */
- (NSString *)text;

@end

NS_ASSUME_NONNULL_END
