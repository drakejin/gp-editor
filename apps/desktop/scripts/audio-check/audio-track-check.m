// The audio track's checks: synthetic recordings (a sine, a click track) kept by GPAudioAssets and played under a silent
// song through GPAudioTrackPlayer, offline (GPMixRenderer). The time-pitch unit must keep a sine's pitch at half speed,
// the detune must move it, the gain must scale it, and the runs must put the audio where the score is — at full and
// half speed, and across a rate change (the speed trainer's next pass).

#import "audio-track-check.h"

#import <AVFoundation/AVFoundation.h>

#import "GPAudioAssets.h"
#import "GPMixRenderer.h"
#import "audio-measures.h"

static int failures = 0;
static NSURL *bank;

static void Report(BOOL isPassed, NSString *name, NSString *detail)
{
  printf("%s %s: %s\n", isPassed ? "PASS" : "FAIL", name.UTF8String, detail.UTF8String);
  failures += isPassed ? 0 : 1;
}

static const double kSeconds = 4;
static const double kSineHz = 440;
/** The click track's bursts: 20 ms of 1 kHz every half second from 1 s. */
static const double kClickHz = 1000;
static const double kClickLength = 0.02;
static const double kFirstClick = 1.0;
static const double kClickEvery = 0.5;
/** A click starts where the left channel first rises above half its level (the time-pitch unit spreads a little of a
 * slowed click before it). */
static const float kOnsetLevel = 0.4f;

/** A mono WAV of kSeconds at kRate, its samples from `sample(t)`, kept by GPAudioAssets; its asset id. */
static NSString *StoreRecording(NSString *name, float (^sample)(double seconds))
{
  AVAudioFormat *format = [[AVAudioFormat alloc] initStandardFormatWithSampleRate:kRate channels:1];
  AVAudioFrameCount count = (AVAudioFrameCount)(kSeconds * kRate);
  AVAudioPCMBuffer *buffer = [[AVAudioPCMBuffer alloc] initWithPCMFormat:format frameCapacity:count];
  for (AVAudioFrameCount index = 0; index < count; index++) {
    buffer.floatChannelData[0][index] = sample(index / kRate);
  }
  buffer.frameLength = count;
  NSURL *url = [[NSURL fileURLWithPath:NSTemporaryDirectory()] URLByAppendingPathComponent:[name stringByAppendingString:@".wav"]];
  NSDictionary *settings = @{AVFormatIDKey : @(kAudioFormatLinearPCM), AVSampleRateKey : @(kRate), AVNumberOfChannelsKey : @1, AVLinearPCMBitDepthKey : @16};
  NSError *error = nil;
  AVAudioFile *file = [[AVAudioFile alloc] initForWriting:url settings:settings error:&error];
  if (file == nil || ![file writeFromBuffer:buffer error:&error]) {
    Report(NO, @"audio track file", error.localizedDescription ?: @"not written");
    exit(1);
  }
  file = nil;
  NSString *assetId = [GPAudioAssets storeFileAtURL:url error:&error];
  if (assetId == nil) {
    Report(NO, @"audio track file", error.localizedDescription ?: @"not kept");
    exit(1);
  }
  return assetId;
}

static NSDictionary *Run(double at, double from, double to, double rate)
{
  return @{@"atSeconds" : @(at), @"fromSeconds" : @(from), @"toSeconds" : @(to), @"rate" : @(rate)};
}

/** `seconds` of a silent song with the audio track playing `runs`. */
static AVAudioPCMBuffer *RenderTrack(NSString *assetId, NSArray *runs, double gain, double detuneCents, double seconds)
{
  NSDictionary *audio = @{@"assetId" : assetId, @"runs" : runs, @"gain" : @(gain), @"detuneCents" : @(detuneCents)};
  NSError *error = nil;
  __block AVAudioPCMBuffer *all = [[AVAudioPCMBuffer alloc] initWithPCMFormat:[[AVAudioFormat alloc] initStandardFormatWithSampleRate:kRate channels:2]
                                                                 frameCapacity:(AVAudioFrameCount)(seconds * kRate) + 1];
  BOOL isRendered = [GPMixRenderer renderMidi:ChordMidi(0, @[]) bankURL:bank mix:@{} audioTrack:audio seconds:seconds sampleRate:kRate error:&error chunk:^(AVAudioPCMBuffer *buffer) {
    for (AVAudioChannelCount channel = 0; channel < 2; channel++) {
      memcpy(all.floatChannelData[channel] + all.frameLength, buffer.floatChannelData[channel], buffer.frameLength * sizeof(float));
    }
    all.frameLength += buffer.frameLength;
  }];
  if (!isRendered) {
    Report(NO, @"audio track render", error.localizedDescription ?: @"failed");
    exit(1);
  }
  return all;
}

/** Seconds of the first sample after `from` above kOnsetLevel; −1 when none. */
static double OnsetAfter(AVAudioPCMBuffer *buffer, double from)
{
  for (AVAudioFramePosition index = (AVAudioFramePosition)(from * kRate); index < buffer.frameLength; index++) {
    if (fabsf(buffer.floatChannelData[0][index]) > kOnsetLevel) {
      return index / kRate;
    }
  }
  return -1;
}

/** The onsets after each of `searchFrom` against `expected`, within `tolerance` seconds. */
static void CheckOnsets(NSString *name, AVAudioPCMBuffer *buffer, NSArray<NSNumber *> *searchFrom, NSArray<NSNumber *> *expected, double tolerance)
{
  NSMutableArray<NSString *> *found = [NSMutableArray array];
  BOOL isAligned = YES;
  for (NSUInteger index = 0; index < expected.count; index++) {
    double onset = OnsetAfter(buffer, searchFrom[index].doubleValue);
    isAligned = isAligned && fabs(onset - expected[index].doubleValue) <= tolerance;
    [found addObject:[NSString stringWithFormat:@"%.3f (%.3f)", onset, expected[index].doubleValue]];
  }
  Report(isAligned, name, [NSString stringWithFormat:@"clicks at %@ s (expected ±%.0f ms)", [found componentsJoinedByString:@", "], tolerance * 1000]);
}

static void CheckPitch(NSString *sine)
{
  double halfSpeed = DominantFrequency(RenderTrack(sine, @[ Run(0, 0, kSeconds, 0.5) ], 1, 0, 3), 1.0);
  Report(fabs(halfSpeed - kSineHz) < 6, @"audio track at 50%", [NSString stringWithFormat:@"a %.0f Hz sine at half speed peaks at %.1f Hz", kSineHz, halfSpeed]);
  double detuned = DominantFrequency(RenderTrack(sine, @[ Run(0, 0, kSeconds, 1) ], 1, 100, 3), 1.0);
  double semitone = kSineHz * pow(2, 1.0 / 12);
  Report(fabs(detuned - semitone) < 6, @"audio track detune", [NSString stringWithFormat:@"+100 cents moves %.0f Hz to %.1f Hz (%.1f expected)", kSineHz, detuned, semitone]);
  double full = Power(RenderTrack(sine, @[ Run(0, 0, kSeconds, 1) ], 1, 0, 2), 0.5, 1.5);
  double quarter = Power(RenderTrack(sine, @[ Run(0, 0, kSeconds, 1) ], 0.25, 0, 2), 0.5, 1.5);
  double gainDb = 10 * log10(quarter / full);
  Report(fabs(gainDb - Db(0.25)) < 0.5, @"audio track gain", [NSString stringWithFormat:@"gain 0.25: %+.2f dB (%.2f expected)", gainDb, Db(0.25)]);
}

static void CheckSync(NSString *clicks)
{
  // The score starts 0.25 s before the first click of the recording: a sync point there.
  CheckOnsets(@"audio track sync", RenderTrack(clicks, @[ Run(0, 0.75, kSeconds, 1) ], 1, 0, 2), @[ @0, @0.5, @1.0 ], @[ @0.25, @0.75, @1.25 ], 0.005);
  CheckOnsets(@"audio track sync at 50%", RenderTrack(clicks, @[ Run(0, 0.75, kSeconds, 0.5) ], 1, 0, 3), @[ @0, @1.0, @2.0 ], @[ @0.5, @1.5, @2.5 ], 0.015);
  // A loop's passes: the audio goes back to the loop's first bar each time.
  NSArray *passes = @[ Run(0, 0.75, 1.75, 0.5), Run(2.0, 0.75, 1.75, 0.5) ];
  CheckOnsets(@"audio track loop passes", RenderTrack(clicks, passes, 1, 0, 4), @[ @0, @1.0, @2.0, @3.0 ], @[ @0.5, @1.5, @2.5, @3.5 ], 0.015);
  // AVAudioUnitTimePitch applies a new rate some 30–150 ms late (measured here), so playback never changes the rate
  // inside a render (the speed trainer's passes play one per render with an audio track); how late, for the record:
  AVAudioPCMBuffer *changed = RenderTrack(clicks, @[ Run(0, 0.75, 1.75, 1), Run(1.0, 0.75, 1.75, 0.5) ], 1, 0, 3);
  printf("INFO audio track rate change 100%% → 50%%: the next pass's first click at %.3f s (%.3f without the delay)\n", OnsetAfter(changed, 1.0), 1.5);
}

int CheckAudioTrack(NSURL *bankURL)
{
  bank = bankURL;
  [GPAudioAssets removeAll];
  NSString *sine = StoreRecording(@"audio-check-sine", ^float(double seconds) {
    return (float)(0.5 * sin(2 * M_PI * kSineHz * seconds));
  });
  NSString *clicks = StoreRecording(@"audio-check-clicks", ^float(double seconds) {
    double sinceClick = fmod(seconds - kFirstClick, kClickEvery);
    BOOL isClick = seconds >= kFirstClick && sinceClick < kClickLength;
    return isClick ? (float)(0.8 * sin(2 * M_PI * kClickHz * sinceClick)) : 0;
  });
  CheckPitch(sine);
  CheckSync(clicks);
  return failures;
}
