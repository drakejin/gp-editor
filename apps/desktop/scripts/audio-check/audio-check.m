// The audio check (run.sh): nobody listens here, so each effect is checked by rendering offline (GPMixRenderer) and
// measuring what it must change — drive adds harmonics, delay and reverb leave energy after the note, chorus makes the
// sides differ, the cabinet takes the top end away, EQ and compressor reshape the sound, the master gain scales the
// level — and the mix without effects is compared with the graph playback had before effects existed; the audio track's
// checks are in audio-track-check.m (time-pitch, detune, gain, sync of the runs). Prints PASS /
// FAIL lines and how fast the many-track songs render with and without effects; exits 1 when a check fails.
// Usage: audio-check <bank.sf2> <song.mid> <12-track.mid> <bends.mid>

#import <AVFoundation/AVFoundation.h>

#import "GPConvolver.h"
#import "GPDSPKernels.h"
#import "GPMixRenderer.h"
#import "audio-measures.h"
#import "audio-track-check.h"

static int failures = 0;
static NSURL *bankURL;

static void Check(BOOL isPassed, NSString *name, NSString *detail)
{
  printf("%s %s: %s\n", isPassed ? "PASS" : "FAIL", name.UTF8String, detail.UTF8String);
  failures += isPassed ? 0 : 1;
}

static NSDictionary *Effect(NSString *type, BOOL isEnabled, NSDictionary *params)
{
  return @{@"type" : type, @"isEnabled" : @(isEnabled), @"params" : params};
}

/** Song track 0 through `effects`, the master as given. */
static NSDictionary *TrackMix(NSArray *effects, NSDictionary *master)
{
  return @{@"tracks" : @[ effects ], @"master" : master};
}

static AVAudioPCMBuffer *Render(NSData *midi, NSDictionary *mix, double seconds)
{
  NSError *error = nil;
  AVAudioPCMBuffer *buffer = [GPMixRenderer renderMidi:midi bankURL:bankURL mix:mix seconds:seconds sampleRate:kRate error:&error];
  if (buffer == nil) {
    Check(NO, @"render", error.localizedDescription ?: @"failed");
    exit(1);
  }
  return buffer;
}

/** The graph playback had before effects: the synth → peak limiter → main mixer at 0.8 (GPMidiEngine of v0.11). */
static AVAudioPCMBuffer *RenderBeforeEffects(NSData *midi, double seconds)
{
  AVAudioEngine *engine = [AVAudioEngine new];
  AVAudioFormat *format = [[AVAudioFormat alloc] initStandardFormatWithSampleRate:kRate channels:2];
  [engine enableManualRenderingMode:AVAudioEngineManualRenderingModeOffline format:format maximumFrameCount:4096 error:nil];
  AudioComponentDescription synthDescription = {kAudioUnitType_MusicDevice, kAudioUnitSubType_MIDISynth, kAudioUnitManufacturer_Apple, 0, 0};
  AudioComponentDescription limiterDescription = {kAudioUnitType_Effect, kAudioUnitSubType_PeakLimiter, kAudioUnitManufacturer_Apple, 0, 0};
  AVAudioUnitMIDIInstrument *synth = [[AVAudioUnitMIDIInstrument alloc] initWithAudioComponentDescription:synthDescription];
  CFURLRef url = (__bridge CFURLRef)bankURL;
  AudioUnitSetProperty(synth.audioUnit, kMusicDeviceProperty_SoundBankURL, kAudioUnitScope_Global, 0, &url, sizeof(url));
  AVAudioUnitEffect *limiter = [[AVAudioUnitEffect alloc] initWithAudioComponentDescription:limiterDescription];
  [engine attachNode:synth];
  [engine attachNode:limiter];
  [engine connect:synth to:limiter format:nil];
  [engine connect:limiter to:engine.mainMixerNode format:nil];
  engine.mainMixerNode.outputVolume = 0.8f;
  [engine startAndReturnError:nil];
  AVAudioSequencer *sequencer = [[AVAudioSequencer alloc] initWithAudioEngine:engine];
  [sequencer loadFromData:midi options:AVMusicSequenceLoadSMF_PreserveTracks error:nil];
  NSMutableArray<AVMIDIProgramChangeEvent *> *changes = [NSMutableArray array];
  for (AVMusicTrack *track in sequencer.tracks) {
    track.destinationAudioUnit = synth;
    [track enumerateEventsInRange:AVMakeBeatRange(0, track.lengthInBeats + 1) usingBlock:^(AVMusicEvent *event, AVMusicTimeStamp *timeStamp, BOOL *removeEvent) {
      if ([event isKindOfClass:[AVMIDIProgramChangeEvent class]]) {
        [changes addObject:(AVMIDIProgramChangeEvent *)event];
      }
    }];
  }
  // Its programs loaded before the first note, as it did (kAUMIDISynthProperty_EnablePreload).
  UInt32 enable = 1;
  AudioUnitSetProperty(synth.audioUnit, kAUMIDISynthProperty_EnablePreload, kAudioUnitScope_Global, 0, &enable, sizeof(enable));
  for (AVMIDIProgramChangeEvent *change in changes) {
    [synth sendProgramChange:(uint8_t)change.programNumber onChannel:(uint8_t)change.channel];
  }
  enable = 0;
  AudioUnitSetProperty(synth.audioUnit, kAUMIDISynthProperty_EnablePreload, kAudioUnitScope_Global, 0, &enable, sizeof(enable));
  [sequencer prepareToPlay];
  [sequencer startAndReturnError:nil];
  AVAudioPCMBuffer *all = [[AVAudioPCMBuffer alloc] initWithPCMFormat:format frameCapacity:(AVAudioFrameCount)(seconds * kRate)];
  AVAudioPCMBuffer *chunk = [[AVAudioPCMBuffer alloc] initWithPCMFormat:engine.manualRenderingFormat frameCapacity:4096];
  while (all.frameLength + 4096 <= all.frameCapacity) {
    [engine renderOffline:4096 toBuffer:chunk error:nil];
    for (int channel = 0; channel < 2; channel++) {
      memcpy(all.floatChannelData[channel] + all.frameLength, chunk.floatChannelData[channel], 4096 * sizeof(float));
    }
    all.frameLength += 4096;
  }
  return all;
}

static void CheckConvolver(void)
{
  float impulse[3] = {0, 0, 0.5f};
  GPConvolver *convolver = GPConvolverCreate(impulse, 3);
  float input[1000] = {0}, output[1000] = {0};
  input[10] = 1;
  GPConvolverProcess(convolver, input, output, 300);
  GPConvolverProcess(convolver, input + 300, output + 300, 700);
  GPConvolverDestroy(convolver);
  float expected = output[10 + 2 + GP_CONVOLVER_BLOCK];
  float others = 0;
  for (int index = 0; index < 1000; index++) {
    others = MAX(others, index == 10 + 2 + GP_CONVOLVER_BLOCK ? 0 : fabsf(output[index]));
  }
  Check(fabsf(expected - 0.5f) < 1e-5 && others < 1e-5, @"convolver", [NSString stringWithFormat:@"impulse comes out %d samples late at %.5f (stray %.1e)", 2 + GP_CONVOLVER_BLOCK, expected, others]);
}

/** A4 on an ocarina (nearly a sine): its 3rd to 13th harmonics against the fundamental. */
static double HarmonicRatio(AVAudioPCMBuffer *buffer)
{
  return BandEnergy(buffer, 1200, 6000) / BandEnergy(buffer, 300, 600);
}

/** A 440 Hz sine at −20 dBFS through the drive kernel itself: energy at 3·440 Hz and up against 440 Hz. */
static void CheckDriveKernel(void)
{
  const int frames = 32768;
  AVAudioFormat *format = [[AVAudioFormat alloc] initStandardFormatWithSampleRate:kRate channels:2];
  AVAudioPCMBuffer *sine = [[AVAudioPCMBuffer alloc] initWithPCMFormat:format frameCapacity:frames];
  AVAudioPCMBuffer *driven = [[AVAudioPCMBuffer alloc] initWithPCMFormat:format frameCapacity:frames];
  sine.frameLength = driven.frameLength = frames;
  for (int i = 0; i < frames; i++) {
    sine.floatChannelData[0][i] = sine.floatChannelData[1][i] = 0.1f * sinf(2 * (float)M_PI * 440 * i / (float)kRate);
  }
  GPDSPKernel *kernel = GPDSPKernelCreate(GPDSPKindDrive, kRate, 2);
  GPDSPKernelSetParam(kernel, 0, 1);
  GPDSPKernelSetParam(kernel, 1, 34);
  GPDSPKernelSetParam(kernel, 2, 80);
  GPDSPKernelProcess(kernel, sine.floatChannelData, driven.floatChannelData, frames);
  GPDSPKernelDestroy(kernel);
  double ratio = BandEnergy(driven, 1200, 8000) / BandEnergy(driven, 300, 600);
  double clean = BandEnergy(sine, 1200, 8000) / BandEnergy(sine, 300, 600);
  Check(Db(sqrt(ratio)) - Db(sqrt(clean)) > 20, @"drive kernel", [NSString stringWithFormat:@"a sine's harmonics %.1f dB under it after the drive (%.1f dB before)", Db(sqrt(ratio)), Db(sqrt(clean))]);
}

static void CheckDrive(void)
{
  NSData *ocarina = ChordMidi(79, @[ @69 ]);
  AVAudioPCMBuffer *clean = Render(ocarina, TrackMix(@[ Effect(@"drive", NO, @{}) ], @{}), 2);
  AVAudioPCMBuffer *driven = Render(ocarina, TrackMix(@[ Effect(@"drive", YES, @{@"mode" : @1, @"gain" : @34, @"tone" : @80, @"level" : @-18}) ], @{}), 2);
  double harmonics = Db(sqrt(HarmonicRatio(driven) / HarmonicRatio(clean)));
  Check(harmonics > 10, @"drive", [NSString stringWithFormat:@"an ocarina's A4, 1.2–6 kHz against 300–600 Hz: %+.1f dB", harmonics]);
}

static void CheckEffects(NSData *chord)
{
  NSDictionary *none = @{};
  AVAudioPCMBuffer *plain = Render(chord, none, 4);
  NSMutableArray *allOff = [NSMutableArray array];
  for (NSString *type in @[ @"eq", @"compressor", @"drive", @"chorus", @"delay", @"reverb", @"cabinet" ]) {
    [allOff addObject:Effect(type, NO, @{})];
  }
  AVAudioPCMBuffer *bypassed = Render(chord, TrackMix(allOff, none), 4);
  double samplerDb = Db(sqrt(Power(bypassed, 0, 1) / Power(plain, 0, 1)));
  Check(fabs(samplerDb) < 1.5 && Correlation(bypassed) > 0.99, @"effects off",
        [NSString stringWithFormat:@"a track with all seven effects off, on its own sampler, plays %+.2f dB from the shared synth", samplerDb]);

  NSDictionary *lead = Effect(@"drive", YES, @{@"mode" : @1, @"gain" : @34, @"tone" : @60, @"level" : @-18});
  AVAudioPCMBuffer *driven = Render(chord, TrackMix(@[ lead ], none), 4);

  AVAudioPCMBuffer *cabinet = Render(chord, TrackMix(@[ lead, Effect(@"cabinet", YES, @{@"model" : @2}) ], none), 4);
  double top = Db(sqrt((BandEnergy(cabinet, 7000, 16000) / BandEnergy(cabinet, 100, 2000)) / (BandEnergy(driven, 7000, 16000) / BandEnergy(driven, 100, 2000))));
  Check(top < -10, @"cabinet", [NSString stringWithFormat:@"7–16 kHz against 100 Hz–2 kHz after a 4x12: %+.1f dB", top]);

  AVAudioPCMBuffer *echo = Render(chord, TrackMix(@[ Effect(@"delay", YES, @{@"time" : @350, @"feedback" : @40, @"mix" : @50}) ], none), 4);
  double echoDb = Db(sqrt(Power(echo, 1.6, 3.0) / Power(bypassed, 1.6, 3.0)));
  Check(echoDb > 6, @"delay", [NSString stringWithFormat:@"1.6–3 s after the chord: %+.1f dB", echoDb]);

  AVAudioPCMBuffer *hall = Render(chord, TrackMix(@[ Effect(@"reverb", YES, @{@"room" : @8, @"mix" : @50}) ], none), 4);
  double tailDb = Db(sqrt(Power(hall, 1.6, 3.5) / Power(bypassed, 1.6, 3.5)));
  Check(tailDb > 6, @"reverb", [NSString stringWithFormat:@"tail 1.6–3.5 s: %+.1f dB", tailDb]);

  AVAudioPCMBuffer *chorus = Render(chord, TrackMix(@[ Effect(@"chorus", YES, @{@"rate" : @1.5, @"depth" : @6, @"mix" : @50}) ], none), 4);
  Check(Correlation(chorus) < 0.97 && Correlation(bypassed) > 0.99, @"chorus", [NSString stringWithFormat:@"left/right correlation %.3f (dry %.3f)", Correlation(chorus), Correlation(bypassed)]);

  AVAudioPCMBuffer *bright = Render(chord, TrackMix(@[ Effect(@"eq", YES, @{@"lowGain" : @-12, @"highGain" : @12}) ], none), 4);
  double tilt = Db(sqrt((BandEnergy(bright, 5000, 10000) / BandEnergy(bright, 60, 200)) / (BandEnergy(bypassed, 5000, 10000) / BandEnergy(bypassed, 60, 200))));
  Check(tilt > 10, @"eq", [NSString stringWithFormat:@"5–10 kHz against 60–200 Hz: %+.1f dB", tilt]);

  NSDictionary *squash = Effect(@"compressor", YES, @{@"threshold" : @-28, @"headroom" : @3, @"attack" : @2, @"release" : @100, @"gain" : @8});
  AVAudioPCMBuffer *compressed = Render(chord, TrackMix(@[ squash ], none), 4);
  double crestBefore = Db(Peak(bypassed) / sqrt(Power(bypassed, 0, 1)));
  double crestAfter = Db(Peak(compressed) / sqrt(Power(compressed, 0, 1)));
  Check(crestAfter < crestBefore - 1, @"compressor", [NSString stringWithFormat:@"crest factor %.1f dB (dry %.1f dB)", crestAfter, crestBefore]);

  AVAudioPCMBuffer *quiet = Render(chord, @{@"tracks" : @[], @"master" : @{@"gainDb" : @-12}}, 4);
  double gainDb = Db(sqrt(Power(quiet, 0, 1) / Power(plain, 0, 1)));
  Check(fabs(gainDb + 12) < 1, @"master gain", [NSString stringWithFormat:@"−12 dB set, %+.2f dB measured", gainDb]);

  NSDictionary *masterReverb = @{@"effects" : @[ Effect(@"reverb", YES, @{@"room" : @4, @"mix" : @40}) ]};
  AVAudioPCMBuffer *wide = Render(chord, @{@"tracks" : @[], @"master" : masterReverb}, 4);
  double masterTailDb = Db(sqrt(Power(wide, 1.6, 3.5) / Power(plain, 1.6, 3.5)));
  Check(masterTailDb > 6, @"master reverb", [NSString stringWithFormat:@"tail 1.6–3.5 s: %+.1f dB", masterTailDb]);
}

static void CheckSameAsBefore(NSData *song)
{
  AVAudioPCMBuffer *before = RenderBeforeEffects(song, 20);
  AVAudioPCMBuffer *now = Render(song, @{}, 20);
  double rmsDb = Db(sqrt(Power(now, 0, 20) / Power(before, 0, 20)));
  double peakDb = Db(Peak(now) / Peak(before));
  float difference = 0;
  for (int channel = 0; channel < 2; channel++) {
    for (AVAudioFrameCount frame = 0; frame < MIN(now.frameLength, before.frameLength); frame++) {
      difference = MAX(difference, fabsf(now.floatChannelData[channel][frame] - before.floatChannelData[channel][frame]));
    }
  }
  Check(fabs(rmsDb) < 0.05 && fabs(peakDb) < 0.05, @"no effects = as before",
        [NSString stringWithFormat:@"20 s: RMS %+.3f dB, peak %+.3f dB, largest sample difference %.2e", rmsDb, peakDb, difference]);
}

/** Bent notes (the 2nd MIDI channel, its pitch-bend range set by the conductor) sound as on the shared synth. */
static void CheckBends(NSData *bends)
{
  AVAudioPCMBuffer *shared = Render(bends, @{}, 8);
  AVAudioPCMBuffer *own = Render(bends, TrackMix(@[ Effect(@"eq", NO, @{}) ], @{}), 8);
  int windows = 0, same = 0;
  for (double at = 0; at < 7.5; at += 0.1) {
    double a = DominantFrequency(shared, at), b = DominantFrequency(own, at);
    windows += a > 0 ? 1 : 0;
    same += a > 0 && fabs(a - b) <= 6 ? 1 : 0;
  }
  Check(windows > 10 && same == windows, @"bends", [NSString stringWithFormat:@"same pitch as on the shared synth in %d of %d windows", same, windows]);
}

/** Song tracks in a renderMidi file: the SMF's tracks less the conductor. */
static NSUInteger SongTrackCount(NSData *midi)
{
  const uint8_t *bytes = midi.bytes;
  return midi.length > 12 ? (NSUInteger)((bytes[10] << 8) | bytes[11]) - 1 : 0;
}

static void MeasureSpeed(NSString *name, NSData *song)
{
  NSArray *chain = @[
    Effect(@"compressor", YES, @{}), Effect(@"drive", YES, @{}), Effect(@"eq", YES, @{@"midGain" : @4}),
    Effect(@"cabinet", YES, @{@"model" : @2}), Effect(@"delay", YES, @{}), Effect(@"reverb", YES, @{}),
  ];
  NSMutableArray *tracks = [NSMutableArray array];
  for (NSUInteger index = 0; index < SongTrackCount(song); index++) {
    [tracks addObject:chain];
  }
  for (NSDictionary *mix in @[ @{}, @{@"tracks" : tracks} ]) {
    double start = CFAbsoluteTimeGetCurrent();
    AVAudioPCMBuffer *buffer = Render(song, mix, 30);
    double seconds = CFAbsoluteTimeGetCurrent() - start;
    BOOL hasEffects = mix.count > 0;
    printf("INFO %s, %lu tracks%s: 30 s in %.2f s (%.0fx real time, %.0f%% of one core), peak %.2f, %.0f MB resident\n", name.UTF8String,
           (unsigned long)SongTrackCount(song), hasEffects ? " with 6 effects each" : " without effects", seconds, 30 / seconds, seconds / 30 * 100, Peak(buffer), ResidentMegabytes());
    // Faster than real time even on a busy machine (the numbers above are what to compare between builds).
    Check(30 / seconds > 1, [NSString stringWithFormat:@"speed %@%@", name, hasEffects ? @" with effects" : @""], @"renders faster than real time");
  }
}

int main(int argc, const char *argv[])
{
  @autoreleasepool {
    if (argc < 5) {
      fprintf(stderr, "usage: audio-check <bank.sf2> <song.mid> <12-track.mid> <bends.mid>\n");
      return 2;
    }
    bankURL = [NSURL fileURLWithPath:[NSString stringWithUTF8String:argv[1]]];
    NSData *song = [NSData dataWithContentsOfFile:[NSString stringWithUTF8String:argv[2]]];
    NSData *twelve = [NSData dataWithContentsOfFile:[NSString stringWithUTF8String:argv[3]]];
    CheckConvolver();
    CheckDriveKernel();
    CheckDrive();
    CheckEffects(ChordMidi(27, @[ @45, @52, @57 ]));
    CheckBends([NSData dataWithContentsOfFile:[NSString stringWithUTF8String:argv[4]]]);
    CheckSameAsBefore(song);
    failures += CheckAudioTrack(bankURL);
    MeasureSpeed(@"song", song);
    MeasureSpeed(@"12-track song", twelve);
    printf("%s: %d failed\n", failures == 0 ? "OK" : "FAILED", failures);
  }
  return failures == 0 ? 0 : 1;
}
