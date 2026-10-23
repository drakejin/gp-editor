#import "GPCabinetImpulses.h"

#import <Accelerate/Accelerate.h>

typedef NS_ENUM(NSInteger, GPBiquadKind) { GPBiquadHighPass, GPBiquadLowPass, GPBiquadPeak };

typedef struct {
  GPBiquadKind kind;
  double frequency;
  double q;
  double gainDb;
} GPBiquadSpec;

/** Most filters one model uses (the arrays below end early with a zero frequency). */
#define GP_MAX_FILTERS 8

typedef struct {
  GPBiquadSpec filters[GP_MAX_FILTERS];
} GPCabinetModel;

/** Tonal curves in the shape of published speaker frequency responses; the numbers are ours, not measured from any. */
static const GPCabinetModel kModels[] = {
  // 1x12 open back: loose lows, a 2.5 kHz presence peak, rolled off from 5.5 kHz.
  {{{GPBiquadHighPass, 70, 0.7, 0},
    {GPBiquadPeak, 110, 1.2, 4},
    {GPBiquadPeak, 400, 1.0, -2},
    {GPBiquadPeak, 2500, 1.5, 5},
    {GPBiquadLowPass, 5500, 0.9, 0},
    {GPBiquadLowPass, 7000, 0.6, 0}}},
  // 2x12 combo: a little more low end, two upper-mid peaks.
  {{{GPBiquadHighPass, 75, 0.7, 0},
    {GPBiquadPeak, 120, 1.0, 3},
    {GPBiquadPeak, 1600, 1.0, 3},
    {GPBiquadPeak, 3200, 2.0, 4},
    {GPBiquadLowPass, 5000, 0.9, 0},
    {GPBiquadLowPass, 6500, 0.6, 0}}},
  // 4x12 closed back: tight thump at 95 Hz, scooped low mids, strong upper mids, an early steep roll-off.
  {{{GPBiquadHighPass, 60, 0.8, 0},
    {GPBiquadPeak, 95, 1.4, 6},
    {GPBiquadPeak, 500, 0.8, -4},
    {GPBiquadPeak, 2200, 1.6, 6},
    {GPBiquadPeak, 3800, 3.0, 3},
    {GPBiquadLowPass, 4800, 1.0, 0},
    {GPBiquadLowPass, 6000, 0.7, 0}}},
  // 4x10 bass: deep lows, a mid bump, little above 4 kHz.
  {{{GPBiquadHighPass, 40, 0.7, 0},
    {GPBiquadPeak, 80, 1.0, 3},
    {GPBiquadPeak, 800, 1.0, 2},
    {GPBiquadPeak, 3000, 1.5, 2},
    {GPBiquadLowPass, 4000, 0.8, 0},
    {GPBiquadLowPass, 6000, 0.6, 0}}},
};

const NSInteger GPCabinetModelCount = sizeof(kModels) / sizeof(kModels[0]);

static const double kLengthSeconds = 0.04;
/** The noise burst: its level against the impulse, and how fast it dies away. */
static const double kNoiseLevel = 0.15;
static const double kNoiseDecaySeconds = 0.002;
/** The last fifth of the response fades out, so its end does not click. */
static const double kFadeFraction = 0.2;

/** RBJ audio EQ cookbook coefficients: b0 b1 b2 a1 a2, normalised by a0. */
static void BiquadCoefficients(GPBiquadSpec spec, double sampleRate, double c[5])
{
  double w0 = 2 * M_PI * MIN(spec.frequency, sampleRate * 0.45) / sampleRate;
  double alpha = sin(w0) / (2 * spec.q);
  double cosw = cos(w0);
  double a = pow(10, spec.gainDb / 40);
  double b0, b1, b2, a0, a1, a2;
  switch (spec.kind) {
    case GPBiquadHighPass:
      b0 = (1 + cosw) / 2, b1 = -(1 + cosw), b2 = (1 + cosw) / 2, a0 = 1 + alpha, a1 = -2 * cosw, a2 = 1 - alpha;
      break;
    case GPBiquadLowPass:
      b0 = (1 - cosw) / 2, b1 = 1 - cosw, b2 = (1 - cosw) / 2, a0 = 1 + alpha, a1 = -2 * cosw, a2 = 1 - alpha;
      break;
    case GPBiquadPeak:
      b0 = 1 + alpha * a, b1 = -2 * cosw, b2 = 1 - alpha * a, a0 = 1 + alpha / a, a1 = -2 * cosw, a2 = 1 - alpha / a;
      break;
  }
  c[0] = b0 / a0, c[1] = b1 / a0, c[2] = b2 / a0, c[3] = a1 / a0, c[4] = a2 / a0;
}

/** Runs the samples through one biquad, in place (direct form I). */
static void ApplyBiquad(double *samples, NSUInteger count, const double c[5])
{
  double x1 = 0, x2 = 0, y1 = 0, y2 = 0;
  for (NSUInteger i = 0; i < count; i++) {
    double x = samples[i];
    double y = c[0] * x + c[1] * x1 + c[2] * x2 - c[3] * y1 - c[4] * y2;
    x2 = x1, x1 = x, y2 = y1, y1 = y;
    samples[i] = y;
  }
}

/** The excitation: a unit impulse and a decaying burst of noise from a fixed-seed generator. */
static void Excitation(double *samples, NSUInteger count, double sampleRate, NSInteger model)
{
  uint32_t seed = 0x9E3779B9u ^ (uint32_t)(model + 1);
  for (NSUInteger i = 0; i < count; i++) {
    seed = seed * 1664525u + 1013904223u;
    double noise = ((double)(seed >> 8) / (double)(1u << 24)) * 2 - 1;
    samples[i] = (i == 0 ? 1.0 : 0.0) + kNoiseLevel * noise * exp(-(double)i / (kNoiseDecaySeconds * sampleRate));
  }
}

NSData *GPCabinetImpulse(NSInteger model, double sampleRate)
{
  NSInteger index = model >= 0 && model < GPCabinetModelCount ? model : 0;
  NSUInteger count = (NSUInteger)ceil(kLengthSeconds * sampleRate);
  double *samples = calloc(count, sizeof(double));
  Excitation(samples, count, sampleRate, index);
  for (NSUInteger f = 0; f < GP_MAX_FILTERS && kModels[index].filters[f].frequency > 0; f++) {
    double c[5];
    BiquadCoefficients(kModels[index].filters[f], sampleRate, c);
    ApplyBiquad(samples, count, c);
  }
  NSUInteger fadeStart = (NSUInteger)((1 - kFadeFraction) * count);
  for (NSUInteger i = fadeStart; i < count; i++) {
    samples[i] *= 0.5 * (1 + cos(M_PI * (double)(i - fadeStart) / (double)(count - fadeStart)));
  }
  double energy = 0;
  vDSP_svesqD(samples, 1, &energy, count);
  double scale = energy > 0 ? 1 / sqrt(energy) : 0;
  NSMutableData *data = [NSMutableData dataWithLength:count * sizeof(float)];
  float *out = data.mutableBytes;
  for (NSUInteger i = 0; i < count; i++) {
    out[i] = (float)(samples[i] * scale);
  }
  free(samples);
  return data;
}
