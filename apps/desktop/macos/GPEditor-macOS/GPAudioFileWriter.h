// File ▸ Export Audio…'s files: rendered audio (stereo, deinterleaved float, as GPMixRenderer renders it) encoded and
// written chunk by chunk. WAV and AIFF (16 or 24-bit PCM) and FLAC go through ExtAudioFile (macOS's own encoders); MP3
// through LAME (GPMp3Writer) and Ogg Vorbis through libvorbis (GPVorbisWriter), both built by
// scripts/audio-codecs/fetch.sh. Settings come from JS and are checked here.

#import <AVFoundation/AVFoundation.h>

NS_ASSUME_NONNULL_BEGIN

FOUNDATION_EXPORT NSErrorDomain const GPAudioExportErrorDomain;

/** What a file is written as: `{ format, sampleRate, bitDepth, mp3Bitrate, oggQuality }` from JS, checked. */
@interface GPAudioFileSettings : NSObject

/** "wav", "aiff", "flac", "mp3" or "ogg" — also the file's extension. */
@property (nonatomic, readonly, copy) NSString *format;
/** 44100 or 48000. */
@property (nonatomic, readonly) double sampleRate;
/** 16 or 24 (WAV, AIFF, FLAC). */
@property (nonatomic, readonly) NSInteger bitDepth;
/** MP3: 128, 192, 256 or 320 kbps constant bit rate; 0 = variable (LAME's V2). */
@property (nonatomic, readonly) NSInteger mp3Bitrate;
/** Ogg Vorbis: quality 0–10 (libvorbis' -q). */
@property (nonatomic, readonly) NSInteger oggQuality;

/** nil (with `error`) when a value is missing or outside what the export offers. */
+ (nullable instancetype)settingsFrom:(NSDictionary *)settings error:(NSError **)error;

@end

/** Encodes and writes one file. Not thread-safe; a writer that failed or was finished is not used again. */
@protocol GPAudioFileWriter <NSObject>

/** Appends the buffer's frames (stereo float at the settings' sample rate). */
- (BOOL)writeBuffer:(AVAudioPCMBuffer *)buffer error:(NSError **)error;

/** Flushes the encoder and closes the file. */
- (BOOL)finish:(NSError **)error;

@end

/** A writer creating the file at `url` (replacing one there) in the settings' format. */
FOUNDATION_EXPORT id<GPAudioFileWriter> _Nullable GPCreateAudioFileWriter(GPAudioFileSettings *settings, NSURL *url, NSError **error);

/** An error of the export's domain with a message for the user. */
FOUNDATION_EXPORT NSError *GPAudioExportError(NSInteger code, NSString *message);

/** The same for a failed file call: "<message>: <errno's text>". */
FOUNDATION_EXPORT NSError *GPAudioExportFileError(NSString *message);

NS_ASSUME_NONNULL_END
