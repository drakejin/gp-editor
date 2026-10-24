#import "GPMidiEngine.h"

#import <AVFoundation/AVFoundation.h>
#import <os/log.h>

#import "GPAudioTrackPlayer.h"
#import "GPLineIn.h"
#import "GPMixGraph.h"
#import "GPTrackInstruments.h"

/** How long a stopped engine keeps its bank in memory before it is released (the next play loads it again). */
static const NSTimeInterval kIdleReleaseSeconds = 60;
/** The audio track starts this long after the sequencer's start (see -startAudioAt:)… */
static const NSTimeInterval kAudioStartLead = 0.04;
/** …and is prepared again further on when the sequencer, at its first render, is less than this before that. */
static const NSTimeInterval kAudioStartMargin = 0.01;
/** Longest wait for the sequencer's first render before the audio track starts. */
static const NSTimeInterval kFirstRenderTimeout = 0.5;

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
  /** Tracks of the MIDI file kept silent (setMutedTrackIndexes:), and those always on the shared synth (the clicks). */
  NSIndexSet *_mutedTracks;
  NSIndexSet *_clickTracks;
  /** MIDI file tracks the sequencer has no track for (file track i is sequencer track i - _trackOffset). */
  NSUInteger _trackOffset;
  /** The sequencer's tracks before routing appended split ones: the file's tracks. */
  NSUInteger _fileTrackCount;
}

- (instancetype)initWithQueue:(dispatch_queue_t)queue
{
  if ((self = [super init])) {
    _queue = queue;
    _mix = @{};
    _mutedTracks = [NSIndexSet indexSet];
    _clickTracks = [NSIndexSet indexSet];
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
 * Events scheduled meanwhile are delivered once it renders again, before the song's first notes. The audio track's
 * nodes are connected meanwhile too (a new connection would stop the sequencer); it starts once the engine renders
 * again (-startAudioAt:).
 */
- (BOOL)playData:(NSData *)midi
     fromSeconds:(NSTimeInterval)seconds
         bankURL:(nullable NSURL *)bankURL
           audio:(nullable NSDictionary *)audio
           error:(NSError **)error
{
  [_engine pause];
  BOOL isStarted = [self startSequencerWithData:midi fromSeconds:seconds bankURL:bankURL audio:audio error:error];
  if ([self startEngine:isStarted ? error : NULL]) {
    [self startAudioAt:seconds];
    return isStarted;
  }
  [self stopSequencer];
  return NO;
}

/** The old song stopped, the new one loaded, routed, prerolled and started (its audio prepared): it plays once the engine runs. */
- (BOOL)startSequencerWithData:(NSData *)midi
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
  if (audio != nil && ![self prepareAudio:audio at:seconds error:error]) {
    return NO;
  }
  AVAudioSequencer *sequencer = [[AVAudioSequencer alloc] initWithAudioEngine:_engine];
  if (![sequencer loadFromData:midi options:AVMusicSequenceLoadSMF_PreserveTracks error:error]) {
    return NO;
  }
  [self routeSequencer:sequencer midi:midi];
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
  _audioPlayback = audio;
  return YES;
}

/** The new song's tracks on their instruments (the click tracks on the shared synth), the silent ones muted. */
- (void)routeSequencer:(AVAudioSequencer *)sequencer midi:(NSData *)midi
{
  // With PreserveTracks every file track is a sequencer track; should the first (tempo) one be folded into the tempo
  // track, the indexes shift by one. Routing may append tracks (a strip's channels): those come after the file's.
  NSUInteger fileTracks = SmfTrackCount(midi);
  _fileTrackCount = sequencer.tracks.count;
  _trackOffset = fileTracks > _fileTrackCount ? fileTracks - _fileTrackCount : 0;
  NSIndexSet *clickTracks = [self sequencerIndexes:_clickTracks];
  [_instruments routeSequencer:sequencer clickTracks:clickTracks];
  os_log(OS_LOG_DEFAULT, "GPMidiEngine: %lu file tracks, %lu sequencer tracks, %lu muted, %lu clicks", (unsigned long)fileTracks,
         (unsigned long)_fileTrackCount, (unsigned long)_mutedTracks.count, (unsigned long)_clickTracks.count);
  LogDestinations(sequencer, clickTracks);
  [self applyMutedTracksTo:sequencer];
}

/** Track count in a Standard MIDI File's header (MThd: bytes 10–11, big-endian); 0 when it has none. */
static NSUInteger SmfTrackCount(NSData *midi)
{
  if (midi.length < 12) {
    return 0;
  }
  const uint8_t *bytes = midi.bytes;
  return ((NSUInteger)bytes[10] << 8) | bytes[11];
}

/** Logs which instrument each sequence track plays on (the shared synth or a strip's sampler), click tracks marked. */
static void LogDestinations(AVAudioSequencer *sequencer, NSIndexSet *clickTracks)
{
  NSMutableArray<NSString *> *destinations = [NSMutableArray array];
  [sequencer.tracks enumerateObjectsUsingBlock:^(AVMusicTrack *track, NSUInteger index, BOOL *stop) {
    BOOL isSampler = [track.destinationAudioUnit isKindOfClass:[AVAudioUnitSampler class]];
    [destinations addObject:[NSString stringWithFormat:@"%lu%@:%@", (unsigned long)index, [clickTracks containsIndex:index] ? @"(click)" : @"", isSampler ? @"strip" : @"synth"]];
  }];
  os_log(OS_LOG_DEFAULT, "GPMidiEngine: routes %{public}@", [destinations componentsJoinedByString:@" "]);
}

/** File track indexes as the playing sequencer's track indexes. */
- (NSIndexSet *)sequencerIndexes:(NSIndexSet *)fileIndexes
{
  NSMutableIndexSet *indexes = [NSMutableIndexSet indexSet];
  NSUInteger offset = _trackOffset;
  [fileIndexes enumerateIndexesUsingBlock:^(NSUInteger index, BOOL *stop) {
    if (index >= offset) {
      [indexes addIndex:index - offset];
    }
  }];
  return indexes;
}

/** Logs a track being muted with its first note (key and MIDI channel), so QA can tell which track went silent. */
static void LogFirstNote(AVMusicTrack *track, NSUInteger index)
{
  __block int key = -1;
  __block int channel = -1;
  [track enumerateEventsInRange:AVMakeBeatRange(0, track.lengthInBeats + 1)
                     usingBlock:^(AVMusicEvent *event, AVMusicTimeStamp *timeStamp, BOOL *removeEvent) {
                       if (key < 0 && [event isKindOfClass:[AVMIDINoteEvent class]]) {
                         key = (int)((AVMIDINoteEvent *)event).key;
                         channel = (int)((AVMIDINoteEvent *)event).channel;
                       }
                     }];
  os_log(OS_LOG_DEFAULT, "GPMidiEngine: muted sequencer track %lu (first note %d on channel %d)", (unsigned long)index, key, channel);
}

/** Mutes the file's tracks that are in _mutedTracks, unmutes the others (tracks routing appended are left alone). */
- (void)applyMutedTracksTo:(AVAudioSequencer *)sequencer
{
  NSIndexSet *muted = [self sequencerIndexes:_mutedTracks];
  NSArray<AVMusicTrack *> *tracks = sequencer.tracks;
  for (NSUInteger index = 0; index < MIN(_fileTrackCount, tracks.count); index++) {
    AVMusicTrack *track = tracks[index];
    BOOL isMuted = [muted containsIndex:index];
    if (isMuted && !track.muted) {
      LogFirstNote(track, index);
    }
    track.muted = isMuted;
  }
}

- (void)setMutedTrackIndexes:(NSIndexSet *)indexes
{
  _mutedTracks = [indexes copy];
  if (_sequencer != nil) {
    [self applyMutedTracksTo:_sequencer];
  }
}

- (void)setClickTrackIndexes:(NSIndexSet *)indexes
{
  _clickTracks = [indexes copy];
}

- (BOOL)playNote:(UInt8)key
        velocity:(UInt8)velocity
         program:(UInt8)program
       onChannel:(UInt8)channel
      trackIndex:(NSInteger)trackIndex
      forSeconds:(NSTimeInterval)seconds
         bankURL:(nullable NSURL *)bankURL
           error:(NSError **)error
{
  if (key > 127 || velocity > 127 || program > 127 || channel > 15) {
    return YES;
  }
  BOOL isIdle = _sequencer == nil;
  if (_engine == nil) {
    [self buildEngine];
  }
  if (isIdle && (![_instruments prepareBank:bankURL error:error] || ![self startEngine:error])) {
    return NO;
  }
  AVAudioUnitMIDIInstrument *instrument = [_instruments startPreviewNote:key velocity:velocity program:program onChannel:channel trackIndex:trackIndex];
  dispatch_after(dispatch_time(DISPATCH_TIME_NOW, (int64_t)(seconds * NSEC_PER_SEC)), _queue, ^{
    [instrument stopNote:key onChannel:channel];
  });
  if (isIdle) {
    [self scheduleIdleRelease];
  }
  return YES;
}

/** The host time the playing sequencer is at `seconds` of the song (now, when it cannot say). */
- (uint64_t)hostTimeAtSeconds:(NSTimeInterval)seconds
{
  uint64_t hostTime = [_sequencer hostTimeForBeats:[_sequencer beatsForSeconds:MAX(0, seconds)] error:nil];
  return hostTime == 0 ? mach_absolute_time() : hostTime;
}

/**
 * While the engine does not render: the audio track ready to start kAudioStartLead after `seconds` (-startAudioAt:),
 * its nodes connected, and the time-pitch unit cleared of the last play (else what it kept would delay this one).
 */
- (BOOL)prepareAudio:(NSDictionary *)audio at:(NSTimeInterval)seconds error:(NSError **)error
{
  [_audioTrack reset];
  return [_audioTrack prepare:audio fromSeconds:seconds + kAudioStartLead error:error];
}

/**
 * Once the engine runs, the prepared audio track (if the song has one) starts in step with the sequencer started at
 * `seconds`. AVAudioSequencer knows its host times only once it has rendered: before, -hostTimeForBeats:error: raises
 * (kAudioToolboxErr_InvalidPlayerState, -10852), here always, as the sequencer starts while the engine is paused. So
 * this waits for its first render (some 20 ms), then starts the audio at the host time the sequencer reaches
 * kAudioStartLead (the first 40 ms of the audio are not heard) — or, on a machine too busy for that, further on.
 */
- (void)startAudioAt:(NSTimeInterval)seconds
{
  if (_audioPlayback == nil || _sequencer == nil) {
    return;
  }
  CFAbsoluteTime deadline = CFAbsoluteTimeGetCurrent() + kFirstRenderTimeout;
  while (_sequencer.currentPositionInSeconds <= seconds && CFAbsoluteTimeGetCurrent() < deadline) {
    usleep(1000);
  }
  NSTimeInterval position = _sequencer.currentPositionInSeconds;
  NSTimeInterval at = seconds + kAudioStartLead;
  BOOL isLate = position + kAudioStartMargin > at;
  if (isLate) {
    at = position + kAudioStartLead;
  }
  if (position <= seconds || (isLate && ![_audioTrack prepare:_audioPlayback fromSeconds:at error:nil])) {
    os_log(OS_LOG_DEFAULT, "GPMidiEngine: the audio track did not start (sequencer at %.3f s, started at %.3f s)", position, seconds);
    return;
  }
  [_audioTrack startAtHostTime:[self hostTimeAtSeconds:at]];
}

- (void)setAudioTrackGain:(double)gain detuneCents:(double)detuneCents
{
  [_audioTrack setGain:gain detuneCents:detuneCents];
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
  [_audioTrack stop];
  _audioPlayback = nil;
  // Notes still ringing when the song stops would otherwise sound on: all notes off, every instrument.
  [_instruments silence];
  if (isPaused) {
    [self startEngine:nil];
  }
}

- (void)stop
{
  [self stopSequencer];
  [self scheduleIdleRelease];
}

/** Releases the engine a minute from now unless something plays before (at once when it had opened an input). */
- (void)scheduleIdleRelease
{
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
  [_engine pause];
  [_sequencer stop];
  [self restartEngineWithSequencerAt:position error:nil];
}

/** Starts the stopped engine, the sequencer (if any) prerolled and started at `position` first (see -playData:…). */
- (BOOL)restartEngineWithSequencerAt:(NSTimeInterval)position error:(NSError **)error
{
  if (_audioPlayback != nil && ![self prepareAudio:_audioPlayback at:position error:nil]) {
    _audioPlayback = nil;
  }
  _sequencer.currentPositionInSeconds = position;
  [_sequencer prepareToPlay];
  [_sequencer startAndReturnError:nil];
  if ([self startEngine:error]) {
    [self startAudioAt:position];
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
