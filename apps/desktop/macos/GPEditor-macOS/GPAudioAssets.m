#import "GPAudioAssets.h"

#import <Accelerate/Accelerate.h>
#import <CommonCrypto/CommonDigest.h>

static NSString *const kErrorDomain = @"GPAudioAssets";
/** Waveform buckets per second of audio: enough for 2.5 ms per point at the lane's widest zoom. */
static const double kBucketsPerSecond = 200;
static const AVAudioFrameCount kReadFrames = 65536;
/** An audio file larger than this is refused (a long uncompressed recording stays far below). */
static const unsigned long long kMaxFileBytes = 1ULL << 30;
static const float kPeakScale = 127;

@implementation GPAudioAssets

/** id → kept file, and id → waveform; read and written on `StateQueue` only. */
static NSMutableDictionary<NSString *, NSURL *> *gFiles;
static NSMutableDictionary<NSString *, NSDictionary *> *gPeaks;

static dispatch_queue_t StateQueue(void)
{
  static dispatch_queue_t queue;
  static dispatch_once_t once;
  dispatch_once(&once, ^{
    queue = dispatch_queue_create("com.drakejin.gpeditor.audio-assets", DISPATCH_QUEUE_SERIAL);
    gFiles = [NSMutableDictionary dictionary];
    gPeaks = [NSMutableDictionary dictionary];
  });
  return queue;
}

static NSError *AssetError(NSString *message)
{
  return [NSError errorWithDomain:kErrorDomain code:1 userInfo:@{NSLocalizedDescriptionKey : message}];
}

static NSURL *Folder(void)
{
  NSURL *folder = [[NSURL fileURLWithPath:NSTemporaryDirectory() isDirectory:YES] URLByAppendingPathComponent:@"GPEditorAudio" isDirectory:YES];
  [[NSFileManager defaultManager] createDirectoryAtURL:folder withIntermediateDirectories:YES attributes:nil error:nil];
  return folder;
}

/** The SHA-256 of the bytes, its first 16 bytes written as a UUID (version 5 and variant bits set, as Guitar Pro's). */
static NSString *AssetIdOf(NSData *data)
{
  unsigned char digest[CC_SHA256_DIGEST_LENGTH];
  CC_SHA256(data.bytes, (CC_LONG)data.length, digest);
  digest[6] = (unsigned char)((digest[6] & 0x0f) | 0x50);
  digest[8] = (unsigned char)((digest[8] & 0x3f) | 0x80);
  NSMutableString *text = [NSMutableString string];
  for (int index = 0; index < 16; index++) {
    [text appendFormat:(index == 4 || index == 6 || index == 8 || index == 10) ? @"-%02x" : @"%02x", digest[index]];
  }
  return text;
}

/** Letters and digits, at most 8, lower case; "audio" for anything else (AVAudioFile reads the content anyway). */
static NSString *SafeExtension(NSString *extension)
{
  NSString *lower = extension.lowercaseString;
  NSCharacterSet *invalid = [NSCharacterSet alphanumericCharacterSet].invertedSet;
  BOOL isSafe = lower.length > 0 && lower.length <= 8 && [lower rangeOfCharacterFromSet:invalid].location == NSNotFound;
  return isSafe ? lower : @"audio";
}

static AVAudioFile *OpenFile(NSURL *url, NSError **error)
{
  AVAudioFile *file = [[AVAudioFile alloc] initForReading:url error:error];
  if (file != nil && file.length <= 0) {
    if (error != NULL) {
      *error = AssetError(@"The audio file holds no sound");
    }
    return nil;
  }
  return file;
}

+ (nullable NSString *)storeData:(NSData *)data extension:(NSString *)extension error:(NSError **)error
{
  if (data.length == 0 || data.length > kMaxFileBytes) {
    if (error != NULL) {
      *error = AssetError(data.length == 0 ? @"The audio file is empty" : @"The audio file is larger than 1 GB");
    }
    return nil;
  }
  NSString *assetId = AssetIdOf(data);
  if ([self URLForAssetId:assetId] != nil) {
    return assetId;
  }
  NSURL *url = [Folder() URLByAppendingPathComponent:[NSString stringWithFormat:@"%@.%@", assetId, SafeExtension(extension)]];
  NSError *failure = nil;
  if (![data writeToURL:url options:NSDataWritingAtomic error:&failure] || OpenFile(url, &failure) == nil) {
    [[NSFileManager defaultManager] removeItemAtURL:url error:nil];
    if (error != NULL) {
      *error = AssetError([NSString stringWithFormat:@"This audio file cannot be played: %@", failure.localizedDescription ?: @"unknown format"]);
    }
    return nil;
  }
  dispatch_sync(StateQueue(), ^{
    gFiles[assetId] = url;
  });
  return assetId;
}

+ (nullable NSString *)storeFileAtURL:(NSURL *)url error:(NSError **)error
{
  NSData *data = [NSData dataWithContentsOfURL:url options:NSDataReadingMappedIfSafe error:error];
  return data == nil ? nil : [self storeData:data extension:url.pathExtension error:error];
}

+ (nullable NSURL *)URLForAssetId:(NSString *)assetId
{
  __block NSURL *url = nil;
  dispatch_sync(StateQueue(), ^{
    url = gFiles[assetId];
  });
  return url != nil && [url checkResourceIsReachableAndReturnError:nil] ? url : nil;
}

+ (nullable NSDictionary *)infoForAssetId:(NSString *)assetId
{
  NSURL *url = [self URLForAssetId:assetId];
  AVAudioFile *file = url == nil ? nil : OpenFile(url, nil);
  if (file == nil) {
    return nil;
  }
  double rate = file.fileFormat.sampleRate;
  return @{
    @"assetId" : assetId,
    @"durationSeconds" : @(rate > 0 ? (double)file.length / rate : 0),
    @"sampleRate" : @(rate),
    @"channelCount" : @(file.fileFormat.channelCount),
  };
}

/** Min and max of every bucket of the file (all channels), as signed bytes: min, max, min, max … */
static NSData *ComputePeaks(AVAudioFile *file, NSError **error)
{
  AVAudioFormat *format = file.processingFormat;
  double framesPerBucket = format.sampleRate / kBucketsPerSecond;
  NSUInteger bucketCount = (NSUInteger)ceil((double)file.length / framesPerBucket);
  NSMutableData *peaks = [NSMutableData dataWithLength:bucketCount * 2];
  int8_t *out = peaks.mutableBytes;
  AVAudioPCMBuffer *buffer = [[AVAudioPCMBuffer alloc] initWithPCMFormat:format frameCapacity:kReadFrames];
  AVAudioFramePosition position = 0;
  NSUInteger bucket = 0;
  AVAudioFramePosition bucketEnd = (AVAudioFramePosition)llround(framesPerBucket);
  float low = 0;
  float high = 0;
  while (bucket < bucketCount && [file readIntoBuffer:buffer error:error] && buffer.frameLength > 0) {
    AVAudioFrameCount offset = 0;
    while (offset < buffer.frameLength && bucket < bucketCount) {
      vDSP_Length count = (vDSP_Length)MAX(1, MIN((AVAudioFramePosition)(buffer.frameLength - offset), bucketEnd - position - offset));
      for (AVAudioChannelCount channel = 0; channel < format.channelCount; channel++) {
        float channelLow = 0;
        float channelHigh = 0;
        vDSP_minv(buffer.floatChannelData[channel] + offset, 1, &channelLow, count);
        vDSP_maxv(buffer.floatChannelData[channel] + offset, 1, &channelHigh, count);
        low = MIN(low, channelLow);
        high = MAX(high, channelHigh);
      }
      offset += (AVAudioFrameCount)count;
      if (position + offset >= bucketEnd) {
        out[bucket * 2] = (int8_t)lrintf(fmaxf(-1, low) * kPeakScale);
        out[bucket * 2 + 1] = (int8_t)lrintf(fminf(1, high) * kPeakScale);
        bucket += 1;
        bucketEnd = (AVAudioFramePosition)llround((double)(bucket + 1) * framesPerBucket);
        low = 0;
        high = 0;
      }
    }
    position += buffer.frameLength;
  }
  if (bucket < bucketCount) {
    out[bucket * 2] = (int8_t)lrintf(fmaxf(-1, low) * kPeakScale);
    out[bucket * 2 + 1] = (int8_t)lrintf(fminf(1, high) * kPeakScale);
  }
  return peaks;
}

+ (nullable NSDictionary *)peaksForAssetId:(NSString *)assetId error:(NSError **)error
{
  __block NSDictionary *cached = nil;
  dispatch_sync(StateQueue(), ^{
    cached = gPeaks[assetId];
  });
  if (cached != nil) {
    return cached;
  }
  NSURL *url = [self URLForAssetId:assetId];
  AVAudioFile *file = url == nil ? nil : OpenFile(url, error);
  if (file == nil) {
    if (url == nil && error != NULL) {
      *error = AssetError(@"The audio track's file is not loaded");
    }
    return nil;
  }
  NSData *peaks = ComputePeaks(file, error);
  if (peaks == nil) {
    return nil;
  }
  double rate = file.processingFormat.sampleRate;
  NSDictionary *result = @{
    @"bucketsPerSecond" : @(kBucketsPerSecond),
    @"durationSeconds" : @(rate > 0 ? (double)file.length / rate : 0),
    @"peaks" : [peaks base64EncodedStringWithOptions:0],
  };
  dispatch_sync(StateQueue(), ^{
    gPeaks[assetId] = result;
  });
  return result;
}

+ (void)removeAll
{
  NSFileManager *manager = [NSFileManager defaultManager];
  NSURL *folder = Folder();
  for (NSURL *url in [manager contentsOfDirectoryAtURL:folder includingPropertiesForKeys:nil options:0 error:nil] ?: @[]) {
    [manager removeItemAtURL:url error:nil];
  }
  dispatch_sync(StateQueue(), ^{
    [gFiles removeAllObjects];
    [gPeaks removeAllObjects];
  });
}

@end
