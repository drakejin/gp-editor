// The audio tracks' files for this run of the app (Guitar Pro 7/8's audio track): each file the JS side hands over (a
// .gp file's asset) or the user picks is kept once, as a file in the app's temporary folder named by its content's
// SHA-256 (its first 16 bytes as a UUID, like Guitar Pro's asset names), so the bytes cross the bridge once per
// document and JS keeps only the id. AVAudioFile reads them (WAV, AIFF, CAF, MP3, AAC/M4A, FLAC, Ogg Vorbis …). The
// waveform is computed once per file with Accelerate (min and max of every 1/200 s) and cached. The folder is emptied
// at launch. Thread-safe.

#import <AVFoundation/AVFoundation.h>

NS_ASSUME_NONNULL_BEGIN

@interface GPAudioAssets : NSObject

/** Keeps `data` (an audio file's bytes) and returns its id; nil with an error when AVAudioFile cannot read it. */
+ (nullable NSString *)storeData:(NSData *)data extension:(NSString *)extension error:(NSError **)error;

/** Keeps a copy of the audio file at `url` (one the user picked) and returns its id. */
+ (nullable NSString *)storeFileAtURL:(NSURL *)url error:(NSError **)error;

/** The kept file of an id; nil when there is none. */
+ (nullable NSURL *)URLForAssetId:(NSString *)assetId;

/** `{ assetId, durationSeconds, sampleRate, channelCount }` of a kept file; nil when there is none. */
+ (nullable NSDictionary *)infoForAssetId:(NSString *)assetId;

/**
 * The waveform: `{ bucketsPerSecond, durationSeconds, peaks }` — `peaks` base64 of signed bytes, min then max of each
 * bucket (−127…127, all channels). Computed once per file.
 */
+ (nullable NSDictionary *)peaksForAssetId:(NSString *)assetId error:(NSError **)error;

/** Empties the folder (at launch: last run's files). */
+ (void)removeAll;

@end

NS_ASSUME_NONNULL_END
