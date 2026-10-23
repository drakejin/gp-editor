// One effect of a chain as an AVAudioEngine node: gp-core's Effect ({ type, isEnabled, params }, EFFECT_PARAMS ids
// and units) → macOS's own units (AVAudioUnitEQ, the dynamics processor, AVAudioUnitDelay, AVAudioUnitReverb, the
// peak limiter) or ours (GPDSPUnit: drive, chorus, cabinet). Values are clamped again here: the JS side checked them,
// but a node is never set outside its range. An effect that is off is bypassed, so switching it costs nothing.

#import <AVFoundation/AVFoundation.h>

NS_ASSUME_NONNULL_BEGIN

@interface GPEffectNode : NSObject

@property (nonatomic, readonly, copy) NSString *type;
@property (nonatomic, readonly) AVAudioUnitEffect *node;

/** A node for the effect, its settings applied; nil for an unknown type. */
+ (nullable instancetype)nodeForEffect:(NSDictionary *)effect;

/** Applies the effect's on/off state and parameters (of this node's type) now, while it plays. */
- (void)applyEffect:(NSDictionary *)effect;

@end

NS_ASSUME_NONNULL_END
