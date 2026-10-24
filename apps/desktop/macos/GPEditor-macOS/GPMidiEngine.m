#import "GPMidiEngine.h"

#import <AVFoundation/AVFoundation.h>

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
  [_graph applyMix:_mix];
}

- (BOOL)startEngine:(NSError **)error
{
  return _engine.isRunning || [_engine startAndReturnError:error];
}

/**
 * AVAudioSequencer stops, prerolls and starts on the calling queue, unsynchronised with the render thread, so it does
 * all three only while the engine does not render (-pause returns once the render cycle in progress is over):
 * - its preroll's chase sends the song's state so far (programs, controllers) straight to the instruments
 *   (MusicDeviceMIDIEvent) while the render thread may be handing them MIDI too — every -send… of
 *   AVAudioUnitMIDIInstrument (the preload, the silence on stop, live changes) is scheduled and delivered there —
 *   and the MIDISynth / sampler's MIDI input, entered by both threads at once, corrupts its heap (SIGSEGV at 0x210,
 *   "pointer being freed was not allocated" … under SequencePlayer::Preroll → MusicDeviceMIDIEvent; Guard Malloc:
 *   the render thread reading what the chase had just reallocated);
 * - its start and stop add and remove a render notify on the output unit, and the render thread could still call
 *   the removed (freed) block (crashes in AUHALOutputUnit_RenderNotifyCallback → _Block_copy).
 * Events scheduled meanwhile are delivered once it renders again, before the song's first notes.
 */
- (BOOL)playData:(NSData *)midi fromSeconds:(NSTimeInterval)seconds bankURL:(nullable NSURL *)bankURL error:(NSError **)error
{
  [_engine pause];
  BOOL isStarted = [self startSequencerWithData:midi fromSeconds:seconds bankURL:bankURL error:error];
  if ([self startEngine:isStarted ? error : NULL]) {
    return isStarted;
  }
  [self stopSequencer];
  return NO;
}

/** The old song stopped, the new one loaded, routed, prerolled and started: it plays once the engine runs. */
- (BOOL)startSequencerWithData:(NSData *)midi fromSeconds:(NSTimeInterval)seconds bankURL:(nullable NSURL *)bankURL error:(NSError **)error
{
  [self stopSequencer];
  _generation += 1;
  if (_engine == nil) {
    [self buildEngine];
  }
  if (![_instruments prepareBank:bankURL error:error]) {
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
  return YES;
}

- (void)stopSequencer
{
  // Stopped while the engine does not render (see -playData:…); then it renders on, so the notes still ringing fade.
  BOOL isPaused = _sequencer != nil && _engine.isRunning;
  if (isPaused) {
    [_engine pause];
  }
  [_sequencer stop];
  _sequencer = nil;
  // Notes still ringing when the song stops would otherwise sound on: all notes off, every instrument.
  [_instruments silence];
  if (isPaused) {
    [self startEngine:nil];
  }
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
  _hasOpenedInput = NO;
}

/** After a graph change (which stops a playing sequencer): the engine running, the song going on where it was. */
- (void)resumeAfterRewire
{
  NSTimeInterval position = _sequencer.currentPositionInSeconds;
  [_engine pause];
  [_sequencer stop];
  [self restartEngineWithSequencerAt:position error:nil];
}

/** Starts the stopped engine, the sequencer (if any) prerolled and started at `position` first (see -playData:…). */
- (BOOL)restartEngineWithSequencerAt:(NSTimeInterval)position error:(NSError **)error
{
  _sequencer.currentPositionInSeconds = position;
  [_sequencer prepareToPlay];
  [_sequencer startAndReturnError:nil];
  if ([self startEngine:error]) {
    return YES;
  }
  [_sequencer stop];
  return NO;
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
  [_engine stop];
  [_sequencer stop];
  _hasOpenedInput = YES;
  BOOL isConnected = [_lineIn connectDevice:deviceId error:error];
  if (isConnected) {
    [_lineIn routeToTrack:trackIndex];
    [_lineIn setGainDb:gainDb isMonitoring:isMonitoring];
  }
  BOOL isRunning = [self restartEngineWithSequencerAt:position error:isConnected ? error : nil];
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
