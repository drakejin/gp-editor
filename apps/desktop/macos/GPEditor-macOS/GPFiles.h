// The quit question's native half (GPFiles.m): quitting, or closing the score window, while JS has a tab with unsaved
// changes asks JS first (the event quitRequested); JS asks about each edited tab — Save, Don't Save, Cancel — and calls
// finishQuit when every one is answered, which quits (or closes the window) again without asking. Main thread.

#import <AppKit/AppKit.h>

NS_ASSUME_NONNULL_BEGIN

/** AppDelegate.applicationShouldTerminate: YES when JS was asked first (cancel this quit; finishQuit quits again). */
FOUNDATION_EXPORT BOOL GPFilesAsksBeforeQuit(void);

/** The score window's close button: YES when JS was asked first (finishQuit closes the window). */
FOUNDATION_EXPORT BOOL GPFilesAsksBeforeClosing(NSWindow *window);

NS_ASSUME_NONNULL_END
