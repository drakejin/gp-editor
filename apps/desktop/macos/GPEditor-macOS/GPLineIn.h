// Tools ▸ Line In: a real instrument, from an audio input (AVAudioEngine's inputNode on the chosen device), played
// through a track's effects (the head of its GPMixGraph strip; straight into the mix when the track has none) at an
// input gain, heard while monitoring is on. Needs microphone access (NSMicrophoneUsageDescription,
// com.apple.security.device.audio-input). The input device is set while the engine is stopped (GPMidiEngine does it).
// QA: outside the App Sandbox, GPEDITOR_QA_LINE_IN_HZ=<Hz> plays a sine instead of the input, with no access asked.
// Not thread-safe: use it on the queue that owns the engine, except `takePeakLevel`, which any thread may call.

#import <AVFoundation/AVFoundation.h>

#import "GPMixGraph.h"

NS_ASSUME_NONNULL_BEGIN

@interface GPLineIn : NSObject

/** `{ devices: [{ id, name, isBuiltIn }], defaultId, isOutputBuiltIn }`: the audio inputs, the system's default, and
 * whether the default output is the Mac's own (with a built-in mic, the speakers would feed back into it). */
+ (NSDictionary *)devicesState;

/** Asks for microphone access when it was never asked; `completion` (on any queue) says whether the app has it. */
+ (void)requestAccess:(void (^)(BOOL isGranted))completion;

- (instancetype)initWithEngine:(AVAudioEngine *)engine graph:(GPMixGraph *)graph NS_DESIGNATED_INITIALIZER;
- (instancetype)init NS_UNAVAILABLE;

/** Puts the input on the device (nil or unknown: the default) and connects it; call with the engine stopped. */
- (BOOL)connectDevice:(nullable NSString *)deviceId error:(NSError **)error;

/** Sends the input to the track's strip, or into the mix when the track has no effects (again after a rewire). */
- (void)routeToTrack:(NSInteger)trackIndex;

- (void)setGainDb:(double)gainDb isMonitoring:(BOOL)isMonitoring;

/** Disconnects the input (the engine keeps its input device until it is released). */
- (void)disconnect;

@property (nonatomic, readonly) BOOL isConnected;
@property (nonatomic, readonly) NSInteger trackIndex;

/** The input's peak since the last read, in dBFS (−120 for silence); reading starts a new measure. */
- (double)takePeakLevel;

@end

NS_ASSUME_NONNULL_END
