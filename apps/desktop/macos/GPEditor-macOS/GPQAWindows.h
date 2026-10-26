// QA driver steps for windows other than the score's (GPQADriver.m runs them): the MCP server's settings and log
// windows by identifier, and its menu bar item's menu — whose content the system draws, so it is captured from the
// window server (an app may capture its own windows), with the view's own drawing as a fallback.

#import <AppKit/AppKit.h>

NS_ASSUME_NONNULL_BEGIN

/** Writes a line to the QA log. */
typedef void (^GPQALog)(NSString *line);

/** {"snapshotWindow": {"id": …, "path": …}}: the visible window with that identifier, captured (or drawn) to a PNG. */
FOUNDATION_EXPORT void GPQASnapshotWindow(NSString *identifier, NSString *path, GPQALog log);

/**
 * {"statusMenu": path}: the MCP server's menu bar item — its items, tooltip and dimmed state logged, its icon drawn to
 * <path>-button.png, its menu opened as a click opens it and captured to <path> a second later, then closed.
 */
FOUNDATION_EXPORT void GPQAStatusMenu(NSString *path, GPQALog log);

NS_ASSUME_NONNULL_END
