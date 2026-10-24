// File ▸ Export Audio…: one file of a song (gp-core's renderMidi, as playback plays it) rendered offline through the
// playback graph — GPMixRenderer: the sound bank, the instruments, the tracks' effects, the master — and written as it
// renders (GPAudioFileWriter), as fast as the CPU allows. After the song a tail lets reverbs and delays ring out: the
// render goes on until half a second is silent (below −90 dBFS), at most `GPAudioExportMaxTailSeconds`.
// Runs on the caller's queue; one export per call, nothing shared.

#import <AVFoundation/AVFoundation.h>

#import "GPAudioFileWriter.h"

NS_ASSUME_NONNULL_BEGIN

/** The error code of an export stopped by its progress block. */
FOUNDATION_EXPORT const NSInteger GPAudioExportCancelledCode;

/** The longest tail after the song's end. */
FOUNDATION_EXPORT const NSTimeInterval GPAudioExportMaxTailSeconds;

@interface GPAudioExporter : NSObject

/**
 * Renders `seconds` of the MIDI file and its tail through `mix` (`{ tracks, master }`, GPMixGraph) with the bank at
 * `bankURL`, writing them to `url` as `settings` say. `progress` gets the fraction of the song done (0–1) after each
 * chunk and answers whether to go on. Returns the frames written, or -1 with `error` set (code
 * GPAudioExportCancelledCode when `progress` answered NO); a file that was not finished is removed.
 */
+ (AVAudioFramePosition)exportMidi:(NSData *)midi
                           seconds:(NSTimeInterval)seconds
                               mix:(NSDictionary *)mix
                           bankURL:(nullable NSURL *)bankURL
                          settings:(GPAudioFileSettings *)settings
                               url:(NSURL *)url
                          progress:(BOOL (^)(double fraction))progress
                             error:(NSError **)error;

@end

NS_ASSUME_NONNULL_END
