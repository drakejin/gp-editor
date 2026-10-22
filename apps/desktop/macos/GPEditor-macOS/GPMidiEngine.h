// Plays Standard MIDI Files through one AVAudioEngine: a multitimbral MIDISynth that loads the sound bank once (again
// only when the selected bank changes), a peak limiter, and an AVAudioSequencer per song. Once the bank is loaded,
// starting playback costs a sequence load (milliseconds), and a channel's program can change while the song plays
// (instrument changes are heard at once, without re-rendering the song). MIDISynth keeps the whole bank in memory
// (about 220 MB for GeneralUser GS, 30 MB for the macOS bank), so the engine is released a minute after playback stops;
// the first play after that, or after another bank is chosen, loads the bank again (about 250 ms for GeneralUser GS).
// Not thread-safe: every method runs on the queue given at init, which is also where the idle release runs.

#import <Foundation/Foundation.h>

NS_ASSUME_NONNULL_BEGIN

@interface GPMidiEngine : NSObject

- (instancetype)initWithQueue:(dispatch_queue_t)queue NS_DESIGNATED_INITIALIZER;
- (instancetype)init NS_UNAVAILABLE;

/** Loads the MIDI file and plays it from `seconds` with the bank at `bankURL` (nil: the synth's built-in bank). */
- (BOOL)playData:(NSData *)midi fromSeconds:(NSTimeInterval)seconds bankURL:(nullable NSURL *)bankURL error:(NSError **)error;

/** Stops the song; the engine and the loaded bank stay ready for the next one, for a minute. */
- (void)stop;

/** Position in the playing song, in seconds of the MIDI file. */
@property (nonatomic, readonly) NSTimeInterval positionSeconds;

/** True while a song plays and has not reached its end. */
@property (nonatomic, readonly) BOOL isPlaying;

/** Switches a MIDI channel (0–15) to a General MIDI program (0–127) now, for the rest of the playing song. */
- (void)setProgram:(UInt8)program onChannel:(UInt8)channel;

/** Sends a control change (e.g. 7 = volume, 10 = pan) to a MIDI channel now, in the playing song. */
- (void)setController:(UInt8)controller value:(UInt8)value onChannel:(UInt8)channel;

@end

NS_ASSUME_NONNULL_END
