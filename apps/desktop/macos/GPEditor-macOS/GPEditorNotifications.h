// Notification names shared by AppDelegate.swift (posts them, via the bridging header), GPFiles.m (forwards them
// to JS as the "newRequested" / "importPdfRequested" / "exportRequested" / "printRequested" / "helpRequested" / "openRequested" / "fileOpened" / "saveRequested" events) and GPQADriver.m.

#import <Foundation/Foundation.h>

NS_ASSUME_NONNULL_BEGIN

/** File ▸ New Score + Tab (⌘N) / New Score / New Tab. Object: NSString score mode ("notationAndTab", "notation", "tab"). */
FOUNDATION_EXPORT NSString *const GPEditorNewCommandNotification;

/** File ▸ Import PDF… (⇧⌘I) was chosen. No object. */
FOUNDATION_EXPORT NSString *const GPEditorImportPdfCommandNotification;

/** File ▸ Export PDF… (⇧⌘E) was chosen. No object. */
FOUNDATION_EXPORT NSString *const GPEditorExportCommandNotification;

/** File ▸ Print… (⌘P) was chosen. No object. */
FOUNDATION_EXPORT NSString *const GPEditorPrintCommandNotification;

/** Help ▸ Keyboard Shortcuts (⌘H) was chosen. No object. */
FOUNDATION_EXPORT NSString *const GPEditorHelpCommandNotification;

/** File ▸ Open… (⌘O) was chosen. No object. */
FOUNDATION_EXPORT NSString *const GPEditorOpenCommandNotification;

/** Finder handed the app files (Open With, dock drop, `open -a`). Object: NSArray<NSURL *>. */
FOUNDATION_EXPORT NSString *const GPEditorOpenURLsNotification;

/** File ▸ Save (⌘S). No object. */
FOUNDATION_EXPORT NSString *const GPEditorSaveCommandNotification;

/** File ▸ Save As… (⇧⌘S). No object. */
FOUNDATION_EXPORT NSString *const GPEditorSaveAsCommandNotification;

NS_ASSUME_NONNULL_END
