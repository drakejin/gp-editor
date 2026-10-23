// The audio track on an AVAudioEngine (real-time or manual rendering): AVAudioPlayerNode → AVAudioUnitTimePitch (rate =
// the practice speed, pitch = the detune) → its own strip (a mixer: the volume) → the mix's bus (GPMixGraph), so the
// master strip applies to it too. The score follows the audio (gp-core's renderMidi with syncToAudioTrack), so a render
// plays stretches of the file ("runs": from a second of the render, a stretch of the file, at a rate) where it says;
// the time-pitch unit's latency is made up for by starting that much further into the audio.
// A playback dictionary: `{ assetId, runs: [{ atSeconds, fromSeconds, toSeconds, rate }], gain, detuneCents }`.
// Times called "engine seconds" count from the moment the player starts (the sequencer at the render's `fromSeconds`).
// Not thread-safe: use it on the queue given at init (manual rendering: the rendering thread).

#import <AVFoundation/AVFoundation.h>

#import "GPMixGraph.h"

NS_ASSUME_NONNULL_BEGIN

@interface GPAudioTrackPlayer : NSObject

/** `queue`: where rate changes are applied in real time (nil for manual rendering, which calls -applyRateAt: itself). */
- (instancetype)initWithEngine:(AVAudioEngine *)engine graph:(GPMixGraph *)graph queue:(nullable dispatch_queue_t)queue NS_DESIGNATED_INITIALIZER;
- (instancetype)init NS_UNAVAILABLE;

/**
 * Prepares `playback` from `fromSeconds` of the render: the file opened, the nodes connected (call it before the
 * sequencer starts: a new connection would stop it), the runs scheduled. NO with an error when the file cannot be
 * played; nil `playback`: nothing to play (NO, no error). Then start it.
 */
- (BOOL)prepare:(nullable NSDictionary *)playback fromSeconds:(NSTimeInterval)fromSeconds error:(NSError **)error;

/** Starts the prepared audio at a host time: when the sequencer is at the render's `fromSeconds`. */
- (void)startAtHostTime:(uint64_t)hostTime;

/** Starts the prepared audio with the next rendered sample (manual rendering starts the sequencer there too). */
- (void)startNow;

/** Engine seconds of the next rate change after `engineSeconds`; +inf when none. */
- (NSTimeInterval)nextRateChangeAfter:(NSTimeInterval)engineSeconds;

/** Sets the rate the audio plays at from `engineSeconds` on. */
- (void)applyRateAt:(NSTimeInterval)engineSeconds;

/** A new volume (gain 0–1) and detune (cents) heard at once. */
- (void)setGain:(double)gain detuneCents:(double)detuneCents;

/** Stops and forgets the scheduled audio. */
- (void)stop;

/** The time-pitch unit's latency, in seconds. */
@property (nonatomic, readonly) NSTimeInterval latency;

@end

NS_ASSUME_NONNULL_END
