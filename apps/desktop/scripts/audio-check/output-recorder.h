// What a real-time engine plays, recorded for the restart check (restart-check.m): a tap on the engine's main mixer
// keeps the last seconds of the left channel, each buffer with the host time it rendered at, so a stretch of the output
// can be read back by host time — the moment a play was asked for — after the engine paused and ran again.

#import <AVFoundation/AVFoundation.h>

NS_ASSUME_NONNULL_BEGIN

@interface GPOutputRecorder : NSObject

/** Taps `engine`'s main mixer (the engine may run or not; the tap stays across its pauses). */
- (instancetype)initWithEngine:(AVAudioEngine *)engine NS_DESIGNATED_INITIALIZER;
- (instancetype)init NS_UNAVAILABLE;

/** Removes the tap. */
- (void)detach;

@property (nonatomic, readonly) double sampleRate;

/**
 * `seconds` of the output from the first sample rendered at or after `hostTime` (mach_absolute_time), waiting up to
 * `timeout` seconds for it to be rendered; nil when it was not (or has already left the recording).
 */
- (nullable NSData *)samplesFrom:(uint64_t)hostTime seconds:(double)seconds timeout:(double)timeout;

@end

/** mach_absolute_time `seconds` after `hostTime`. */
uint64_t HostTimeAfter(uint64_t hostTime, double seconds);

/**
 * Level in dB (0 dB = a full-scale sine) of the samples' content between `low` and `high` Hz (one Hann-windowed FFT
 * over them): a note's level at its fundamental, apart from other notes sounding.
 */
double BandLevelDb(NSData *samples, double sampleRate, double low, double high);

NS_ASSUME_NONNULL_END
