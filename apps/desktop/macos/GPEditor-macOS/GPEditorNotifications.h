// Notification names shared by AppDelegate.swift (posts them, via the bridging header), GPFiles.m (forwards them
// to JS as the "openRequested" / "fileOpened" events) and GPQADriver.m.

#import <Foundation/Foundation.h>

NS_ASSUME_NONNULL_BEGIN

/** File ▸ Open… (⌘O) was chosen. No object. */
FOUNDATION_EXPORT NSString *const GPEditorOpenCommandNotification;

/** Finder handed the app files (Open With, dock drop, `open -a`). Object: NSArray<NSURL *>. */
FOUNDATION_EXPORT NSString *const GPEditorOpenURLsNotification;

NS_ASSUME_NONNULL_END
