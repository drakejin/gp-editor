// The tuner's microphone (GPAudioInput.m) as AppDelegate.swift sees it when the app quits.

#import <Foundation/Foundation.h>

NS_ASSUME_NONNULL_BEGIN

/**
 * Stops the tuner's microphone; YES when it was running. Frames already sent keep JS rendering for a moment, and a
 * render while the process exits aborts it, so the app waits a little before quitting when this answers YES.
 */
FOUNDATION_EXPORT BOOL GPAudioInputStopForQuit(void);

NS_ASSUME_NONNULL_END
