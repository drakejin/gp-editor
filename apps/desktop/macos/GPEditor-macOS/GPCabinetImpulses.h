// Speaker cabinet impulse responses the cabinet effect convolves with, generated here rather than recorded (so they
// are ours to ship): an impulse and a short decaying noise burst (seeded, so every run makes the same response) shaped
// by a cascade of biquad filters modelling the speaker's tonal curve — low cut, cabinet thump, cone resonances, and the
// steep roll-off above 5 kHz that makes a guitar speaker sound like one. Each response is scaled to unit energy.
// The models follow gp-core's CABINET_MODELS: 0 1x12 open back, 1 2x12 combo, 2 4x12 closed back, 3 4x10 bass.

#import <Foundation/Foundation.h>

NS_ASSUME_NONNULL_BEGIN

/** How many cabinet models there are. */
FOUNDATION_EXPORT const NSInteger GPCabinetModelCount;

/** The model's impulse response at `sampleRate`, as float samples (about 40 ms); model outside 0…count−1 → model 0. */
NSData *GPCabinetImpulse(NSInteger model, double sampleRate);

NS_ASSUME_NONNULL_END
