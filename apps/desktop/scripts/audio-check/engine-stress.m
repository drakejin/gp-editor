// The engine's stress run (engine-check.m runs it): see engine-stress.h. Values come from gp-core's EFFECT_PARAMS ranges,
// their ends included; the chains and the timing follow what the Track inspector's EFFECTS and the Mixer send.

#import "engine-stress.h"

#import <stdlib.h>

#import "GPMidiEngine.h"

/** Most effects a track's chain holds (gp-core's MAX_TRACK_EFFECTS). */
static const NSUInteger kMaxTrackEffects = 8;
/** JS restarts playback this long after a track's first effect or its last one removed (use-playback.ts). */
static const int kRestartDelayMs = 300;
/** A slider drag: this many mixes at most, one a frame. */
static const int kMaxDragSteps = 30;
static const useconds_t kFrameMicroseconds = 16000;
/** The longest wait between two actions, and the longest preview. */
static const int kMaxWaitMs = 120;
static const NSTimeInterval kPreviewSeconds = 0.3;
static const NSTimeInterval kMaxStartSeconds = 20;

/** What one run drives and keeps: the engine, its queue, the song's chains and master as JS would hold them. */
typedef struct {
  __unsafe_unretained GPMidiEngine *engine;
  __unsafe_unretained dispatch_queue_t queue;
  __unsafe_unretained NSURL *bankURL;
  __unsafe_unretained NSData *song;
  __unsafe_unretained NSMutableArray<NSArray *> *chains;
  NSUInteger trackCount;
  BOOL isPlaying;
} GPStress;

static NSArray<NSString *> *TrackEffectTypes(void)
{
  return @[ @"eq", @"compressor", @"drive", @"chorus", @"delay", @"reverb", @"cabinet" ];
}

/** Each type's parameter ids with their ranges (gp-core's EFFECT_PARAMS). */
static NSDictionary<NSString *, NSArray<NSArray *> *> *ParamRanges(void)
{
  return @{
    @"eq" : @[ @[ @"lowCut", @20, @600 ], @[ @"lowGain", @-15, @15 ], @[ @"midFrequency", @200, @5000 ], @[ @"midGain", @-15, @15 ], @[ @"highGain", @-15, @15 ], @[ @"highCut", @1000, @20000 ] ],
    @"compressor" : @[ @[ @"threshold", @-40, @0 ], @[ @"headroom", @1, @40 ], @[ @"attack", @1, @300 ], @[ @"release", @10, @3000 ], @[ @"gain", @-12, @24 ] ],
    @"drive" : @[ @[ @"mode", @0, @2 ], @[ @"gain", @0, @48 ], @[ @"tone", @0, @100 ], @[ @"level", @-36, @6 ] ],
    @"chorus" : @[ @[ @"rate", @0.05, @5 ], @[ @"depth", @0, @8 ], @[ @"delay", @5, @30 ], @[ @"mix", @0, @100 ] ],
    @"delay" : @[ @[ @"time", @10, @2000 ], @[ @"feedback", @0, @95 ], @[ @"tone", @500, @20000 ], @[ @"mix", @0, @100 ] ],
    @"reverb" : @[ @[ @"room", @0, @8 ], @[ @"mix", @0, @100 ] ],
    @"cabinet" : @[ @[ @"model", @0, @3 ], @[ @"mix", @0, @100 ], @[ @"level", @-12, @12 ] ],
    @"limiter" : @[ @[ @"gain", @-12, @12 ], @[ @"release", @1, @40 ] ],
  };
}

static NSUInteger RandomBelow(NSUInteger count)
{
  return count == 0 ? 0 : (NSUInteger)random() % count;
}

/** A value of the range: often one of its ends, else anywhere in it. */
static double RandomIn(NSArray *range)
{
  double min = [range[1] doubleValue], max = [range[2] doubleValue];
  switch (RandomBelow(6)) {
    case 0:
      return min;
    case 1:
      return max;
    default:
      return min + (max - min) * (double)RandomBelow(10001) / 10000.0;
  }
}

static NSDictionary *RandomParams(NSString *type)
{
  NSMutableDictionary *params = [NSMutableDictionary dictionary];
  for (NSArray *range in ParamRanges()[type]) {
    if (RandomBelow(4) != 0) {
      params[range[0]] = @(RandomIn(range));
    }
  }
  return params;
}

static NSDictionary *RandomEffect(NSString *type)
{
  return @{@"type" : type, @"isEnabled" : @(RandomBelow(5) != 0), @"params" : RandomParams(type)};
}

static void SendMix(GPStress *stress, NSDictionary *master)
{
  NSMutableArray *tracks = [NSMutableArray array];
  for (NSArray *chain in stress->chains) {
    [tracks addObject:chain.count == 0 ? [NSNull null] : [chain copy]];
  }
  NSDictionary *mix = master == nil ? @{@"tracks" : tracks} : @{@"tracks" : tracks, @"master" : master};
  GPMidiEngine *engine = stress->engine;
  dispatch_async(stress->queue, ^{
    [engine setMix:mix];
  });
}

static void Play(GPStress *stress)
{
  NSTimeInterval from = RandomBelow(3) == 0 ? (NSTimeInterval)RandomBelow((NSUInteger)kMaxStartSeconds) : 0;
  GPMidiEngine *engine = stress->engine;
  NSURL *bankURL = stress->bankURL;
  NSData *song = stress->song;
  dispatch_async(stress->queue, ^{
    NSError *error = nil;
    if (![engine playData:song fromSeconds:from bankURL:bankURL audio:nil error:&error]) {
      printf("INFO play from %.0f s failed: %s\n", from, error.localizedDescription.UTF8String ?: "");
    }
  });
  stress->isPlaying = YES;
}

static void Stop(GPStress *stress)
{
  GPMidiEngine *engine = stress->engine;
  dispatch_async(stress->queue, ^{
    [engine stop];
  });
  stress->isPlaying = NO;
}

/** The tracks that have effects (a change of them routes tracks anew: JS restarts playback). */
static NSIndexSet *TracksWithEffects(GPStress *stress)
{
  NSMutableIndexSet *indexes = [NSMutableIndexSet indexSet];
  [stress->chains enumerateObjectsUsingBlock:^(NSArray *chain, NSUInteger index, BOOL *stop) {
    if (chain.count > 0) {
      [indexes addIndex:index];
    }
  }];
  return indexes;
}

/** One edit of a chain, as the EFFECTS editor makes them. */
static NSArray *EditedChain(NSArray *chain)
{
  NSMutableArray *edited = [chain mutableCopy];
  NSUInteger at = RandomBelow(chain.count);
  NSUInteger kind = chain.count == 0 ? 0 : RandomBelow(7);
  if (kind == 0 && chain.count < kMaxTrackEffects) {
    NSArray<NSString *> *types = TrackEffectTypes();
    [edited insertObject:RandomEffect(types[RandomBelow(types.count)]) atIndex:RandomBelow(chain.count + 1)];
  } else if (kind == 1) {
    [edited removeObjectAtIndex:at];
  } else if (kind == 2) {
    id effect = edited[at];
    [edited removeObjectAtIndex:at];
    [edited insertObject:effect atIndex:RandomBelow(edited.count + 1)];
  } else if (kind == 3) {
    NSDictionary *effect = edited[at];
    edited[at] = @{@"type" : effect[@"type"], @"isEnabled" : @(![effect[@"isEnabled"] boolValue]), @"params" : effect[@"params"]};
  } else if (kind == 4) {
    // A chain preset (Clean, Crunch, Lead, Bass DI …): another whole chain.
    NSArray *presets = @[ @[ @"compressor", @"eq", @"reverb" ], @[ @"drive", @"eq", @"cabinet", @"reverb" ], @[ @"compressor", @"drive", @"eq", @"cabinet", @"delay", @"reverb" ], @[ @"chorus", @"delay", @"reverb" ] ];
    [edited removeAllObjects];
    for (NSString *type in presets[RandomBelow(presets.count)]) {
      [edited addObject:RandomEffect(type)];
    }
  } else if (chain.count > 0) {
    NSDictionary *effect = edited[at];
    edited[at] = @{@"type" : effect[@"type"], @"isEnabled" : effect[@"isEnabled"], @"params" : RandomParams(effect[@"type"])};
  }
  return edited;
}

static void EditChain(GPStress *stress)
{
  NSUInteger track = RandomBelow(stress->trackCount);
  NSIndexSet *routed = TracksWithEffects(stress);
  stress->chains[track] = EditedChain(stress->chains[track]);
  SendMix(stress, nil);
  if (stress->isPlaying && ![routed isEqualToIndexSet:TracksWithEffects(stress)]) {
    usleep((useconds_t)RandomBelow(kRestartDelayMs + 100) * 1000);
    Play(stress);
  }
}

/** A slider dragged: one value moving, a mix sent each frame. */
static void DragSlider(GPStress *stress)
{
  NSUInteger track = RandomBelow(stress->trackCount);
  NSArray *chain = stress->chains[track];
  if (chain.count == 0) {
    return;
  }
  NSUInteger at = RandomBelow(chain.count);
  NSDictionary *effect = chain[at];
  NSArray *ranges = ParamRanges()[effect[@"type"]];
  NSArray *range = ranges[RandomBelow(ranges.count)];
  for (int step = 0, steps = 1 + (int)RandomBelow(kMaxDragSteps); step < steps; step++) {
    NSMutableDictionary *params = [effect[@"params"] mutableCopy];
    params[range[0]] = @(RandomIn(range));
    NSMutableArray *dragged = [chain mutableCopy];
    dragged[at] = @{@"type" : effect[@"type"], @"isEnabled" : effect[@"isEnabled"], @"params" : params};
    stress->chains[track] = dragged;
    SendMix(stress, nil);
    usleep(kFrameMicroseconds);
  }
}

static void EditMaster(GPStress *stress)
{
  NSMutableArray *effects = [NSMutableArray array];
  for (NSString *type in @[ @"eq", @"compressor", @"reverb", @"limiter" ]) {
    [effects addObject:@{@"type" : type, @"isEnabled" : @(RandomBelow(2) == 0), @"params" : RandomParams(type)}];
  }
  SendMix(stress, @{@"effects" : effects, @"gainDb" : @(RandomIn(@[ @"gainDb", @-24, @12 ]))});
}

/** A key hovered with Preview on hover: any track, channel and program (drum kits and programs the bank lacks too). */
static void Preview(GPStress *stress)
{
  GPMidiEngine *engine = stress->engine;
  NSURL *bankURL = stress->bankURL;
  NSInteger track = (NSInteger)RandomBelow(stress->trackCount);
  UInt8 key = (UInt8)(40 + RandomBelow(40)), channel = (UInt8)RandomBelow(16), program = (UInt8)RandomBelow(128);
  dispatch_async(stress->queue, ^{
    [engine playNote:key velocity:100 program:program onChannel:channel trackIndex:track forSeconds:kPreviewSeconds bankURL:bankURL error:nil];
  });
}

/** A track's instrument, volume or pan changed while it plays. */
static void LiveChange(GPStress *stress)
{
  GPMidiEngine *engine = stress->engine;
  UInt8 channel = (UInt8)RandomBelow(16), value = (UInt8)RandomBelow(128);
  BOOL isProgram = RandomBelow(2) == 0;
  UInt8 controller = RandomBelow(2) == 0 ? 7 : 10;
  dispatch_async(stress->queue, ^{
    if (isProgram) {
      [engine setProgram:value onChannel:channel];
    } else {
      [engine setController:controller value:value onChannel:channel];
    }
  });
}

static void Poll(GPStress *stress)
{
  GPMidiEngine *engine = stress->engine;
  dispatch_async(stress->queue, ^{
    (void)engine.positionSeconds;
    (void)engine.isPlaying;
  });
}

static void Step(GPStress *stress)
{
  NSUInteger roll = RandomBelow(100);
  if (roll < 30) {
    EditChain(stress);
  } else if (roll < 42) {
    DragSlider(stress);
  } else if (roll < 48) {
    EditMaster(stress);
  } else if (roll < 62) {
    stress->isPlaying && RandomBelow(2) == 0 ? Stop(stress) : Play(stress);
  } else if (roll < 74) {
    Preview(stress);
  } else if (roll < 82) {
    LiveChange(stress);
  } else {
    Poll(stress);
  }
}

void RunEngineStress(NSURL *bankURL, NSData *song, int steps, unsigned seed)
{
  srandom(seed);
  const uint8_t *bytes = song.bytes;
  NSUInteger trackCount = song.length > 12 ? MAX(1, (NSUInteger)((bytes[10] << 8) | bytes[11]) - 1) : 1;
  dispatch_queue_t queue = dispatch_queue_create("audio-check.engine-stress", DISPATCH_QUEUE_SERIAL);
  GPMidiEngine *engine = [[GPMidiEngine alloc] initWithQueue:queue];
  NSMutableArray<NSArray *> *chains = [NSMutableArray array];
  for (NSUInteger index = 0; index < trackCount; index++) {
    [chains addObject:@[]];
  }
  GPStress stress = {engine, queue, bankURL, song, chains, trackCount, NO};
  for (int step = 0; step < steps; step++) {
    Step(&stress);
    usleep((useconds_t)RandomBelow(kMaxWaitMs + 1) * 1000);
  }
  dispatch_sync(queue, ^{
    [engine stop];
  });
}
