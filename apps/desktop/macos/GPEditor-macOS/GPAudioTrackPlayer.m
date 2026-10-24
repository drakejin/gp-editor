#import "GPAudioTrackPlayer.h"

#import "GPAudioAssets.h"

/** AVAudioUnitTimePitch's rate range is 1/32…32; the practice speeds stay well inside 0.1…10. */
static const double kMinRate = 0.1;
static const double kMaxRate = 10;
static const double kMaxDetuneCents = 2400;
/** A run starting within this of a time counts as started (engine seconds come back through sample counts). */
static const double kTimeTolerance = 1e-6;

/** One stretch of the file: from `at` seconds of the render, the file's `from`…`to` seconds at `rate`. */
@interface GPAudioRun : NSObject
@property (nonatomic) double at;
@property (nonatomic) double from;
@property (nonatomic) double to;
@property (nonatomic) double rate;
@end

@implementation GPAudioRun
@end

static double NumberIn(NSDictionary *dictionary, NSString *key, double fallback)
{
  id value = dictionary[key];
  double number = [value isKindOfClass:[NSNumber class]] ? [value doubleValue] : fallback;
  return isfinite(number) ? number : fallback;
}

/** The runs of a playback dictionary, checked (untrusted bridge input): finite, in order, rates within bounds. */
static NSArray<GPAudioRun *> *RunsOf(NSDictionary *playback)
{
  NSArray *items = [playback[@"runs"] isKindOfClass:[NSArray class]] ? playback[@"runs"] : @[];
  NSMutableArray<GPAudioRun *> *runs = [NSMutableArray array];
  for (id item in items) {
    if (![item isKindOfClass:[NSDictionary class]]) {
      continue;
    }
    GPAudioRun *run = [GPAudioRun new];
    run.at = NumberIn(item, @"atSeconds", NAN);
    run.from = NumberIn(item, @"fromSeconds", NAN);
    run.to = NumberIn(item, @"toSeconds", NAN);
    run.rate = MIN(kMaxRate, MAX(kMinRate, NumberIn(item, @"rate", 1)));
    BOOL isInOrder = runs.count == 0 || run.at >= runs.lastObject.at;
    if (!isnan(run.at) && !isnan(run.from) && !isnan(run.to) && run.to > run.from && isInOrder) {
      [runs addObject:run];
    }
  }
  return runs;
}

@implementation GPAudioTrackPlayer {
  AVAudioEngine *_engine;
  GPMixGraph *_graph;
  dispatch_queue_t _queue;
  AVAudioPlayerNode *_player;
  AVAudioUnitTimePitch *_timePitch;
  AVAudioMixerNode *_strip;
  AVAudioFormat *_connectedFormat;
  AVAudioFile *_file;
  NSString *_assetId;
  NSArray<GPAudioRun *> *_runs;
  /** Seconds of the render the player's first sample stands for: where it starts, plus the time-pitch latency. */
  double _origin;
  /** Bumped by every prepare and stop, so rate changes of an earlier start never apply. */
  NSUInteger _generation;
}

- (instancetype)initWithEngine:(AVAudioEngine *)engine graph:(GPMixGraph *)graph queue:(nullable dispatch_queue_t)queue
{
  if ((self = [super init])) {
    _engine = engine;
    _graph = graph;
    _queue = queue;
  }
  return self;
}

- (NSTimeInterval)latency
{
  return _timePitch == nil ? 0 : MAX(0, _timePitch.latency);
}

/**
 * The nodes, attached once and connected from the player to the bus (a mixer, which takes a new input while the engine
 * runs); a file of another format connects the player and the time-pitch unit again on a stopped engine.
 */
- (void)connectForFormat:(AVAudioFormat *)format
{
  if ([_connectedFormat isEqual:format]) {
    return;
  }
  BOOL isNew = _player == nil;
  if (isNew) {
    _player = [AVAudioPlayerNode new];
    _timePitch = [AVAudioUnitTimePitch new];
    _strip = [AVAudioMixerNode new];
    for (AVAudioNode *node in @[ _player, _timePitch, _strip ]) {
      [_engine attachNode:node];
    }
  } else {
    [_engine stop];
    [_engine disconnectNodeOutput:_player];
    [_engine disconnectNodeOutput:_timePitch];
  }
  [_engine connect:_player to:_timePitch format:format];
  [_engine connect:_timePitch to:_strip format:format];
  if (isNew) {
    [_engine connect:_strip to:_graph.bus fromBus:0 toBus:[_graph.bus nextAvailableInputBus] format:nil];
  }
  _connectedFormat = format;
}

- (BOOL)openAsset:(NSString *)assetId error:(NSError **)error
{
  if (_file != nil && [_assetId isEqualToString:assetId]) {
    return YES;
  }
  NSURL *url = [GPAudioAssets URLForAssetId:assetId];
  if (url == nil) {
    if (error != NULL) {
      *error = [NSError errorWithDomain:@"GPAudioTrackPlayer" code:1 userInfo:@{NSLocalizedDescriptionKey : @"The audio track's file is not loaded"}];
    }
    return NO;
  }
  _file = [[AVAudioFile alloc] initForReading:url error:error];
  _assetId = _file == nil ? nil : assetId;
  return _file != nil;
}

- (BOOL)prepare:(nullable NSDictionary *)playback fromSeconds:(NSTimeInterval)fromSeconds error:(NSError **)error
{
  [self stop];
  NSString *assetId = [playback[@"assetId"] isKindOfClass:[NSString class]] ? playback[@"assetId"] : nil;
  if (assetId == nil || ![self openAsset:assetId error:error]) {
    return NO;
  }
  [self connectForFormat:_file.processingFormat];
  [self setGain:NumberIn(playback, @"gain", 1) detuneCents:NumberIn(playback, @"detuneCents", 0)];
  _runs = RunsOf(playback);
  _origin = MAX(0, fromSeconds) + self.latency;

  _timePitch.rate = (float)[self rateAtRenderSeconds:_origin];
  for (GPAudioRun *run in _runs) {
    [self scheduleRun:run];
  }
  return YES;
}

/** The rate of the last run started at `seconds` of the render (the first run's before it). */
- (double)rateAtRenderSeconds:(double)seconds
{
  double rate = _runs.count == 0 ? 1 : _runs.firstObject.rate;
  for (GPAudioRun *run in _runs) {
    if (run.at > seconds + kTimeTolerance) {
      break;
    }
    rate = run.rate;
  }
  return rate;
}

/** Seconds of the file the player has played from its start (the render's `_origin`) to `seconds` of the render. */
- (double)fileSecondsPlayedTo:(double)seconds
{
  double played = 0;
  double cursor = _origin;
  double rate = [self rateAtRenderSeconds:_origin];
  for (GPAudioRun *run in _runs) {
    if (run.at <= cursor) {
      continue;
    }
    if (run.at >= seconds) {
      break;
    }
    played += (run.at - cursor) * rate;
    cursor = run.at;
    rate = run.rate;
  }
  return played + MAX(0, seconds - cursor) * rate;
}

/** A run's part inside the file and after the player's start, scheduled where the player reaches it. */
- (void)scheduleRun:(GPAudioRun *)run
{
  double fileRate = _file.processingFormat.sampleRate;
  double duration = (double)_file.length / fileRate;
  double from = MAX(run.from, 0);
  double startAt = run.at + (from - run.from) / run.rate;
  if (startAt < _origin) {
    from += (_origin - startAt) * run.rate;
    startAt = _origin;
  }
  double to = MIN(run.to, duration);
  AVAudioFramePosition first = (AVAudioFramePosition)llround(from * fileRate);
  AVAudioFramePosition last = (AVAudioFramePosition)llround(to * fileRate);
  if (last <= first) {
    return;
  }
  AVAudioTime *when = [AVAudioTime timeWithSampleTime:(AVAudioFramePosition)llround([self fileSecondsPlayedTo:startAt] * fileRate) atRate:fileRate];
  [_player scheduleSegment:_file startingFrame:first frameCount:(AVAudioFrameCount)(last - first) atTime:when completionHandler:nil];
}

- (void)startAtHostTime:(uint64_t)hostTime
{
  if (_runs.count == 0) {
    return;
  }
  [_player playAtTime:[AVAudioTime timeWithHostTime:hostTime]];
  if (_queue == nil) {
    return;
  }
  NSUInteger generation = _generation;
  __weak GPAudioTrackPlayer *weakSelf = self;
  for (double change = [self nextRateChangeAfter:0]; isfinite(change); change = [self nextRateChangeAfter:change]) {
    uint64_t fireHostTime = hostTime + [AVAudioTime hostTimeForSeconds:change];
    double delay = [AVAudioTime secondsForHostTime:fireHostTime] - [AVAudioTime secondsForHostTime:mach_absolute_time()];
    dispatch_after(dispatch_time(DISPATCH_TIME_NOW, (int64_t)(MAX(0, delay) * NSEC_PER_SEC)), _queue, ^{
      GPAudioTrackPlayer *player = weakSelf;
      if (player != nil && player->_generation == generation) {
        [player applyRateAt:change];
      }
    });
  }
}

- (void)startNow
{
  if (_runs.count > 0) {
    [_player play];
  }
}

- (NSTimeInterval)nextRateChangeAfter:(NSTimeInterval)engineSeconds
{
  double rate = [self rateAtRenderSeconds:_origin + engineSeconds];
  for (GPAudioRun *run in _runs) {
    double seconds = run.at - _origin;
    if (seconds > engineSeconds + kTimeTolerance && run.rate != rate) {
      return seconds;
    }
  }
  return INFINITY;
}

- (void)applyRateAt:(NSTimeInterval)engineSeconds
{
  _timePitch.rate = (float)[self rateAtRenderSeconds:_origin + engineSeconds];
}

- (void)setGain:(double)gain detuneCents:(double)detuneCents
{
  _strip.outputVolume = (float)MIN(1, MAX(0, isfinite(gain) ? gain : 1));
  _timePitch.pitch = (float)MIN(kMaxDetuneCents, MAX(-kMaxDetuneCents, isfinite(detuneCents) ? detuneCents : 0));
}

- (void)stop
{
  _generation += 1;
  [_player stop];
  _runs = @[];
}

@end
