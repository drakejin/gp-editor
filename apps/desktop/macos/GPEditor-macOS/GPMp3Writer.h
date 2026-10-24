// An MP3 file for File ▸ Export Audio…, encoded by LAME (LGPL, static library from scripts/audio-codecs/fetch.sh):
// joint stereo at a constant bit rate or LAME's VBR V2, with the LAME tag (frame count, encoder delay and padding)
// written over the first frame when the file is finished, so players know its exact length.

#import "GPAudioFileWriter.h"

NS_ASSUME_NONNULL_BEGIN

@interface GPMp3Writer : NSObject <GPAudioFileWriter>

/** `bitrate` in kbps for a constant bit rate; 0 for variable (V2). Creates the file. */
- (nullable instancetype)initWithURL:(NSURL *)url sampleRate:(double)sampleRate bitrate:(NSInteger)bitrate error:(NSError **)error NS_DESIGNATED_INITIALIZER;
- (instancetype)init NS_UNAVAILABLE;

@end

NS_ASSUME_NONNULL_END
