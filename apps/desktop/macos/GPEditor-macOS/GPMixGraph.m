#import "GPMixGraph.h"

#import "GPEffectNodes.h"

/**
 * Below 1.0 so several loud tracks leave the limiter some room: GeneralUser GS peaks at 1.7 on a dense mix (measured
 * on nightwish.gp5), which clipped under AVMIDIPlayer.
 */
static const float kOutputVolume = 0.8f;
static const double kMinMasterGainDb = -24;
static const double kMaxMasterGainDb = 12;

/** One track's strip: head mixer → effects → the bus input it holds. */
@interface GPTrackStrip : NSObject
@property (nonatomic, strong) AVAudioMixerNode *head;
@property (nonatomic, copy) NSArray<GPEffectNode *> *effects;
@property (nonatomic) AVAudioNodeBus busInput;
@end

@implementation GPTrackStrip
@end

static NSArray<NSDictionary *> *EffectList(id value)
{
  if (![value isKindOfClass:[NSArray class]]) {
    return @[];
  }
  NSMutableArray<NSDictionary *> *effects = [NSMutableArray array];
  for (id item in (NSArray *)value) {
    if ([item isKindOfClass:[NSDictionary class]] && [item[@"type"] isKindOfClass:[NSString class]]) {
      [effects addObject:item];
    }
  }
  return effects;
}

static NSArray<NSString *> *TypesOf(NSArray *effects)
{
  return [effects valueForKey:@"type"];
}

@implementation GPMixGraph {
  AVAudioEngine *_engine;
  /** EQ, compressor, reverb, limiter. */
  NSArray<GPEffectNode *> *_master;
  /** The master gain, before the limiter (a mixer's volume stops at 1.0): an EQ's global gain, bypassed at 0 dB. */
  AVAudioUnitEQ *_gain;
  NSMutableDictionary<NSNumber *, GPTrackStrip *> *_strips;
}

- (instancetype)initWithEngine:(AVAudioEngine *)engine
{
  if ((self = [super init])) {
    _engine = engine;
    _strips = [NSMutableDictionary dictionary];
    _bus = [AVAudioMixerNode new];
    [engine attachNode:_bus];
    NSMutableArray<GPEffectNode *> *master = [NSMutableArray array];
    for (NSString *type in @[ @"eq", @"compressor", @"reverb", @"limiter" ]) {
      GPEffectNode *node = [GPEffectNode nodeForEffect:@{@"type" : type, @"isEnabled" : @([type isEqualToString:@"limiter"]), @"params" : @{}}];
      [engine attachNode:node.node];
      [master addObject:node];
    }
    _master = master;
    _gain = [[AVAudioUnitEQ alloc] initWithNumberOfBands:1];
    _gain.bands.firstObject.bypass = YES;
    _gain.bypass = YES;
    [engine attachNode:_gain];
    NSArray<AVAudioNode *> *chain = @[ _bus, master[0].node, master[1].node, master[2].node, _gain, master[3].node, engine.mainMixerNode ];
    for (NSUInteger index = 1; index < chain.count; index++) {
      [engine connect:chain[index - 1] to:chain[index] format:nil];
    }
    engine.mainMixerNode.outputVolume = kOutputVolume;
  }
  return self;
}

- (nullable AVAudioMixerNode *)stripInputForTrack:(NSInteger)trackIndex
{
  return _strips[@(trackIndex)].head;
}

- (BOOL)applyMix:(NSDictionary *)mix
{
  NSArray *tracks = [mix[@"tracks"] isKindOfClass:[NSArray class]] ? mix[@"tracks"] : @[];
  BOOL isRewired = NO;
  for (NSNumber *trackIndex in _strips.allKeys) {
    if (trackIndex.unsignedIntegerValue >= tracks.count || EffectList(tracks[trackIndex.unsignedIntegerValue]).count == 0) {
      [self removeStrip:_strips[trackIndex]];
      [_strips removeObjectForKey:trackIndex];
      isRewired = YES;
    }
  }
  for (NSUInteger trackIndex = 0; trackIndex < tracks.count; trackIndex++) {
    NSArray<NSDictionary *> *effects = EffectList(tracks[trackIndex]);
    if (effects.count > 0) {
      isRewired = [self applyEffects:effects toTrack:trackIndex] || isRewired;
    }
  }
  [self applyMaster:[mix[@"master"] isKindOfClass:[NSDictionary class]] ? mix[@"master"] : @{}];
  return isRewired;
}

/** New values on the same effects in place; another list of effects rebuilds the strip. YES when it was rebuilt. */
- (BOOL)applyEffects:(NSArray<NSDictionary *> *)effects toTrack:(NSUInteger)trackIndex
{
  GPTrackStrip *strip = _strips[@(trackIndex)];
  if (strip != nil && [TypesOf(strip.effects) isEqualToArray:TypesOf(effects)]) {
    [strip.effects enumerateObjectsUsingBlock:^(GPEffectNode *node, NSUInteger index, BOOL *stop) {
      [node applyEffect:effects[index]];
    }];
    return NO;
  }
  if (strip == nil) {
    strip = [GPTrackStrip new];
    strip.head = [AVAudioMixerNode new];
    strip.busInput = [_bus nextAvailableInputBus];
    [_engine attachNode:strip.head];
    _strips[@(trackIndex)] = strip;
  } else {
    [self detachEffectsOf:strip];
  }
  NSMutableArray<GPEffectNode *> *nodes = [NSMutableArray array];
  for (NSDictionary *effect in effects) {
    GPEffectNode *node = [GPEffectNode nodeForEffect:effect];
    if (node != nil) {
      [_engine attachNode:node.node];
      [nodes addObject:node];
    }
  }
  strip.effects = nodes;
  AVAudioNode *previous = strip.head;
  for (GPEffectNode *node in nodes) {
    [_engine connect:previous to:node.node format:nil];
    previous = node.node;
  }
  [_engine connect:previous to:_bus fromBus:0 toBus:strip.busInput format:nil];
  return YES;
}

- (void)detachEffectsOf:(GPTrackStrip *)strip
{
  [_engine disconnectNodeOutput:strip.head];
  for (GPEffectNode *node in strip.effects) {
    [_engine detachNode:node.node];
  }
  strip.effects = @[];
}

- (void)removeStrip:(GPTrackStrip *)strip
{
  [self detachEffectsOf:strip];
  [_engine detachNode:strip.head];
}

- (void)applyMaster:(NSDictionary *)master
{
  NSArray<NSDictionary *> *effects = EffectList(master[@"effects"]);
  for (GPEffectNode *node in _master) {
    NSUInteger found = [effects indexOfObjectPassingTest:^BOOL(NSDictionary *effect, NSUInteger index, BOOL *stop) {
      return [effect[@"type"] isEqualToString:node.type];
    }];
    // A master without this effect listed: its default, off (the limiter on).
    NSDictionary *fallback = @{@"type" : node.type, @"isEnabled" : @([node.type isEqualToString:@"limiter"]), @"params" : @{}};
    [node applyEffect:found == NSNotFound ? fallback : effects[found]];
  }
  double gainDb = [master[@"gainDb"] isKindOfClass:[NSNumber class]] ? [master[@"gainDb"] doubleValue] : 0;
  gainDb = isfinite(gainDb) ? MIN(kMaxMasterGainDb, MAX(kMinMasterGainDb, gainDb)) : 0;
  _gain.globalGain = (float)gainDb;
  _gain.bypass = gainDb == 0;
}

@end
