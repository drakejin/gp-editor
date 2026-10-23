// Notification names shared by AppDelegate.swift (posts them, via the bridging header), GPFiles.m (forwards them
// to JS as the "newRequested" / "importPdfRequested" / "exportRequested" / "exportPngRequested" / "printRequested" / "helpRequested" / "songWriterRequested" / "openRequested" / "fileOpened" /
// "saveRequested" / "closeTabRequested" / "nextTabRequested" / "previousTabRequested" events) and GPQADriver.m.

#import <Foundation/Foundation.h>

NS_ASSUME_NONNULL_BEGIN

/** File ▸ New Score + Tab (⌘N) / New Score / New Tab. Object: NSString score mode ("notationAndTab", "notation", "tab"). */
FOUNDATION_EXPORT NSString *const GPEditorNewCommandNotification;

/** File ▸ Import PDF… (⇧⌘I) was chosen. No object. */
FOUNDATION_EXPORT NSString *const GPEditorImportPdfCommandNotification;

/** File ▸ Export PDF… (⇧⌘E) was chosen. No object. */
FOUNDATION_EXPORT NSString *const GPEditorExportCommandNotification;

/** File ▸ Export PNG… was chosen. No object. */
FOUNDATION_EXPORT NSString *const GPEditorExportPngCommandNotification;

/** File ▸ Export MIDI… was chosen (JS event "exportMidiRequested"). No object. */
FOUNDATION_EXPORT NSString *const GPEditorExportMidiCommandNotification;

/** File ▸ Export ASCII Tab… was chosen (JS event "exportAsciiTabRequested"). No object. */
FOUNDATION_EXPORT NSString *const GPEditorExportAsciiTabCommandNotification;

/** File ▸ Print… (⌘P) was chosen. No object. */
FOUNDATION_EXPORT NSString *const GPEditorPrintCommandNotification;

/** Help ▸ Keyboard Shortcuts (⌘H) was chosen. No object. */
FOUNDATION_EXPORT NSString *const GPEditorHelpCommandNotification;

/** Edit ▸ AI Wizard ▸ Song Writer… was chosen. No object. */
FOUNDATION_EXPORT NSString *const GPEditorSongWriterCommandNotification;

/** Tools ▸ Tuner… was chosen; GPAudioInput.m forwards it to JS as "tunerRequested". No object. */
FOUNDATION_EXPORT NSString *const GPEditorTunerCommandNotification;

/** File ▸ Open… (⌘O) was chosen. No object. */
FOUNDATION_EXPORT NSString *const GPEditorOpenCommandNotification;

/** File ▸ Open Recent ▸ a file was chosen (RecentFilesMenu.swift → GPRecentFiles.m). Object: NSString path. */
FOUNDATION_EXPORT NSString *const GPEditorOpenRecentCommandNotification;

/** File ▸ Open Recent ▸ Clear Menu was chosen (the pinned files stay). No object. */
FOUNDATION_EXPORT NSString *const GPEditorClearRecentCommandNotification;

/** File ▸ Recent Files… was chosen. No object. */
FOUNDATION_EXPORT NSString *const GPEditorRecentFilesCommandNotification;

/** GPRecentFiles.m stored a new recent files list (GPRecentFilesDefaultsKey); File ▸ Open Recent reloads it. No object. */
FOUNDATION_EXPORT NSString *const GPEditorRecentFilesChangedNotification;

/** Finder handed the app files (Open With, dock drop, `open -a`). Object: NSArray<NSURL *>. */
FOUNDATION_EXPORT NSString *const GPEditorOpenURLsNotification;

/** File ▸ Save (⌘S). No object. */
FOUNDATION_EXPORT NSString *const GPEditorSaveCommandNotification;

/** File ▸ Save As… (⇧⌘S). No object. */
FOUNDATION_EXPORT NSString *const GPEditorSaveAsCommandNotification;

/** File ▸ Close Tab (⌘W) was chosen. No object. */
FOUNDATION_EXPORT NSString *const GPEditorCloseTabCommandNotification;

/** File ▸ Next Tab (⌃Tab) was chosen. No object. */
FOUNDATION_EXPORT NSString *const GPEditorNextTabCommandNotification;

/** File ▸ Previous Tab (⌃⇧Tab) was chosen. No object. */
FOUNDATION_EXPORT NSString *const GPEditorPreviousTabCommandNotification;

NS_ASSUME_NONNULL_END
