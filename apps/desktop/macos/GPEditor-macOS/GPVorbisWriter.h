// An Ogg Vorbis file for File ▸ Export Audio…, encoded by libvorbis in an Ogg stream by libogg (BSD, static libraries
// from scripts/audio-codecs/fetch.sh): variable bit rate at a quality of 0–10 (vorbis' -q; 6 is about 192 kbps). The
// last page's granule position is the exact sample count, so decoders know the file's length.

#import "GPAudioFileWriter.h"

NS_ASSUME_NONNULL_BEGIN

@interface GPVorbisWriter : NSObject <GPAudioFileWriter>

/** Creates the file and writes the three Vorbis headers. */
- (nullable instancetype)initWithURL:(NSURL *)url sampleRate:(double)sampleRate quality:(NSInteger)quality error:(NSError **)error NS_DESIGNATED_INITIALIZER;
- (instancetype)init NS_UNAVAILABLE;

@end

NS_ASSUME_NONNULL_END
