// The mix on an AVAudioEngine (real-time or manual rendering): every sound goes into `bus`, then the master strip
// (EQ → compressor → reverb, each bypassed when off → the master gain → the limiter) → the main mixer at 0.8. A track with
// effects has a strip of its own: a head mixer (its instrument, and the line in when it is on that track) → its effects
// in order → `bus`. Tracks without effects play on the shared instrument straight into `bus`, as before effects existed.
// Not thread-safe: use it on the queue that owns the engine.

#import <AVFoundation/AVFoundation.h>

NS_ASSUME_NONNULL_BEGIN

@interface GPMixGraph : NSObject

- (instancetype)initWithEngine:(AVAudioEngine *)engine NS_DESIGNATED_INITIALIZER;
- (instancetype)init NS_UNAVAILABLE;

/** Where instruments and strips meet: the master strip's input. */
@property (nonatomic, readonly) AVAudioMixerNode *bus;

/**
 * Applies `{ tracks: [effects or null, one per song track], master: { effects, gainDb } }` (gp-core's model as JSON).
 * New values of the same effects are heard at once; YES when nodes were added or removed, which stops a playing
 * sequencer (the caller starts it again where it was).
 */
- (BOOL)applyMix:(NSDictionary *)mix;

/** The head mixer of a track's strip; nil when the track has no effects (it plays on the shared instrument). */
- (nullable AVAudioMixerNode *)stripInputForTrack:(NSInteger)trackIndex;

@end

NS_ASSUME_NONNULL_END
