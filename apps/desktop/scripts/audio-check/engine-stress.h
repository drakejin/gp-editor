// The engine's stress run (engine-check.m runs it): GPMidiEngine driven at random the way GPPlayer and the effects UI
// drive it, to find what ends the app rather than what it sounds like.

#import <Foundation/Foundation.h>

NS_ASSUME_NONNULL_BEGIN

/**
 * `steps` random actions on a GPMidiEngine of its own, queued on one serial queue as React Native's bridge queues them:
 * a track's chain edited (an effect added, removed, moved, switched, its values or a chain preset), a slider dragged (a
 * burst of mixes), the master strip, play / stop / play again where JS restarts after a track's first or last effect,
 * hover previews on any track, program and controller changes, the position polled. Returns once all have run; an
 * exception or a crash in the engine ends the process.
 */
void RunEngineStress(NSURL *bankURL, NSData *song, int steps, unsigned seed);

NS_ASSUME_NONNULL_END
