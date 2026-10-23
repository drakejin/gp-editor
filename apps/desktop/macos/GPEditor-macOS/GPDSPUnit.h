// An in-process Audio Unit (AUAudioUnit subclass, registered with the process only) running one GPDSPKernels kernel,
// so chorus, drive and cabinet sit in an AVAudioEngine graph like Apple's own effects — in real time and in manual
// (offline) rendering alike. Parameters are plain setters, not an AUParameterTree: only this app drives them.

#import <AVFoundation/AVFoundation.h>

#import "GPDSPKernels.h"

NS_ASSUME_NONNULL_BEGIN

@interface GPDSPUnit : AUAudioUnit

/** A new effect node running `kind` (registers the units with the process the first time). */
+ (AVAudioUnitEffect *)effectNodeOfKind:(GPDSPKind)kind;

/** Sets parameter `index` (GPDSPKernels.h) now; kept for the next render resources too. */
- (void)setParam:(int)index value:(float)value;

@end

NS_ASSUME_NONNULL_END
