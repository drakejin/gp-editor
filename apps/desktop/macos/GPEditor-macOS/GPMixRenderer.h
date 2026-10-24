// Offline rendering of a song with its effects: the graph GPMidiEngine plays (GPMixGraph + GPTrackInstruments, an
// AVAudioSequencer, the audio track's GPAudioTrackPlayer) on an AVAudioEngine in manual rendering mode, as fast as the
// CPU allows. For an audio export, and for scripts/audio-check (which checks the effects by rendering, since nobody
// listens there).

#import <AVFoundation/AVFoundation.h>

NS_ASSUME_NONNULL_BEGIN

@interface GPMixRenderer : NSObject

/**
 * Renders `seconds` of the MIDI file (gp-core's renderMidi) through `mix` (`{ tracks, master }`, see GPMixGraph) with
 * the bank at `bankURL`, stereo at `sampleRate`, handing each rendered chunk (at most 4096 frames, reused) to `chunk`;
 * `chunk` setting `*stop` ends the render there (still a success).
 */
+ (BOOL)renderMidi:(NSData *)midi
           bankURL:(nullable NSURL *)bankURL
               mix:(NSDictionary *)mix
           seconds:(NSTimeInterval)seconds
        sampleRate:(double)sampleRate
             error:(NSError **)error
             chunk:(void (^)(AVAudioPCMBuffer *buffer, BOOL *stop))chunk;

/**
 * The same with the song's audio track under it: `audioTrack` is GPAudioTrackPlayer's playback dictionary (the runs of
 * renderMidi with syncToAudioTrack, the gain, the detune), nil for none.
 */
+ (BOOL)renderMidi:(NSData *)midi
           bankURL:(nullable NSURL *)bankURL
               mix:(NSDictionary *)mix
        audioTrack:(nullable NSDictionary *)audioTrack
           seconds:(NSTimeInterval)seconds
        sampleRate:(double)sampleRate
             error:(NSError **)error
             chunk:(void (^)(AVAudioPCMBuffer *buffer, BOOL *stop))chunk;

/** The same, into one buffer. */
+ (nullable AVAudioPCMBuffer *)renderMidi:(NSData *)midi
                                  bankURL:(nullable NSURL *)bankURL
                                      mix:(NSDictionary *)mix
                                  seconds:(NSTimeInterval)seconds
                               sampleRate:(double)sampleRate
                                    error:(NSError **)error;

@end

NS_ASSUME_NONNULL_END
