#import "GPMixRenderer.h"

#import "GPMixGraph.h"
#import "GPTrackInstruments.h"

static const AVAudioFrameCount kChunkFrames = 4096;

@implementation GPMixRenderer

+ (BOOL)renderMidi:(NSData *)midi
           bankURL:(nullable NSURL *)bankURL
               mix:(NSDictionary *)mix
           seconds:(NSTimeInterval)seconds
        sampleRate:(double)sampleRate
             error:(NSError **)error
             chunk:(void (^)(AVAudioPCMBuffer *buffer, BOOL *stop))chunk
{
  AVAudioEngine *engine = [AVAudioEngine new];
  AVAudioFormat *format = [[AVAudioFormat alloc] initStandardFormatWithSampleRate:sampleRate channels:2];
  if (![engine enableManualRenderingMode:AVAudioEngineManualRenderingModeOffline format:format maximumFrameCount:kChunkFrames error:error]) {
    return NO;
  }
  GPMixGraph *graph = [[GPMixGraph alloc] initWithEngine:engine];
  GPTrackInstruments *instruments = [[GPTrackInstruments alloc] initWithEngine:engine graph:graph];
  [graph applyMix:mix];
  if (![instruments prepareBank:bankURL error:error] || ![engine startAndReturnError:error]) {
    return NO;
  }
  AVAudioSequencer *sequencer = [[AVAudioSequencer alloc] initWithAudioEngine:engine];
  if (![sequencer loadFromData:midi options:AVMusicSequenceLoadSMF_PreserveTracks error:error]) {
    return NO;
  }
  [instruments routeSequencer:sequencer];
  [sequencer prepareToPlay];
  if (![sequencer startAndReturnError:error]) {
    return NO;
  }
  AVAudioPCMBuffer *buffer = [[AVAudioPCMBuffer alloc] initWithPCMFormat:engine.manualRenderingFormat frameCapacity:kChunkFrames];
  AVAudioFramePosition total = (AVAudioFramePosition)llround(MAX(0, seconds) * sampleRate);
  BOOL isStopped = NO;
  while (engine.manualRenderingSampleTime < total && !isStopped) {
    AVAudioFrameCount frames = (AVAudioFrameCount)MIN((AVAudioFramePosition)kChunkFrames, total - engine.manualRenderingSampleTime);
    if ([engine renderOffline:frames toBuffer:buffer error:error] != AVAudioEngineManualRenderingStatusSuccess) {
      [engine stop];
      return NO;
    }
    chunk(buffer, &isStopped);
  }
  [sequencer stop];
  [engine stop];
  return YES;
}

+ (nullable AVAudioPCMBuffer *)renderMidi:(NSData *)midi
                                  bankURL:(nullable NSURL *)bankURL
                                      mix:(NSDictionary *)mix
                                  seconds:(NSTimeInterval)seconds
                               sampleRate:(double)sampleRate
                                    error:(NSError **)error
{
  AVAudioFormat *format = [[AVAudioFormat alloc] initStandardFormatWithSampleRate:sampleRate channels:2];
  AVAudioPCMBuffer *all = [[AVAudioPCMBuffer alloc] initWithPCMFormat:format frameCapacity:(AVAudioFrameCount)llround(MAX(0, seconds) * sampleRate) + 1];
  BOOL isRendered = [self renderMidi:midi bankURL:bankURL mix:mix seconds:seconds sampleRate:sampleRate error:error chunk:^(AVAudioPCMBuffer *buffer, BOOL *stop) {
    for (AVAudioChannelCount channel = 0; channel < 2; channel++) {
      memcpy(all.floatChannelData[channel] + all.frameLength, buffer.floatChannelData[channel], buffer.frameLength * sizeof(float));
    }
    all.frameLength += buffer.frameLength;
  }];
  return isRendered ? all : nil;
}

@end
