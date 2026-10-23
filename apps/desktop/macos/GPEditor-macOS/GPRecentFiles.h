// The recent files list, shared by GPRecentFiles.m (stores it for the JS side, src/native/recent-files.ts),
// RecentFilesMenu.swift (File ▸ Open Recent, through the bridging header) and GPFiles.m (writes a reopened file).

#import <Foundation/Foundation.h>

NS_ASSUME_NONNULL_BEGIN

/** User defaults key of the recent files: an array of { path, name, isPinned, openedAt, isMissing }, in the list's order. */
FOUNDATION_EXPORT NSString *const GPRecentFilesDefaultsKey;

/**
 * Runs `work` inside the sandbox access of the file's recent-files bookmark when it has one — a file reopened from the
 * list after a relaunch may be written only that way (⌘S) — else just runs it.
 */
FOUNDATION_EXPORT void GPWithRecentFileAccess(NSString *path, NS_NOESCAPE void (^work)(void));

NS_ASSUME_NONNULL_END
