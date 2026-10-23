#import "GPMidiEngine.h"

#import <AVFoundation/AVFoundation.h>

#import "GPAudioTrackPlayer.h"
#import "GPLineIn.h"
#import "GPMixGraph.h"
#import "GPTrackInstruments.h"

/** How long a stopped engine keeps its bank in memory before it is released (the next play loads it again). */
static const NSTimeInterval kIdleReleaseSeconds = 60;

@implementation GPMidiEngine {
  dispatch_queue_t _queue;
  AVAudioEngine *_engine;
  GPMixGraph *_graph;
  GPTrackInstruments *_instruments;
  GPLineIn *_lineIn;
  /** The audio track (Guitar Pro's backing track) and what the playing song plays of it; nil without one. */
  GPAudioTrackPlayer *_audioTrack;
  NSDictionary *_audioPlayback;
  /** The latest mix, applied to every engine built. */
  NSDictionary *_mix;
  AVAudioSequencer *_sequencer;
  NSTimeInterval _length;
  /** Bumped by every play and stop, so only the latest stop's idle release runs. */
  NSUInteger _generation;
  /** The engine opened an audio input: release it as soon as neither playback nor the line in needs it. */
  BOOL _hasOpenedInput;
}

- (instancetype)initWithQueue:(dispatch_queue_t)queue
{
  if ((self = [super init])) {
    _queue = queue;
    _mix = @{};
  }
  return self;
}

- (void)buildEngine
{
  _engine = [AVAudioEngine new];
  _graph = [[GPMixGraph alloc] initWithEngine:_engine];
  _instruments = [[GPTrackInstruments alloc] initWithEngine:_engine graph:_graph];
  _lineIn = [[GPLineIn alloc] initWithEngine:_engine graph:_graph];
  _audioTrack = [[GPAudioTrackPlayer alloc] initWithEngine:_engine graph:_graph queue:_queue];
  [_graph applyMix:_mix];
}

- (BOOL)startEngine:(NSError **)error
{
  return _engine.isRunning || [_engine startAndReturnError:error];
}

- (BOOL)playData:(NSData *)midi
     fromSeconds:(NSTimeInterval)seconds
         bankURL:(nullable NSURL *)bankURL
           audio:(nullable NSDictionary *)audio
           error:(NSError **)error
{
  [self stopSequencer];
  _generation += 1;
  if (_engine == nil) {
    [self buildEngine];
  }
  if (![_instruments prepareBank:bankURL error:error]) {
    return NO;
  }
  // The audio track's nodes are connected before the sequencer starts (a new connection would stop it).
  if (audio != nil && ![_audioTrack prepare:audio fromSeconds:seconds error:error]) {
    return NO;
  }
  if (![self startEngine:error]) {
    return NO;
  }
  AVAudioSequencer *sequencer = [[AVAudioSequencer alloc] initWithAudioEngine:_engine];
  if (![sequencer loadFromData:midi options:AVMusicSequenceLoadSMF_PreserveTracks error:error]) {
    return NO;
  }
  [_instruments routeSequencer:sequencer];
  NSTimeInterval length = 0;
  for (AVMusicTrack *track in sequencer.tracks) {
    length = MAX(length, track.lengthInSeconds);
  }
  sequencer.currentPositionInSeconds = MAX(0, seconds);
  [sequencer prepareToPlay];
  if (![sequencer startAndReturnError:error]) {
    return NO;
  }
  _sequencer = sequencer;
  _length = length;
  if (audio != nil) {
    _audioPlayback = audio;
    [_audioTrack startAtHostTime:[self hostTimeAtSeconds:seconds]];
  }
  return YES;
}

/** The host time the playing sequencer is at `seconds` of the song (now, when it cannot say). */
- (uint64_t)hostTimeAtSeconds:(NSTimeInterval)seconds
{
  uint64_t hostTime = [_sequencer hostTimeForBeats:[_sequencer beatsForSeconds:MAX(0, seconds)] error:nil];
  return hostTime == 0 ? mach_absolute_time() : hostTime;
}

/** After the sequencer started again at `seconds` (a rewire, the line in): the audio track from there too. */
- (void)resumeAudioAt:(NSTimeInterval)seconds
{
  if (_audioPlayback != nil && [_audioTrack prepare:_audioPlayback fromSeconds:seconds error:nil]) {
    [_audioTrack startAtHostTime:[self hostTimeAtSeconds:seconds]];
  }
}

- (void)setAudioTrackGain:(double)gain detuneCents:(double)detuneCents
{
  [_audioTrack setGain:gain detuneCents:detuneCents];
}

- (void)stopSequencer
{
  [_sequencer stop];
  _sequencer = nil;
  [_audioTrack stop];
  _audioPlayback = nil;
  // Notes still ringing when the song stops would otherwise sound on: all notes off, every instrument.
  [_instruments silence];
}

- (void)stop
{
  [self stopSequencer];
  _generation += 1;
  if (_hasOpenedInput && !_lineIn.isConnected) {
    [self releaseEngine];
    return;
  }
  NSUInteger stoppedGeneration = _generation;
  __weak GPMidiEngine *weakSelf = self;
  dispatch_after(dispatch_time(DISPATCH_TIME_NOW, (int64_t)(kIdleReleaseSeconds * NSEC_PER_SEC)), _queue, ^{
    [weakSelf releaseEngineIfStillStopped:stoppedGeneration];
  });
}

/** Frees the engine and its bank when nothing played since the stop that scheduled this, and the line in is off. */
- (void)releaseEngineIfStillStopped:(NSUInteger)stoppedGeneration
{
  if (_generation == stoppedGeneration && _sequencer == nil && !_lineIn.isConnected) {
    [self releaseEngine];
  }
}

- (void)releaseEngine
{
  [_engine stop];
  _engine = nil;
  _graph = nil;
  _instruments = nil;
  _lineIn = nil;
  _audioTrack = nil;
  _hasOpenedInput = NO;
}

/** After a graph change (which stops a playing sequencer): the engine running, the song going on where it was. */
- (void)resumeAfterRewire
{
  NSTimeInterval position = _sequencer.currentPositionInSeconds;
  [_sequencer stop];
  if (![self startEngine:nil] || _sequencer == nil) {
    return;
  }
  _sequencer.currentPositionInSeconds = position;
  [_sequencer prepareToPlay];
  [_sequencer startAndReturnError:nil];
  [self resumeAudioAt:position];
}

- (NSTimeInterval)positionSeconds
{
  return _sequencer == nil ? 0 : _sequencer.currentPositionInSeconds;
}

- (BOOL)isPlaying
{
  return _sequencer != nil && _sequencer.isPlaying && _sequencer.currentPositionInSeconds < _length;
}

- (void)setProgram:(UInt8)program onChannel:(UInt8)channel
{
  if (program <= 127 && channel <= 15) {
    [_instruments setProgram:program onChannel:channel];
  }
}

- (void)setController:(UInt8)controller value:(UInt8)value onChannel:(UInt8)channel
{
  if (controller <= 127 && value <= 127 && channel <= 15) {
    [_instruments setController:controller value:value onChannel:channel];
  }
}

- (void)setMix:(NSDictionary *)mix
{
  _mix = [mix copy];
  if (_engine != nil && [_graph applyMix:_mix]) {
    if (_lineIn.isConnected) {
      [_lineIn routeToTrack:_lineIn.trackIndex];
    }
    [self resumeAfterRewire];
  }
}

// MARK: - Line in

- (BOOL)startLineInWithDevice:(nullable NSString *)deviceId
                   trackIndex:(NSInteger)trackIndex
                       gainDb:(double)gainDb
                 isMonitoring:(BOOL)isMonitoring
                        error:(NSError **)error
{
  if (_engine == nil) {
    [self buildEngine];
  }
  // The input device is set on a stopped engine; a playing song goes on where it was.
  NSTimeInterval position = _sequencer.currentPositionInSeconds;
  [_sequencer stop];
  [_engine stop];
  _hasOpenedInput = YES;
  BOOL isConnected = [_lineIn connectDevice:deviceId error:error];
  if (isConnected) {
    [_lineIn routeToTrack:trackIndex];
    [_lineIn setGainDb:gainDb isMonitoring:isMonitoring];
  }
  BOOL isRunning = [self startEngine:isConnected ? error : nil];
  if (_sequencer != nil && isRunning) {
    _sequencer.currentPositionInSeconds = position;
    [_sequencer prepareToPlay];
    [_sequencer startAndReturnError:nil];
    [self resumeAudioAt:position];
  }
  if (isConnected && !isRunning) {
    [_lineIn disconnect];
  }
  return isConnected && isRunning;
}

- (void)updateLineInTrack:(NSInteger)trackIndex gainDb:(double)gainDb isMonitoring:(BOOL)isMonitoring
{
  if (!_lineIn.isConnected) {
    return;
  }
  if (trackIndex != _lineIn.trackIndex) {
    [_lineIn routeToTrack:trackIndex];
    [self resumeAfterRewire];
  }
  [_lineIn setGainDb:gainDb isMonitoring:isMonitoring];
}

- (void)stopLineIn
{
  if (!_lineIn.isConnected) {
    return;
  }
  [_lineIn disconnect];
  if (_sequencer == nil) {
    // Releasing the engine lets go of the input device (the menu bar's microphone light goes off).
    [self releaseEngine];
  } else {
    [self resumeAfterRewire];
  }
}

- (BOOL)isLineInOn
{
  return _lineIn.isConnected;
}

- (double)takeLineInLevel
{
  return _lineIn.isConnected ? [_lineIn takePeakLevel] : -120;
}

@end
