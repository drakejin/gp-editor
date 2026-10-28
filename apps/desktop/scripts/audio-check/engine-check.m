// The engine check (run.sh engine): the playback engine as the shipped app runs it — in the App Sandbox (run.sh signs this
// tool with GPEditor.entitlements) and in real time on the output device. Every effect type's node is made (our
// GPDSPUnit, an in-process audio unit, needs to be registered sandbox-safe: else the sandbox refuses it, error -3000,
// which AVAudioUnitEffect raises), a mix through all of them renders, a hover preview and a song play on a track with
// effects whose drum kit the bank lacks (the sampler's load raised error -10851), and the stress run drives the engine
// as the effects UI does. Prints PASS / FAIL lines; exits 1 when a check fails (a crash ends it sooner).
// Usage: engine-check                       (prints its container's folder: run.sh copies the bank and the song there)
//        engine-check <bank.sf2> <song.mid>

#import <AVFoundation/AVFoundation.h>

#import "GPEffectNodes.h"
#import "GPMidiEngine.h"
#import "GPMixRenderer.h"
#import "audio-measures.h"
#import "engine-stress.h"

static const int kStressSteps = 100;
static const unsigned kStressSeeds[] = {1, 2, 3};
static int failures = 0;

static void Check(BOOL isPassed, NSString *name, NSString *detail)
{
  printf("%s %s: %s\n", isPassed ? "PASS" : "FAIL", name.UTF8String, detail.UTF8String);
  fflush(stdout);
  failures += isPassed ? 0 : 1;
}

static NSDictionary *Effect(NSString *type)
{
  return @{@"type" : type, @"isEnabled" : @YES, @"params" : @{}};
}

static NSArray<NSString *> *EffectTypes(void)
{
  return @[ @"eq", @"compressor", @"drive", @"chorus", @"delay", @"reverb", @"cabinet", @"limiter" ];
}

/** Each effect type's node, made as GPMixGraph makes it. */
static void CheckEffectNodes(void)
{
  for (NSString *type in EffectTypes()) {
    NSString *detail = nil;
    @try {
      detail = [GPEffectNode nodeForEffect:Effect(type)] != nil ? @"made" : @"no node";
    } @catch (NSException *exception) {
      detail = [NSString stringWithFormat:@"raised %@", exception.reason];
    }
    Check([detail isEqualToString:@"made"], [NSString stringWithFormat:@"%@ node", type], detail);
  }
}

/** A chord through a track with every track effect, and a master with all of its own, rendered offline. */
static void CheckRenderThroughAll(NSURL *bankURL)
{
  NSMutableArray *chain = [NSMutableArray array];
  for (NSString *type in EffectTypes()) {
    if (![type isEqualToString:@"limiter"]) {
      [chain addObject:Effect(type)];
    }
  }
  NSDictionary *master = @{@"effects" : @[ Effect(@"eq"), Effect(@"compressor"), Effect(@"reverb"), Effect(@"limiter") ], @"gainDb" : @0};
  NSError *error = nil;
  AVAudioPCMBuffer *buffer = [GPMixRenderer renderMidi:ChordMidi(29, @[ @40, @47, @52 ]) bankURL:bankURL mix:@{@"tracks" : @[ chain ], @"master" : master} seconds:2 sampleRate:kRate error:&error];
  double level = buffer == nil ? 0 : Power(buffer, 0, 1);
  Check(buffer != nil && level > 0 && isfinite(level), @"render through every effect",
        buffer == nil ? error.localizedDescription : [NSString stringWithFormat:@"%.1f dBFS", Db(sqrt(level))]);
}

/** A drum track with effects on a kit the bank lacks: a hover preview, then the song played and stopped. */
static void CheckMissingKit(NSURL *bankURL)
{
  dispatch_queue_t queue = dispatch_queue_create("audio-check.engine", DISPATCH_QUEUE_SERIAL);
  GPMidiEngine *engine = [[GPMidiEngine alloc] initWithQueue:queue];
  NSData *drums = ChannelMidi(9, -1, 3, @[ @36, @38, @42 ]);
  __block BOOL isPreviewed = NO, isPlayed = NO;
  dispatch_sync(queue, ^{
    [engine setMix:@{@"tracks" : @[ @[ Effect(@"drive") ] ]}];
    isPreviewed = [engine playNote:38 velocity:100 program:3 onChannel:9 trackIndex:0 forSeconds:0.2 bankURL:bankURL error:nil];
    isPlayed = [engine playData:drums fromSeconds:0 bankURL:bankURL audio:nil error:nil];
  });
  usleep(500000);
  dispatch_sync(queue, ^{
    [engine stop];
  });
  Check(isPreviewed && isPlayed, @"missing drum kit", @"previewed and played on a track with effects, drum kit 3 (not in the bank)");
}

static void RunStress(NSURL *bankURL, NSData *song)
{
  for (size_t index = 0; index < sizeof(kStressSeeds) / sizeof(kStressSeeds[0]); index++) {
    double start = CFAbsoluteTimeGetCurrent();
    RunEngineStress(bankURL, song, kStressSteps, kStressSeeds[index]);
    Check(YES, @"stress", [NSString stringWithFormat:@"seed %u: %d actions of effect edits, playback and previews in %.0f s", kStressSeeds[index], kStressSteps, CFAbsoluteTimeGetCurrent() - start]);
  }
}

int main(int argc, const char *argv[])
{
  @autoreleasepool {
    BOOL isSandboxed = NSProcessInfo.processInfo.environment[@"APP_SANDBOX_CONTAINER_ID"] != nil;
    if (argc < 3) {
      printf("%s\n", NSHomeDirectory().UTF8String);
      return isSandboxed ? 0 : 1;
    }
    Check(isSandboxed, @"App Sandbox", isSandboxed ? @"runs sandboxed, as the shipped app" : @"not sandboxed: sign it with GPEditor.entitlements (run.sh does)");
    NSURL *bankURL = [NSURL fileURLWithPath:@(argv[1])];
    NSData *song = [NSData dataWithContentsOfFile:@(argv[2])];
    if (song == nil) {
      Check(NO, @"song", [NSString stringWithFormat:@"%s cannot be read here", argv[2]]);
      return 1;
    }
    CheckEffectNodes();
    if (failures > 0) {
      printf("FAILED: %d failed (the engine would end the app at the first mix with such an effect)\n", failures);
      return 1;
    }
    CheckRenderThroughAll(bankURL);
    CheckMissingKit(bankURL);
    RunStress(bankURL, song);
    printf("%s: %d failed\n", failures == 0 ? "OK" : "FAILED", failures);
  }
  return failures == 0 ? 0 : 1;
}
