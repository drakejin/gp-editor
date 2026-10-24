#import "GPAudioExporter.h"

#import <Accelerate/Accelerate.h>

#import "GPMixRenderer.h"
#import "GPAppStrings.h"

const NSInteger GPAudioExportCancelledCode = 100;
const NSTimeInterval GPAudioExportMaxTailSeconds = 10;

/** −90 dBFS: below a 16-bit file's last bit. */
static const float kSilentPeak = 3.1623e-5f;
/** The tail ends once this long is silent. */
static const NSTimeInterval kSilenceSeconds = 0.5;

/** The rendered chunk's peak over both channels. */
static float PeakOf(AVAudioPCMBuffer *buffer)
{
  float peak = 0;
  for (AVAudioChannelCount channel = 0; channel < buffer.format.channelCount; channel++) {
    float channelPeak = 0;
    vDSP_maxmgv(buffer.floatChannelData[channel], 1, &channelPeak, buffer.frameLength);
    peak = MAX(peak, channelPeak);
  }
  return peak;
}

/** Where the render stands: frames written, the silence running at the end, and how it stopped. */
@interface GPExportRun : NSObject
@property (nonatomic) AVAudioFramePosition written;
@property (nonatomic) AVAudioFramePosition silent;
@property (nonatomic) BOOL isCancelled;
@property (nonatomic, strong, nullable) NSError *failure;
@end

@implementation GPExportRun
@end

static AVAudioFramePosition Conclude(id<GPAudioFileWriter> writer, GPExportRun *run, NSError *_Nullable failure, NSURL *url, NSError **error);

@implementation GPAudioExporter

+ (AVAudioFramePosition)exportMidi:(NSData *)midi
                           seconds:(NSTimeInterval)seconds
                               mix:(NSDictionary *)mix
                           bankURL:(nullable NSURL *)bankURL
                          settings:(GPAudioFileSettings *)settings
                               url:(NSURL *)url
                          progress:(BOOL (^)(double fraction))progress
                             error:(NSError **)error
{
  return [self exportMidi:midi seconds:seconds mix:mix audioTrack:nil bankURL:bankURL settings:settings url:url progress:progress error:error];
}

+ (AVAudioFramePosition)exportMidi:(NSData *)midi
                           seconds:(NSTimeInterval)seconds
                               mix:(NSDictionary *)mix
                        audioTrack:(nullable NSDictionary *)audioTrack
                           bankURL:(nullable NSURL *)bankURL
                          settings:(GPAudioFileSettings *)settings
                               url:(NSURL *)url
                          progress:(BOOL (^)(double fraction))progress
                             error:(NSError **)error
{
  id<GPAudioFileWriter> writer = GPCreateAudioFileWriter(settings, url, error);
  if (writer == nil) {
    [[NSFileManager defaultManager] removeItemAtURL:url error:nil];
    return -1;
  }
  double rate = settings.sampleRate;
  AVAudioFramePosition songFrames = (AVAudioFramePosition)llround(MAX(0, seconds) * rate);
  AVAudioFramePosition silenceFrames = (AVAudioFramePosition)llround(kSilenceSeconds * rate);
  GPExportRun *run = [GPExportRun new];
  NSError *renderError = nil;
  BOOL isRendered = [GPMixRenderer renderMidi:midi bankURL:bankURL mix:mix audioTrack:audioTrack seconds:MAX(0, seconds) + GPAudioExportMaxTailSeconds sampleRate:rate error:&renderError chunk:^(AVAudioPCMBuffer *buffer, BOOL *stop) {
    NSError *writeError = nil;
    if (![writer writeBuffer:buffer error:&writeError]) {
      run.failure = writeError;
      *stop = YES;
      return;
    }
    BOOL isTail = run.written >= songFrames;
    run.written += buffer.frameLength;
    run.silent = isTail && PeakOf(buffer) < kSilentPeak ? run.silent + buffer.frameLength : 0;
    if (run.silent >= silenceFrames) {
      *stop = YES;
    }
    if (!progress(MIN(1.0, (double)run.written / (double)MAX(1, songFrames)))) {
      run.isCancelled = YES;
      *stop = YES;
    }
  }];
  NSError *failure = !isRendered ? (renderError ?: GPAudioExportError(5, GPLocalizedString(@"The song could not be rendered"))) : run.failure;
  return Conclude(writer, run, failure, url, error);
}

/** Finishes the file, or removes it when the render failed or was cancelled: the frames written, or -1. */
static AVAudioFramePosition Conclude(id<GPAudioFileWriter> writer, GPExportRun *run, NSError *_Nullable failure, NSURL *url, NSError **error)
{
  if (failure == nil && !run.isCancelled) {
    NSError *finishError = nil;
    failure = [writer finish:&finishError] ? nil : finishError;
  }
  if (failure == nil && !run.isCancelled) {
    return run.written;
  }
  [[NSFileManager defaultManager] removeItemAtURL:url error:nil];
  if (error != NULL) {
    *error = failure ?: GPAudioExportError(GPAudioExportCancelledCode, GPLocalizedString(@"The export was cancelled"));
  }
  return -1;
}

@end
