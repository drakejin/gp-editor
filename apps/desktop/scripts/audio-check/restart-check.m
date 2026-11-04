// The restart check (run.sh restart): the first note of a song played again right away is heard. The playback engine
// (GPMidiEngine, in real time on the output device, in the App Sandbox as shipped) plays a song whose first beat has a
// note — A4 on a flute, D6 held from beat 2 on, A4 again on bars 2 and 3, E5 struck 10 ms before bar 2 — and is asked
// to play it again the ways the window asks: stopped and started again within 10 ms (Space, Space), or started again
// while it plays (a bar button, Home / End, a loop going round, a practice change), on the shared synth and on a track
// with effects (its sampler: checked), from the song's start and from inside it (a selection's first beat). A tap on
// the main mixer records what it plays; each play's first note, measured at its fundamental over the second after the
// play was asked for, must sound as loud as the same note a bar later (and a silent or unrecorded control fails); a
// play from bar 2 must not sound the E5 struck just before it. The position read right after each play never comes
// before the point asked for nor goes back, a rewire keeps it, and the song ends when it should.
// Prints PASS / FAIL lines; exits 1 when a check fails.
// Usage: restart-check                   (prints its container's folder: run.sh copies the bank there)
//        restart-check <bank.sf2> [plays per case]

#import <AVFoundation/AVFoundation.h>
#import <mach/mach_time.h>
#import <stdlib.h>

#import "GPMidiEngine.h"
#import "audio-measures.h"
#import "output-recorder.h"

static const uint8_t kFlute = 73;
static const double kNoteHz = 440;
/** E5, struck just before bar 2. */
static const double kBeforeHz = 659.26;
/** The band measured around a note's fundamental (nothing else in the song comes near it). */
static const double kBandRatio = 0.03;
/** A bar of 4/4 at 120 bpm, and the song's four. */
static const double kBarSeconds = 2;
static const double kSongSeconds = 8;
/** Long enough to hold a whole half-second note however late the play starts. */
static const double kWindowSeconds = 1;
/** How long a play goes on after its control note was heard, at most, before it is played again. */
static const double kMaxExtraSeconds = 0.4;
/** A first note this much quieter than the same note a bar later was not heard (a lost one reads some 70 dB under). */
static const double kMaxDropDb = 6;
/** A control note under this was not played at all (the engine or the bank silent): nothing was measured. */
static const double kMinControlDb = -60;
/** The note struck before the start point stays this far under the first note (it plays nowhere near it when sounded). */
static const double kMinQuietDb = 30;
static const double kRecordTimeout = 1;
/** Positions read right after a play, as JS polls them (more often), and how far a read may come back (rounding). */
static const int kPositionReads = 8;
static const useconds_t kPositionReadMicroseconds = 8000;
static const double kPositionSlack = 0.001;
static const int kDefaultPlays = 10;

/** One way of playing again: through effects or not, stopped first (and how long before) or not, from which point. */
typedef struct {
  const char *name;
  BOOL hasEffects;
  BOOL stopsFirst;
  double minGapSeconds;
  double maxGapSeconds;
  double fromSeconds;
} GPRestartCase;

static const GPRestartCase kCases[] = {
  {"stop, play again within 10 ms (shared synth)", NO, YES, 0, 0.01, 0},
  {"play again while playing (shared synth)", NO, NO, 0, 0, 0},
  {"stop, play again within 10 ms (sampler, a track with effects)", YES, YES, 0, 0.01, 0},
  {"play again while playing (sampler, a track with effects)", YES, NO, 0, 0, 0},
  {"play from inside the song while playing (shared synth)", NO, NO, 0, 0, kBarSeconds},
  {"stop, play again a second later (shared synth)", NO, YES, 1, 1, 0},
};

static int failures = 0;

static void Check(BOOL isPassed, NSString *name, NSString *detail)
{
  printf("%s %s: %s\n", isPassed ? "PASS" : "FAIL", name.UTF8String, detail.UTF8String);
  fflush(stdout);
  failures += isPassed ? 0 : 1;
}

/** A4 on beat 1 of bars 1, 2 and 3 (a half second each), D6 held from beat 2 of bar 1 on, E5 from 10 ms before bar 2. */
static NSData *RestartSong(void)
{
  NSArray *notes = @[ @[ @69, @0, @960 ], @[ @86, @960, @15360 ], @[ @76, @3821, @4320 ], @[ @69, @3840, @4800 ], @[ @69, @7680, @8640 ] ];
  return NotesMidi(kFlute, notes, 15360);
}

static double RandomBetween(double low, double high)
{
  return low + (high - low) * (double)random() / (double)RAND_MAX;
}

static void Wait(double seconds)
{
  usleep((useconds_t)(seconds * 1e6));
}

/** Plays the song on the engine's queue, as GPPlayer does (a failure fails the check); the host time it was asked at. */
static uint64_t Play(GPMidiEngine *engine, dispatch_queue_t queue, NSData *song, NSURL *bankURL, double fromSeconds)
{
  __block uint64_t askedAt = 0;
  __block NSError *error = nil;
  __block BOOL isPlayed = NO;
  dispatch_sync(queue, ^{
    askedAt = mach_absolute_time();
    NSError *playError = nil;
    isPlayed = [engine playData:song fromSeconds:fromSeconds bankURL:bankURL audio:nil error:&playError];
    error = playError;
  });
  if (!isPlayed) {
    Check(NO, @"play", error.localizedDescription ?: @"failed");
  }
  return askedAt;
}

/** The level (dB) around `hz` over kWindowSeconds from `hostTime`; NAN when it was not recorded. */
static double LevelAt(GPOutputRecorder *recorder, uint64_t hostTime, double hz)
{
  NSData *samples = [recorder samplesFrom:hostTime seconds:kWindowSeconds timeout:kRecordTimeout];
  return samples == nil ? NAN : BandLevelDb(samples, recorder.sampleRate, hz * (1 - kBandRatio), hz * (1 + kBandRatio));
}

/**
 * What went wrong with the play asked for at `askedAt` (nil: nothing): its first note against the same note a bar later
 * (`*drop`, dB), and from inside the song, the note struck before the start point.
 */
static NSString *PlayProblem(GPOutputRecorder *recorder, uint64_t askedAt, BOOL isFromInside, double *drop)
{
  double first = LevelAt(recorder, askedAt, kNoteHz);
  double control = LevelAt(recorder, HostTimeAfter(askedAt, kBarSeconds), kNoteHz);
  if (isnan(first) || isnan(control)) {
    return @"not recorded";
  }
  if (control < kMinControlDb) {
    return [NSString stringWithFormat:@"silent (control %.0f dB)", control];
  }
  *drop = control - first;
  if (*drop > kMaxDropDb) {
    return @"first note lost";
  }
  double before = isFromInside ? LevelAt(recorder, askedAt, kBeforeHz) : -999;
  return isnan(before) || before > first - kMinQuietDb ? [NSString stringWithFormat:@"the note before the start sounded (%.0f dB)", before] : nil;
}

/** The position and whether it plays, read on the engine's queue. */
static double PositionOf(GPMidiEngine *engine, dispatch_queue_t queue, BOOL *isPlaying)
{
  __block double position = 0;
  __block BOOL playing = NO;
  dispatch_sync(queue, ^{
    position = engine.positionSeconds;
    playing = engine.isPlaying;
  });
  *isPlaying = playing;
  return position;
}

/** Reads the position right after a play, as JS polls it: playing, never before the start point, never going back. */
static BOOL ArePositionsSteady(GPMidiEngine *engine, dispatch_queue_t queue, double fromSeconds)
{
  double last = fromSeconds;
  for (int read = 0; read < kPositionReads; read++) {
    BOOL isPlaying = NO;
    double position = PositionOf(engine, queue, &isPlaying);
    if (!isPlaying || position < last - kPositionSlack) {
      printf("INFO position %.4f s (playing %d) after %.4f s, started at %.4f s\n", position, isPlaying, last, fromSeconds);
      return NO;
    }
    last = position;
    usleep(kPositionReadMicroseconds);
  }
  return YES;
}

/** YES when a track of the playing sequence is on a sampler (a track with effects), as the case asks. */
static BOOL IsOnSampler(GPMidiEngine *engine, dispatch_queue_t queue)
{
  __block BOOL isOnSampler = NO;
  dispatch_sync(queue, ^{
    AVAudioSequencer *sequencer = [engine valueForKey:@"sequencer"];
    for (AVMusicTrack *track in sequencer.tracks) {
      isOnSampler = isOnSampler || [track.destinationAudioUnit isKindOfClass:[AVAudioUnitSampler class]];
    }
  });
  return isOnSampler;
}

/** The engine's AVAudioEngine (built by its first play), whose output the recorder taps. */
static AVAudioEngine *AudioEngineOf(GPMidiEngine *engine)
{
  return [engine valueForKey:@"engine"];
}

static GPMidiEngine *EngineFor(const GPRestartCase *restart, dispatch_queue_t queue)
{
  GPMidiEngine *engine = [[GPMidiEngine alloc] initWithQueue:queue];
  if (restart->hasEffects) {
    dispatch_sync(queue, ^{
      [engine setMix:@{@"tracks" : @[ @[ @{@"type" : @"eq", @"isEnabled" : @YES, @"params" : @{}} ] ]}];
    });
  }
  return engine;
}

/** The case's plays: each one stopped first or not, then played again; what each one did, in `drops` / `problems`. */
static int RunPlays(const GPRestartCase *restart, GPMidiEngine *engine, dispatch_queue_t queue, NSURL *bankURL, NSData *song,
                    GPOutputRecorder *recorder, int plays, NSMutableArray<NSString *> *drops, NSMutableArray<NSString *> *problems)
{
  int unsteady = 0;
  for (int play = 0; play < plays; play++) {
    Wait(RandomBetween(0, kMaxExtraSeconds));
    if (restart->stopsFirst) {
      dispatch_async(queue, ^{
        [engine stop];
      });
      Wait(RandomBetween(restart->minGapSeconds, restart->maxGapSeconds));
    }
    uint64_t askedAt = Play(engine, queue, song, bankURL, restart->fromSeconds);
    unsteady += ArePositionsSteady(engine, queue, restart->fromSeconds) ? 0 : 1;
    Wait(kBarSeconds + kWindowSeconds);
    double drop = NAN;
    NSString *problem = PlayProblem(recorder, askedAt, restart->fromSeconds > 0, &drop);
    [drops addObject:isnan(drop) ? @"?" : [NSString stringWithFormat:@"%.0f", drop]];
    if (problem != nil) {
      [problems addObject:[NSString stringWithFormat:@"play %d: %@", play + 1, problem]];
    }
  }
  return unsteady;
}

static void RunCase(const GPRestartCase *restart, NSURL *bankURL, NSData *song, int plays)
{
  dispatch_queue_t queue = dispatch_queue_create("audio-check.restart", DISPATCH_QUEUE_SERIAL);
  GPMidiEngine *engine = EngineFor(restart, queue);
  Play(engine, queue, song, bankURL, restart->fromSeconds);
  if (restart->hasEffects && !IsOnSampler(engine, queue)) {
    Check(NO, @(restart->name), @"the song's track does not play on a sampler: nothing of that path was measured");
  }
  GPOutputRecorder *recorder = [[GPOutputRecorder alloc] initWithEngine:AudioEngineOf(engine)];
  Wait(kBarSeconds + kWindowSeconds);
  NSMutableArray<NSString *> *drops = [NSMutableArray array];
  NSMutableArray<NSString *> *problems = [NSMutableArray array];
  int unsteady = RunPlays(restart, engine, queue, bankURL, song, recorder, plays, drops, problems);
  dispatch_sync(queue, ^{
    [engine stop];
  });
  [recorder detach];
  NSString *heard = problems.count == 0 ? @"every first note heard" : [problems componentsJoinedByString:@", "];
  NSString *positions = unsteady == 0 ? @"the position from the start point on after every play"
                                      : [NSString stringWithFormat:@"the position before the start point or going back after %d plays", unsteady];
  Check(problems.count == 0 && unsteady == 0, @(restart->name),
        [NSString stringWithFormat:@"%@ (each play's first note against the same note a bar later, dB: %@); %@", heard, [drops componentsJoinedByString:@" "], positions]);
}

/** A rewire while playing (a track's first effect) restarts the sequencer where it was: the position goes on from there. */
static void CheckRewire(NSURL *bankURL, NSData *song)
{
  dispatch_queue_t queue = dispatch_queue_create("audio-check.rewire", DISPATCH_QUEUE_SERIAL);
  GPMidiEngine *engine = [[GPMidiEngine alloc] initWithQueue:queue];
  Play(engine, queue, song, bankURL, 0);
  Wait(1);
  __block double before = 0, after = 0;
  dispatch_sync(queue, ^{
    before = engine.positionSeconds;
    [engine setMix:@{@"tracks" : @[ @[ @{@"type" : @"eq", @"isEnabled" : @YES, @"params" : @{}} ] ]}];
    after = engine.positionSeconds;
  });
  Wait(0.3);
  BOOL isPlaying = NO;
  double later = PositionOf(engine, queue, &isPlaying);
  dispatch_sync(queue, ^{
    [engine stop];
  });
  BOOL isPassed = after >= before - kPositionSlack && later > after + 0.2 && isPlaying;
  Check(isPassed, @"rewire while playing", [NSString stringWithFormat:@"position %.3f s before, %.3f s after, %.3f s 0.3 s later (playing %d)", before, after, later, isPlaying]);
}

/** Played from a bar before its end, the song plays on until then and is over after it. */
static void CheckSongEnd(NSURL *bankURL, NSData *song)
{
  dispatch_queue_t queue = dispatch_queue_create("audio-check.end", DISPATCH_QUEUE_SERIAL);
  GPMidiEngine *engine = [[GPMidiEngine alloc] initWithQueue:queue];
  Play(engine, queue, song, bankURL, kSongSeconds - kBarSeconds);
  Wait(kBarSeconds / 2);
  BOOL isPlayingBefore = NO, isPlayingAfter = YES;
  double position = PositionOf(engine, queue, &isPlayingBefore);
  Wait(kBarSeconds * 0.8);
  PositionOf(engine, queue, &isPlayingAfter);
  dispatch_sync(queue, ^{
    [engine stop];
  });
  Check(isPlayingBefore && !isPlayingAfter, @"song end",
        [NSString stringWithFormat:@"playing at %.3f s: %@; 0.6 s after the end: %@", position, isPlayingBefore ? @"yes" : @"no", isPlayingAfter ? @"still playing" : @"over"]);
}

int main(int argc, const char *argv[])
{
  @autoreleasepool {
    BOOL isSandboxed = NSProcessInfo.processInfo.environment[@"APP_SANDBOX_CONTAINER_ID"] != nil;
    if (argc < 2) {
      printf("%s\n", NSHomeDirectory().UTF8String);
      return isSandboxed ? 0 : 1;
    }
    Check(isSandboxed, @"App Sandbox", isSandboxed ? @"runs sandboxed, as the shipped app" : @"not sandboxed: sign it with GPEditor.entitlements (run.sh does)");
    NSURL *bankURL = [NSURL fileURLWithPath:@(argv[1])];
    int plays = argc > 2 ? MAX(1, atoi(argv[2])) : kDefaultPlays;
    srandom(1);
    NSData *song = RestartSong();
    for (size_t index = 0; index < sizeof(kCases) / sizeof(kCases[0]); index++) {
      RunCase(&kCases[index], bankURL, song, plays);
    }
    CheckRewire(bankURL, song);
    CheckSongEnd(bankURL, song);
    printf("%s: %d failed\n", failures == 0 ? "OK" : "FAILED", failures);
  }
  return failures == 0 ? 0 : 1;
}
