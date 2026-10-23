// The audio track's checks (audio-check.m runs them): synthetic recordings played under an offline render.

#import <Foundation/Foundation.h>

NS_ASSUME_NONNULL_BEGIN

/** Prints a PASS / FAIL line per check; returns how many failed. */
int CheckAudioTrack(NSURL *bankURL);

NS_ASSUME_NONNULL_END
