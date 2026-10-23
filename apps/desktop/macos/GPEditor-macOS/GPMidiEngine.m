#import "GPMidiEngine.h"

#import <AVFoundation/AVFoundation.h>
#import <AudioToolbox/AudioToolbox.h>

/**
 * Below 1.0 so several loud tracks leave the limiter some room: GeneralUser GS peaks at 1.7 on a dense mix (measured
 * on nightwish.gp5), which clipped under AVMIDIPlayer.
 */
static const float kOutputVolume = 0.8f;
/** How long a stopped engine keeps its bank in memory before it is released (the next play loads it again). */
static const NSTimeInterval kIdleReleaseSeconds = 60;

@implementation GPMidiEngine {
  dispatch_queue_t _queue;
  AVAudioEngine *_engine;
  AVAudioUnitMIDIInstrument *_synth;
  /** The bank loaded into _synth; NSNull for the synth's own. */
  id _bank;
  AVAudioSequencer *_sequencer;
  NSTimeInterval _length;
  /** Bumped by every play and stop, so only the latest stop's idle release runs. */
  NSUInteger _generation;
  /** Tracks of the MIDI file kept silent (setMutedTrackIndexes:). */
  NSIndexSet *_mutedTracks;
  /** MIDI file tracks the sequencer has no track for (SMF track i is sequencer track i - _trackOffset). */
  NSUInteger _trackOffset;
}

- (instancetype)initWithQueue:(dispatch_queue_t)queue
{
  if ((self = [super init])) {
    _queue = queue;
  }
  return self;
}

static AudioComponentDescription AppleAudioUnit(OSType type, OSType subType)
{
  AudioComponentDescription description = {type, subType, kAudioUnitManufacturer_Apple, 0, 0};
  return description;
}

/** A new engine whose synth has `bankURL` loaded (set before the synth is initialized, as MIDISynth requires). */
- (BOOL)buildEngineWithBank:(nullable NSURL *)bankURL error:(NSError **)error
{
  [self stopSequencer];
  [_engine stop];
  AVAudioEngine *engine = [AVAudioEngine new];
  AVAudioUnitMIDIInstrument *synth = [[AVAudioUnitMIDIInstrument alloc] initWithAudioComponentDescription:AppleAudioUnit(kAudioUnitType_MusicDevice, kAudioUnitSubType_MIDISynth)];
  if (bankURL != nil) {
    CFURLRef url = (__bridge CFURLRef)bankURL;
    OSStatus status = AudioUnitSetProperty(synth.audioUnit, kMusicDeviceProperty_SoundBankURL, kAudioUnitScope_Global, 0, &url, sizeof(url));
    if (status != noErr) {
      if (error != NULL) {
        *error = [NSError errorWithDomain:NSOSStatusErrorDomain code:status userInfo:@{NSLocalizedDescriptionKey : @"The sound bank could not be loaded"}];
      }
      return NO;
    }
  }
  AVAudioUnitEffect *limiter = [[AVAudioUnitEffect alloc] initWithAudioComponentDescription:AppleAudioUnit(kAudioUnitType_Effect, kAudioUnitSubType_PeakLimiter)];
  [engine attachNode:synth];
  [engine attachNode:limiter];
  [engine connect:synth to:limiter format:nil];
  [engine connect:limiter to:engine.mainMixerNode format:nil];
  engine.mainMixerNode.outputVolume = kOutputVolume;
  _engine = engine;
  _synth = synth;
  _bank = bankURL ?: [NSNull null];
  return YES;
}

- (BOOL)prepareEngineWithBank:(nullable NSURL *)bankURL error:(NSError **)error
{
  id wanted = bankURL ?: [NSNull null];
  if ((_engine == nil || ![_bank isEqual:wanted]) && ![self buildEngineWithBank:bankURL error:error]) {
    return NO;
  }
  return _engine.isRunning || [_engine startAndReturnError:error];
}

/**
 * Loads every program the song starts with while the synth's preload mode is on, so their samples are in memory
 * before the first note (MIDISynth would otherwise load them on the audio thread, mid-song).
 */
- (void)preloadProgramsOf:(AVAudioSequencer *)sequencer
{
  NSMutableArray<AVMIDIProgramChangeEvent *> *changes = [NSMutableArray array];
  for (AVMusicTrack *track in sequencer.tracks) {
    [track enumerateEventsInRange:AVMakeBeatRange(0, track.lengthInBeats + 1)
                       usingBlock:^(AVMusicEvent *event, AVMusicTimeStamp *timeStamp, BOOL *removeEvent) {
                         if ([event isKindOfClass:[AVMIDIProgramChangeEvent class]]) {
                           [changes addObject:(AVMIDIProgramChangeEvent *)event];
                         }
                       }];
  }
  UInt32 enable = 1;
  AudioUnitSetProperty(_synth.audioUnit, kAUMIDISynthProperty_EnablePreload, kAudioUnitScope_Global, 0, &enable, sizeof(enable));
  for (AVMIDIProgramChangeEvent *change in changes) {
    [_synth sendProgramChange:(uint8_t)change.programNumber onChannel:(uint8_t)change.channel];
  }
  enable = 0;
  AudioUnitSetProperty(_synth.audioUnit, kAUMIDISynthProperty_EnablePreload, kAudioUnitScope_Global, 0, &enable, sizeof(enable));
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

/** Mutes the sequencer's tracks that are muted in _mutedTracks (by their MIDI file index), unmutes the others. */
- (void)applyMutedTracksTo:(AVAudioSequencer *)sequencer
{
  NSIndexSet *muted = _mutedTracks;
  NSUInteger offset = _trackOffset;
  [sequencer.tracks enumerateObjectsUsingBlock:^(AVMusicTrack *track, NSUInteger index, BOOL *stop) {
    track.muted = [muted containsIndex:index + offset];
  }];
}

- (void)setMutedTrackIndexes:(NSIndexSet *)indexes
{
  _mutedTracks = [indexes copy];
  if (_sequencer != nil) {
    [self applyMutedTracksTo:_sequencer];
  }
}

- (BOOL)playData:(NSData *)midi fromSeconds:(NSTimeInterval)seconds bankURL:(nullable NSURL *)bankURL error:(NSError **)error
{
  [self stopSequencer];
  _generation += 1;
  if (![self prepareEngineWithBank:bankURL error:error]) {
    return NO;
  }
  AVAudioSequencer *sequencer = [[AVAudioSequencer alloc] initWithAudioEngine:_engine];
  if (![sequencer loadFromData:midi options:AVMusicSequenceLoadSMF_PreserveTracks error:error]) {
    return NO;
  }
  NSTimeInterval length = 0;
  for (AVMusicTrack *track in sequencer.tracks) {
    track.destinationAudioUnit = _synth;
    length = MAX(length, track.lengthInSeconds);
  }
  [self preloadProgramsOf:sequencer];
  // With PreserveTracks every file track is a sequencer track; should the first (tempo) one be folded into the tempo
  // track, the indexes shift by one.
  NSUInteger fileTracks = SmfTrackCount(midi);
  _trackOffset = fileTracks > sequencer.tracks.count ? fileTracks - sequencer.tracks.count : 0;
  [self applyMutedTracksTo:sequencer];
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
  [_sequencer stop];
  _sequencer = nil;
  // Notes still ringing when the song stops would otherwise sound on: all notes off, every channel.
  for (uint8_t channel = 0; channel < 16; channel++) {
    [_synth sendController:123 withValue:0 onChannel:channel];
  }
}

- (void)stop
{
  [self stopSequencer];
  [self scheduleIdleRelease];
}

/** Releases the engine a minute from now unless something plays before. */
- (void)scheduleIdleRelease
{
  _generation += 1;
  NSUInteger stoppedGeneration = _generation;
  __weak GPMidiEngine *weakSelf = self;
  dispatch_after(dispatch_time(DISPATCH_TIME_NOW, (int64_t)(kIdleReleaseSeconds * NSEC_PER_SEC)), _queue, ^{
    [weakSelf releaseEngineIfStillStopped:stoppedGeneration];
  });
}

- (BOOL)playNote:(UInt8)key velocity:(UInt8)velocity program:(UInt8)program onChannel:(UInt8)channel forSeconds:(NSTimeInterval)seconds bankURL:(nullable NSURL *)bankURL error:(NSError **)error
{
  if (key > 127 || velocity > 127 || channel > 15) {
    return YES;
  }
  BOOL isIdle = _sequencer == nil;
  if (isIdle && ![self prepareEngineWithBank:bankURL error:error]) {
    return NO;
  }
  [self setProgram:program onChannel:channel];
  AVAudioUnitMIDIInstrument *synth = _synth;
  [synth startNote:key withVelocity:velocity onChannel:channel];
  dispatch_after(dispatch_time(DISPATCH_TIME_NOW, (int64_t)(seconds * NSEC_PER_SEC)), _queue, ^{
    [synth stopNote:key onChannel:channel];
  });
  if (isIdle) {
    [self scheduleIdleRelease];
  }
  return YES;
}

/** Frees the engine and its bank when nothing played since the stop that scheduled this. */
- (void)releaseEngineIfStillStopped:(NSUInteger)stoppedGeneration
{
  if (_generation != stoppedGeneration || _sequencer != nil) {
    return;
  }
  [_engine stop];
  _engine = nil;
  _synth = nil;
  _bank = nil;
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
  if (_synth == nil || program > 127 || channel > 15) {
    return;
  }
  UInt32 enable = 1;
  AudioUnitSetProperty(_synth.audioUnit, kAUMIDISynthProperty_EnablePreload, kAudioUnitScope_Global, 0, &enable, sizeof(enable));
  [_synth sendProgramChange:program onChannel:channel];
  enable = 0;
  AudioUnitSetProperty(_synth.audioUnit, kAUMIDISynthProperty_EnablePreload, kAudioUnitScope_Global, 0, &enable, sizeof(enable));
  [_synth sendProgramChange:program onChannel:channel];
}

- (void)setController:(UInt8)controller value:(UInt8)value onChannel:(UInt8)channel
{
  if (_synth == nil || controller > 127 || value > 127 || channel > 15) {
    return;
  }
  [_synth sendController:controller withValue:value onChannel:channel];
}

@end
