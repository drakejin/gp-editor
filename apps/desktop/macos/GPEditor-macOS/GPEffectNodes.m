#import "GPEffectNodes.h"

#import <AudioToolbox/AudioToolbox.h>

#import "GPDSPUnit.h"

/** The EQ's fixed bands: low cut, bass shelf, middle peak, treble shelf, high cut. */
typedef NS_ENUM(NSUInteger, GPEqBand) { GPEqLowCut, GPEqBass, GPEqMiddle, GPEqTreble, GPEqHighCut, GPEqBandCount };
static const float kBassShelfHz = 120;
static const float kTrebleShelfHz = 4000;
static const float kMiddleOctaves = 1.0f;
/** Low cut at its lowest and high cut at its highest leave the sound alone: those bands are bypassed. */
static const double kLowCutOff = 20.5;
static const double kHighCutOff = 19999;

static double Param(NSDictionary *params, NSString *key, double min, double max, double fallback)
{
  id raw = params[key];
  double value = [raw isKindOfClass:[NSNumber class]] ? [raw doubleValue] : fallback;
  return isfinite(value) ? MIN(max, MAX(min, value)) : fallback;
}

static AudioComponentDescription AppleEffect(OSType subType)
{
  AudioComponentDescription description = {kAudioUnitType_Effect, subType, kAudioUnitManufacturer_Apple, 0, 0};
  return description;
}

static void SetUnitParameter(AVAudioUnitEffect *node, AudioUnitParameterID parameter, double value)
{
  AudioUnitSetParameter(node.audioUnit, parameter, kAudioUnitScope_Global, 0, (AudioUnitParameterValue)value, 0);
}

@implementation GPEffectNode {
  /** The reverb room last loaded (loading a factory preset resets the reverb, so only a new room loads one). */
  NSInteger _room;
}

- (instancetype)initWithType:(NSString *)type node:(AVAudioUnitEffect *)node
{
  if ((self = [super init])) {
    _type = [type copy];
    _node = node;
    _room = -1;
  }
  return self;
}

+ (nullable AVAudioUnitEffect *)newNodeOfType:(NSString *)type
{
  if ([type isEqualToString:@"eq"]) {
    AVAudioUnitEQ *eq = [[AVAudioUnitEQ alloc] initWithNumberOfBands:GPEqBandCount];
    NSArray<NSNumber *> *types = @[ @(AVAudioUnitEQFilterTypeHighPass), @(AVAudioUnitEQFilterTypeLowShelf), @(AVAudioUnitEQFilterTypeParametric), @(AVAudioUnitEQFilterTypeHighShelf), @(AVAudioUnitEQFilterTypeLowPass) ];
    [eq.bands enumerateObjectsUsingBlock:^(AVAudioUnitEQFilterParameters *band, NSUInteger index, BOOL *stop) {
      band.filterType = (AVAudioUnitEQFilterType)types[index].integerValue;
    }];
    return eq;
  }
  NSDictionary<NSString *, NSNumber *> *dsp = @{@"drive" : @(GPDSPKindDrive), @"chorus" : @(GPDSPKindChorus), @"cabinet" : @(GPDSPKindCabinet)};
  if (dsp[type] != nil) {
    return [GPDSPUnit effectNodeOfKind:(GPDSPKind)dsp[type].intValue];
  }
  if ([type isEqualToString:@"compressor"]) {
    return [[AVAudioUnitEffect alloc] initWithAudioComponentDescription:AppleEffect(kAudioUnitSubType_DynamicsProcessor)];
  }
  if ([type isEqualToString:@"limiter"]) {
    return [[AVAudioUnitEffect alloc] initWithAudioComponentDescription:AppleEffect(kAudioUnitSubType_PeakLimiter)];
  }
  if ([type isEqualToString:@"delay"]) {
    return [AVAudioUnitDelay new];
  }
  return [type isEqualToString:@"reverb"] ? [AVAudioUnitReverb new] : nil;
}

+ (nullable instancetype)nodeForEffect:(NSDictionary *)effect
{
  NSString *type = [effect[@"type"] isKindOfClass:[NSString class]] ? effect[@"type"] : @"";
  AVAudioUnitEffect *node = [self newNodeOfType:type];
  if (node == nil) {
    return nil;
  }
  GPEffectNode *effectNode = [[GPEffectNode alloc] initWithType:type node:node];
  [effectNode applyEffect:effect];
  return effectNode;
}

- (void)applyEffect:(NSDictionary *)effect
{
  NSDictionary *params = [effect[@"params"] isKindOfClass:[NSDictionary class]] ? effect[@"params"] : @{};
  BOOL isEnabled = ![effect[@"isEnabled"] isKindOfClass:[NSNumber class]] || [effect[@"isEnabled"] boolValue];
  if ([_type isEqualToString:@"eq"]) {
    [self applyEq:params];
  } else if ([_type isEqualToString:@"compressor"]) {
    [self applyCompressor:params];
  } else if ([_type isEqualToString:@"limiter"]) {
    SetUnitParameter(_node, kLimiterParam_PreGain, Param(params, @"gain", -12, 12, 0));
    SetUnitParameter(_node, kLimiterParam_DecayTime, Param(params, @"release", 1, 40, 5) / 1000);
  } else if ([_type isEqualToString:@"delay"]) {
    [self applyDelay:params];
  } else if ([_type isEqualToString:@"reverb"]) {
    [self applyReverb:params];
  } else {
    [self applyDsp:params];
  }
  _node.bypass = !isEnabled;
  if ([_node.AUAudioUnit isKindOfClass:[GPDSPUnit class]]) {
    _node.AUAudioUnit.shouldBypassEffect = !isEnabled;
  }
}

- (void)applyEq:(NSDictionary *)params
{
  NSArray<AVAudioUnitEQFilterParameters *> *bands = ((AVAudioUnitEQ *)_node).bands;
  double lowCut = Param(params, @"lowCut", 20, 600, 20);
  double highCut = Param(params, @"highCut", 1000, 20000, 20000);
  bands[GPEqLowCut].frequency = (float)lowCut;
  bands[GPEqLowCut].bypass = lowCut <= kLowCutOff;
  double sampleRate = [_node outputFormatForBus:0].sampleRate;
  bands[GPEqHighCut].frequency = (float)MIN(highCut, (sampleRate > 0 ? sampleRate : 44100) * 0.45);
  bands[GPEqHighCut].bypass = highCut >= kHighCutOff;
  NSArray *gains = @[ @[ @(GPEqBass), @"lowGain" ], @[ @(GPEqMiddle), @"midGain" ], @[ @(GPEqTreble), @"highGain" ] ];
  for (NSArray *pair in gains) {
    AVAudioUnitEQFilterParameters *band = bands[[pair[0] unsignedIntegerValue]];
    band.gain = (float)Param(params, pair[1], -15, 15, 0);
    band.bypass = band.gain == 0;
  }
  bands[GPEqBass].frequency = kBassShelfHz;
  bands[GPEqTreble].frequency = kTrebleShelfHz;
  bands[GPEqMiddle].frequency = (float)Param(params, @"midFrequency", 200, 5000, 800);
  bands[GPEqMiddle].bandwidth = kMiddleOctaves;
}

- (void)applyCompressor:(NSDictionary *)params
{
  SetUnitParameter(_node, kDynamicsProcessorParam_Threshold, Param(params, @"threshold", -40, 0, -18));
  SetUnitParameter(_node, kDynamicsProcessorParam_HeadRoom, Param(params, @"headroom", 1, 40, 6));
  SetUnitParameter(_node, kDynamicsProcessorParam_AttackTime, Param(params, @"attack", 1, 300, 10) / 1000);
  SetUnitParameter(_node, kDynamicsProcessorParam_ReleaseTime, Param(params, @"release", 10, 3000, 150) / 1000);
  SetUnitParameter(_node, kDynamicsProcessorParam_OverallGain, Param(params, @"gain", -12, 24, 3));
}

- (void)applyDelay:(NSDictionary *)params
{
  AVAudioUnitDelay *delay = (AVAudioUnitDelay *)_node;
  delay.delayTime = Param(params, @"time", 10, 2000, 350) / 1000;
  delay.feedback = (float)Param(params, @"feedback", 0, 95, 30);
  delay.lowPassCutoff = (float)Param(params, @"tone", 500, 20000, 6000);
  delay.wetDryMix = (float)Param(params, @"mix", 0, 100, 25);
}

- (void)applyReverb:(NSDictionary *)params
{
  AVAudioUnitReverb *reverb = (AVAudioUnitReverb *)_node;
  NSInteger room = (NSInteger)lround(Param(params, @"room", 0, AVAudioUnitReverbPresetCathedral, AVAudioUnitReverbPresetMediumHall));
  if (room != _room) {
    [reverb loadFactoryPreset:(AVAudioUnitReverbPreset)room];
    _room = room;
  }
  reverb.wetDryMix = (float)Param(params, @"mix", 0, 100, 25);
}

/** Drive, chorus and cabinet: GPDSPKernels.h's parameter order. */
- (void)applyDsp:(NSDictionary *)params
{
  NSDictionary<NSString *, NSArray *> *layouts = @{
    @"drive" : @[ @[ @"mode", @0, @2, @0 ], @[ @"gain", @0, @48, @18 ], @[ @"tone", @0, @100, @50 ], @[ @"level", @-36, @6, @-12 ] ],
    @"chorus" : @[ @[ @"rate", @0.05, @5, @0.8 ], @[ @"depth", @0, @8, @2.5 ], @[ @"delay", @5, @30, @12 ], @[ @"mix", @0, @100, @50 ] ],
    @"cabinet" : @[ @[ @"model", @0, @3, @0 ], @[ @"mix", @0, @100, @100 ], @[ @"level", @-12, @12, @0 ] ],
  };
  GPDSPUnit *unit = [_node.AUAudioUnit isKindOfClass:[GPDSPUnit class]] ? (GPDSPUnit *)_node.AUAudioUnit : nil;
  [layouts[_type] enumerateObjectsUsingBlock:^(NSArray *spec, NSUInteger index, BOOL *stop) {
    double value = Param(params, spec[0], [spec[1] doubleValue], [spec[2] doubleValue], [spec[3] doubleValue]);
    [unit setParam:(int)index value:(float)value];
  }];
}

@end
