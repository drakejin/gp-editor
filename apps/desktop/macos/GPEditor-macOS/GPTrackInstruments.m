#import "GPTrackInstruments.h"

#import <AudioToolbox/AudioToolbox.h>

static const UInt8 kPercussionChannel = 9;
static const UInt8 kBankSelect = 0;
static const UInt8 kAllNotesOff = 123;
#define GP_MIDI_CHANNELS 16

/** One sampler: what it plays (song track, MIDI channel) and what it has loaded. */
@interface GPChannelSampler : NSObject
@property (nonatomic, strong) AVAudioUnitSampler *sampler;
@property (nonatomic, weak) AVAudioMixerNode *head;
@property (nonatomic) UInt8 channel;
@property (nonatomic) UInt8 program;
@property (nonatomic) UInt8 bank;
@property (nonatomic, strong, nullable) NSURL *bankURL;
@end

@implementation GPChannelSampler
@end

static AudioComponentDescription AppleUnit(OSType type, OSType subType)
{
  AudioComponentDescription description = {type, subType, kAudioUnitManufacturer_Apple, 0, 0};
  return description;
}

/** The MIDI channel of a channel event (notes, controllers, programs, bends …); -1 for anything else. */
static int ChannelOf(AVMusicEvent *event)
{
  if ([event isKindOfClass:[AVMIDINoteEvent class]]) {
    return (int)((AVMIDINoteEvent *)event).channel;
  }
  return [event isKindOfClass:[AVMIDIChannelEvent class]] ? (int)((AVMIDIChannelEvent *)event).channel : -1;
}

static AVBeatRange WholeTrack(AVMusicTrack *track)
{
  return AVMakeBeatRange(0, track.lengthInBeats + 1);
}

@implementation GPTrackInstruments {
  AVAudioEngine *_engine;
  GPMixGraph *_graph;
  AVAudioUnitMIDIInstrument *_synth;
  /** The bank loaded into _synth; NSNull for the synth's own. */
  id _bank;
  /** Keyed "track:channel". */
  NSMutableDictionary<NSString *, GPChannelSampler *> *_samplers;
}

- (instancetype)initWithEngine:(AVAudioEngine *)engine graph:(GPMixGraph *)graph
{
  if ((self = [super init])) {
    _engine = engine;
    _graph = graph;
    _samplers = [NSMutableDictionary dictionary];
  }
  return self;
}

- (BOOL)prepareBank:(nullable NSURL *)bankURL error:(NSError **)error
{
  id wanted = bankURL ?: [NSNull null];
  if (_synth != nil && [_bank isEqual:wanted]) {
    return YES;
  }
  AVAudioUnitMIDIInstrument *synth = [[AVAudioUnitMIDIInstrument alloc] initWithAudioComponentDescription:AppleUnit(kAudioUnitType_MusicDevice, kAudioUnitSubType_MIDISynth)];
  if (bankURL != nil) {
    // Set before the synth is initialized (attached), as MIDISynth requires.
    CFURLRef url = (__bridge CFURLRef)bankURL;
    OSStatus status = AudioUnitSetProperty(synth.audioUnit, kMusicDeviceProperty_SoundBankURL, kAudioUnitScope_Global, 0, &url, sizeof(url));
    if (status != noErr) {
      if (error != NULL) {
        *error = [NSError errorWithDomain:NSOSStatusErrorDomain code:status userInfo:@{NSLocalizedDescriptionKey : @"The sound bank could not be loaded"}];
      }
      return NO;
    }
  }
  if (_synth != nil) {
    [_engine detachNode:_synth];
  }
  [_engine attachNode:synth];
  [_engine connect:synth to:_graph.bus fromBus:0 toBus:[_graph.bus nextAvailableInputBus] format:nil];
  _synth = synth;
  _bank = wanted;
  return YES;
}

- (void)routeSequencer:(AVAudioSequencer *)sequencer
{
  NSArray<AVMusicTrack *> *tracks = [sequencer.tracks copy];
  NSMutableSet<NSString *> *used = [NSMutableSet set];
  NSURL *bankURL = [_bank isKindOfClass:[NSURL class]] ? _bank : nil;
  for (NSUInteger index = 0; index < tracks.count; index++) {
    AVMusicTrack *track = tracks[index];
    AVAudioMixerNode *head = index == 0 || bankURL == nil ? nil : [_graph stripInputForTrack:(NSInteger)index - 1];
    track.destinationAudioUnit = _synth;
    if (head != nil) {
      [self routeStripTrack:track ofSequencer:sequencer trackIndex:index - 1 head:head bankURL:bankURL conductor:tracks.firstObject used:used];
    }
  }
  for (NSString *key in _samplers.allKeys) {
    if (![used containsObject:key]) {
      [_engine detachNode:_samplers[key].sampler];
      [_samplers removeObjectForKey:key];
    }
  }
  [self preloadSynthProgramsOf:tracks];
}

/** A strip track's channels, each on a sampler of its own (events of the 2nd and later channels move to new tracks). */
- (void)routeStripTrack:(AVMusicTrack *)track
            ofSequencer:(AVAudioSequencer *)sequencer
             trackIndex:(NSUInteger)trackIndex
                   head:(AVAudioMixerNode *)head
                bankURL:(NSURL *)bankURL
              conductor:(AVMusicTrack *)conductor
                   used:(NSMutableSet<NSString *> *)used
{
  NSMutableOrderedSet<NSNumber *> *channels = [NSMutableOrderedSet orderedSet];
  int programs[GP_MIDI_CHANNELS] = {0};
  int banks[GP_MIDI_CHANNELS] = {0};
  int *program = programs;
  int *bank = banks;
  [track enumerateEventsInRange:WholeTrack(track) usingBlock:^(AVMusicEvent *event, AVMusicTimeStamp *timeStamp, BOOL *removeEvent) {
    int channel = ChannelOf(event);
    if (channel < 0 || channel >= GP_MIDI_CHANNELS) {
      return;
    }
    [channels addObject:@(channel)];
    if ([event isKindOfClass:[AVMIDIProgramChangeEvent class]]) {
      program[channel] = (int)((AVMIDIProgramChangeEvent *)event).programNumber;
    } else if ([event isKindOfClass:[AVMIDIControlChangeEvent class]] && ((AVMIDIControlChangeEvent *)event).messageType == kBankSelect) {
      bank[channel] = (int)((AVMIDIControlChangeEvent *)event).value;
    }
  }];
  for (NSUInteger position = 0; position < channels.count; position++) {
    UInt8 channel = (UInt8)channels[position].intValue;
    AVMusicTrack *target = position == 0 ? track : [self moveChannel:channel ofTrack:track toNewTrackOf:sequencer];
    target.destinationAudioUnit = _synth;
    GPChannelSampler *entry = [self samplerForTrack:trackIndex channel:channel head:head bankURL:bankURL program:(UInt8)program[channel] bank:(UInt8)bank[channel]];
    if (entry == nil) {
      continue; // The bank has no such instrument: the shared synth plays it, without the effects.
    }
    target.destinationAudioUnit = entry.sampler;
    [used addObject:[NSString stringWithFormat:@"%lu:%u", (unsigned long)trackIndex, channel]];
    [self replayControlsOf:conductor onChannel:channel to:entry.sampler];
  }
}

/** A new sequence track holding (only) the events of one MIDI channel of `track`. */
- (AVMusicTrack *)moveChannel:(UInt8)channel ofTrack:(AVMusicTrack *)track toNewTrackOf:(AVAudioSequencer *)sequencer
{
  AVMusicTrack *moved = [sequencer createAndAppendTrack];
  NSMutableArray<AVMusicEvent *> *events = [NSMutableArray array];
  NSMutableArray<NSNumber *> *beats = [NSMutableArray array];
  [track enumerateEventsInRange:WholeTrack(track) usingBlock:^(AVMusicEvent *event, AVMusicTimeStamp *timeStamp, BOOL *removeEvent) {
    if (ChannelOf(event) == channel) {
      [events addObject:event];
      [beats addObject:@(*timeStamp)];
      *removeEvent = YES;
    }
  }];
  [events enumerateObjectsUsingBlock:^(AVMusicEvent *event, NSUInteger index, BOOL *stop) {
    [moved addEvent:event atBeat:beats[index].doubleValue];
  }];
  moved.lengthInBeats = track.lengthInBeats;
  return moved;
}

/** The conductor's per-channel set-up (the pitch-bend range RPN) reaches the shared synth only: give it to a sampler. */
- (void)replayControlsOf:(AVMusicTrack *)conductor onChannel:(UInt8)channel to:(AVAudioUnitSampler *)sampler
{
  [conductor enumerateEventsInRange:AVMakeBeatRange(0, 1) usingBlock:^(AVMusicEvent *event, AVMusicTimeStamp *timeStamp, BOOL *removeEvent) {
    if ([event isKindOfClass:[AVMIDIControlChangeEvent class]] && ChannelOf(event) == channel) {
      AVMIDIControlChangeEvent *control = (AVMIDIControlChangeEvent *)event;
      [sampler sendController:(uint8_t)control.messageType withValue:(uint8_t)control.value onChannel:channel];
    }
  }];
}

- (nullable GPChannelSampler *)samplerForTrack:(NSUInteger)trackIndex
                                       channel:(UInt8)channel
                                          head:(AVAudioMixerNode *)head
                                       bankURL:(NSURL *)bankURL
                                       program:(UInt8)program
                                          bank:(UInt8)bank
{
  NSString *key = [NSString stringWithFormat:@"%lu:%u", (unsigned long)trackIndex, channel];
  GPChannelSampler *entry = _samplers[key];
  if (entry != nil && entry.head != head) {
    [_engine detachNode:entry.sampler];
    entry = nil;
  }
  if (entry == nil) {
    entry = [GPChannelSampler new];
    entry.sampler = [AVAudioUnitSampler new];
    entry.head = head;
    entry.channel = channel;
    [_engine attachNode:entry.sampler];
    [_engine connect:entry.sampler to:head fromBus:0 toBus:[head nextAvailableInputBus] format:nil];
  } else if (entry.program == program && entry.bank == bank && [entry.bankURL isEqual:bankURL]) {
    return entry;
  }
  if (![self loadProgram:program bank:bank bankURL:bankURL into:entry]) {
    [_engine detachNode:entry.sampler];
    [_samplers removeObjectForKey:key];
    return nil;
  }
  _samplers[key] = entry;
  return entry;
}

/** The program from the bank (drums from the percussion bank); a variation the bank lacks falls back to its base. */
- (BOOL)loadProgram:(UInt8)program bank:(UInt8)bank bankURL:(NSURL *)bankURL into:(GPChannelSampler *)entry
{
  BOOL isPercussion = entry.channel == kPercussionChannel;
  UInt8 msb = isPercussion ? kAUSampler_DefaultPercussionBankMSB : kAUSampler_DefaultMelodicBankMSB;
  NSArray<NSNumber *> *lsbs = isPercussion || bank == 0 ? @[ @0 ] : @[ @(bank), @0 ];
  for (NSNumber *lsb in lsbs) {
    if ([entry.sampler loadSoundBankInstrumentAtURL:bankURL program:program bankMSB:msb bankLSB:lsb.unsignedCharValue error:nil]) {
      entry.program = program;
      entry.bank = bank;
      entry.bankURL = bankURL;
      return YES;
    }
  }
  return NO;
}

/**
 * Loads every program the shared synth's tracks start with while its preload mode is on, so their samples are in
 * memory before the first note (MIDISynth would otherwise load them on the audio thread, mid-song).
 */
- (void)preloadSynthProgramsOf:(NSArray<AVMusicTrack *> *)tracks
{
  NSMutableArray<AVMIDIProgramChangeEvent *> *changes = [NSMutableArray array];
  for (AVMusicTrack *track in tracks) {
    if (track.destinationAudioUnit != _synth) {
      continue;
    }
    [track enumerateEventsInRange:WholeTrack(track) usingBlock:^(AVMusicEvent *event, AVMusicTimeStamp *timeStamp, BOOL *removeEvent) {
      if ([event isKindOfClass:[AVMIDIProgramChangeEvent class]]) {
        [changes addObject:(AVMIDIProgramChangeEvent *)event];
      }
    }];
  }
  [self setSynthPreload:YES];
  for (AVMIDIProgramChangeEvent *change in changes) {
    [_synth sendProgramChange:(uint8_t)change.programNumber onChannel:(uint8_t)change.channel];
  }
  [self setSynthPreload:NO];
}

- (void)setSynthPreload:(BOOL)isOn
{
  UInt32 enable = isOn ? 1 : 0;
  AudioUnitSetProperty(_synth.audioUnit, kAUMIDISynthProperty_EnablePreload, kAudioUnitScope_Global, 0, &enable, sizeof(enable));
}

- (void)setProgram:(UInt8)program onChannel:(UInt8)channel
{
  if (_synth != nil) {
    [self setSynthPreload:YES];
    [_synth sendProgramChange:program onChannel:channel];
    [self setSynthPreload:NO];
    [_synth sendProgramChange:program onChannel:channel];
  }
  for (GPChannelSampler *entry in _samplers.allValues) {
    if (entry.channel == channel && channel != kPercussionChannel && entry.bankURL != nil) {
      [self loadProgram:program bank:entry.bank bankURL:entry.bankURL into:entry];
    }
  }
}

- (void)setController:(UInt8)controller value:(UInt8)value onChannel:(UInt8)channel
{
  [_synth sendController:controller withValue:value onChannel:channel];
  for (GPChannelSampler *entry in _samplers.allValues) {
    if (entry.channel == channel) {
      [entry.sampler sendController:controller withValue:value onChannel:channel];
    }
  }
}

- (void)silence
{
  for (UInt8 channel = 0; channel < GP_MIDI_CHANNELS; channel++) {
    [_synth sendController:kAllNotesOff withValue:0 onChannel:channel];
  }
  for (GPChannelSampler *entry in _samplers.allValues) {
    [entry.sampler sendController:kAllNotesOff withValue:0 onChannel:entry.channel];
  }
}

@end
