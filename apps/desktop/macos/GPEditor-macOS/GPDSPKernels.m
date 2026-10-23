#import "GPDSPKernels.h"

#import <Foundation/Foundation.h>
#import <math.h>
#import <stdatomic.h>
#import <stdlib.h>
#import <string.h>

#import "GPCabinetImpulses.h"
#import "GPConvolver.h"

/** Longest chorus delay: the 30 ms base plus 8 ms depth, and room for interpolation. */
static const double kChorusMaxSeconds = 0.05;
/** The drive's high-pass before the shaper (tightens the lows) and its DC blocker after it. */
static const double kDriveHighPassHz = 90;
static const float kDcBlockPole = 0.995f;
/** Samples processed per pass of the cabinet (its scratch buffers' size). */
#define GP_CABINET_CHUNK 512

typedef struct {
  float highPassX, highPassY, dcX, dcY, low1, low2;
} GPDriveState;

typedef struct {
  float *line;
  int length;
} GPDelayLine;

struct GPDSPKernel {
  GPDSPKind kind;
  double sampleRate;
  int channels;
  _Atomic float params[GP_DSP_PARAM_COUNT];
  _Atomic bool isBypassed;
  /** Gain-like values follow their parameter from block to block, so a change does not click. */
  float smoothedGain;
  float smoothedLevel;
  GPDriveState drive[GP_DSP_MAX_CHANNELS];
  GPDelayLine delays[GP_DSP_MAX_CHANNELS];
  int writeIndex;
  double phase;
  /** Cabinet: a convolver per model and channel, all made up front; the dry signal delayed to match. */
  GPConvolver **convolvers;
  int modelCount;
  int activeModel;
  float dryDelay[GP_DSP_MAX_CHANNELS][GP_CONVOLVER_BLOCK];
  int dryIndex;
  float scratch[GP_DSP_MAX_CHANNELS][GP_CABINET_CHUNK];
};

static const float kDefaults[3][GP_DSP_PARAM_COUNT] = {
  {0.8f, 2.5f, 12.0f, 50.0f},  // chorus
  {0.0f, 18.0f, 50.0f, -12.0f}, // drive
  {0.0f, 100.0f, 0.0f, 0.0f},   // cabinet
};

static float DbToGain(float db)
{
  return powf(10.0f, db / 20.0f);
}

static bool CreateCabinet(GPDSPKernel *kernel)
{
  kernel->modelCount = (int)GPCabinetModelCount;
  kernel->convolvers = calloc((size_t)(kernel->modelCount * kernel->channels), sizeof(GPConvolver *));
  if (kernel->convolvers == NULL) {
    return false;
  }
  for (int model = 0; model < kernel->modelCount; model++) {
    NSData *impulse = GPCabinetImpulse(model, kernel->sampleRate);
    for (int channel = 0; channel < kernel->channels; channel++) {
      GPConvolver *convolver = GPConvolverCreate(impulse.bytes, impulse.length / sizeof(float));
      if (convolver == NULL) {
        return false;
      }
      kernel->convolvers[model * kernel->channels + channel] = convolver;
    }
  }
  return true;
}

GPDSPKernel *GPDSPKernelCreate(GPDSPKind kind, double sampleRate, int channelCount)
{
  GPDSPKernel *kernel = calloc(1, sizeof(GPDSPKernel));
  if (kernel == NULL) {
    return NULL;
  }
  kernel->kind = kind;
  kernel->sampleRate = sampleRate > 0 ? sampleRate : 44100;
  kernel->channels = channelCount == 1 ? 1 : 2;
  for (int index = 0; index < GP_DSP_PARAM_COUNT; index++) {
    atomic_store_explicit(&kernel->params[index], kDefaults[kind][index], memory_order_relaxed);
  }
  kernel->smoothedGain = -1;
  kernel->smoothedLevel = -1;
  bool isReady = true;
  if (kind == GPDSPKindChorus) {
    int length = (int)ceil(kChorusMaxSeconds * kernel->sampleRate) + 4;
    for (int channel = 0; channel < kernel->channels && isReady; channel++) {
      kernel->delays[channel] = (GPDelayLine){calloc((size_t)length, sizeof(float)), length};
      isReady = kernel->delays[channel].line != NULL;
    }
  } else if (kind == GPDSPKindCabinet) {
    isReady = CreateCabinet(kernel);
  }
  if (!isReady) {
    GPDSPKernelDestroy(kernel);
    return NULL;
  }
  return kernel;
}

void GPDSPKernelDestroy(GPDSPKernel *kernel)
{
  if (kernel == NULL) {
    return;
  }
  for (int channel = 0; channel < GP_DSP_MAX_CHANNELS; channel++) {
    free(kernel->delays[channel].line);
  }
  if (kernel->convolvers != NULL) {
    for (int index = 0; index < kernel->modelCount * kernel->channels; index++) {
      GPConvolverDestroy(kernel->convolvers[index]);
    }
    free(kernel->convolvers);
  }
  free(kernel);
}

void GPDSPKernelSetParam(GPDSPKernel *kernel, int index, float value)
{
  if (kernel != NULL && index >= 0 && index < GP_DSP_PARAM_COUNT && isfinite(value)) {
    atomic_store_explicit(&kernel->params[index], value, memory_order_relaxed);
  }
}

float GPDSPKernelParam(const GPDSPKernel *kernel, int index)
{
  return index >= 0 && index < GP_DSP_PARAM_COUNT ? atomic_load_explicit(&((GPDSPKernel *)kernel)->params[index], memory_order_relaxed) : 0;
}

void GPDSPKernelSetBypass(GPDSPKernel *kernel, bool isBypassed)
{
  if (kernel != NULL) {
    atomic_store_explicit(&kernel->isBypassed, isBypassed, memory_order_relaxed);
  }
}

/** Moves a smoothed value a step toward its target per block (a fresh kernel starts at the target). */
static float Smooth(float *current, float target)
{
  *current = *current < 0 ? target : *current + 0.3f * (target - *current);
  return *current;
}

// MARK: - Drive

static float Shape(int mode, float v)
{
  switch (mode) {
    case 1: // distortion: two soft stages, more compression and harmonics
      return 0.9f * tanhf(2.0f * tanhf(v));
    case 2: { // fuzz: rectified asymmetry into a hard clip
      float u = v + 0.4f * fabsf(v);
      return fminf(0.9f, fmaxf(-0.6f, u)) / 0.9f;
    }
    default: // overdrive: asymmetric soft clip
      return tanhf(v + 0.15f) - tanhf(0.15f);
  }
}

static void ProcessDrive(GPDSPKernel *kernel, float *const *input, float *const *output, int frames)
{
  int mode = (int)lroundf(GPDSPKernelParam(kernel, 0));
  float gain = Smooth(&kernel->smoothedGain, DbToGain(GPDSPKernelParam(kernel, 1)));
  float tone = fminf(100, fmaxf(0, GPDSPKernelParam(kernel, 2))) / 100.0f;
  float level = Smooth(&kernel->smoothedLevel, DbToGain(GPDSPKernelParam(kernel, 3)));
  double rate = kernel->sampleRate;
  float highPass = (float)(1.0 / (1.0 + 2 * M_PI * kDriveHighPassHz / rate));
  double cutoff = MIN(1000.0 * pow(10.0, tone * 1.2), rate * 0.45);
  float lowPass = (float)(1.0 - exp(-2 * M_PI * cutoff / rate));
  for (int channel = 0; channel < kernel->channels; channel++) {
    GPDriveState *s = &kernel->drive[channel];
    for (int i = 0; i < frames; i++) {
      float x = input[channel][i];
      s->highPassY = highPass * (s->highPassY + x - s->highPassX);
      s->highPassX = x;
      float shaped = Shape(mode, s->highPassY * gain);
      s->dcY = shaped - s->dcX + kDcBlockPole * s->dcY;
      s->dcX = shaped;
      s->low1 += lowPass * (s->dcY - s->low1);
      s->low2 += lowPass * (s->low1 - s->low2);
      output[channel][i] = s->low2 * level;
    }
  }
}

// MARK: - Chorus

static void ProcessChorus(GPDSPKernel *kernel, float *const *input, float *const *output, int frames)
{
  double rate = kernel->sampleRate;
  double lfoStep = 2 * M_PI * fmax(0.01, GPDSPKernelParam(kernel, 0)) / rate;
  double depth = fmax(0, GPDSPKernelParam(kernel, 1)) * rate / 1000;
  double base = fmax(1, GPDSPKernelParam(kernel, 2)) * rate / 1000;
  float mix = fminf(100, fmaxf(0, GPDSPKernelParam(kernel, 3))) / 100.0f;
  int length = kernel->delays[0].length;
  int startIndex = kernel->writeIndex;
  double startPhase = kernel->phase;
  for (int channel = 0; channel < kernel->channels; channel++) {
    float *line = kernel->delays[channel].line;
    int write = startIndex;
    double phase = startPhase + channel * M_PI_2; // the right channel a quarter turn later: width
    for (int i = 0; i < frames; i++) {
      float dry = input[channel][i];
      line[write] = dry;
      double delay = fmin(base + depth * 0.5 * (1 + sin(phase)), length - 2);
      double read = write - delay;
      read += read < 0 ? length : 0;
      int whole = (int)read;
      float fraction = (float)(read - whole);
      float wet = line[whole] + fraction * (line[(whole + 1) % length] - line[whole]);
      output[channel][i] = dry * (1 - mix) + wet * mix;
      write = (write + 1) % length;
      phase += lfoStep;
    }
  }
  kernel->writeIndex = (startIndex + frames) % length;
  kernel->phase = fmod(startPhase + lfoStep * frames, 2 * M_PI);
}

// MARK: - Cabinet

static void ProcessCabinetChunk(GPDSPKernel *kernel, int model, float *const *input, float *const *output, int offset, int frames)
{
  float mix = fminf(100, fmaxf(0, GPDSPKernelParam(kernel, 1))) / 100.0f;
  float level = Smooth(&kernel->smoothedLevel, DbToGain(GPDSPKernelParam(kernel, 2)));
  int dryIndex = kernel->dryIndex;
  for (int channel = 0; channel < kernel->channels; channel++) {
    float *dry = kernel->scratch[channel];
    memcpy(dry, input[channel] + offset, (size_t)frames * sizeof(float));
    float *out = output[channel] + offset;
    GPConvolverProcess(kernel->convolvers[model * kernel->channels + channel], dry, out, (size_t)frames);
    int index = dryIndex;
    for (int i = 0; i < frames; i++) {
      // The dry signal leaves as late as the convolution does, so a blend does not comb.
      float late = kernel->dryDelay[channel][index];
      kernel->dryDelay[channel][index] = dry[i];
      index = (index + 1) % GP_CONVOLVER_BLOCK;
      out[i] = (late * (1 - mix) + out[i] * mix) * level;
    }
  }
  kernel->dryIndex = (dryIndex + frames) % GP_CONVOLVER_BLOCK;
}

static void ProcessCabinet(GPDSPKernel *kernel, float *const *input, float *const *output, int frames)
{
  int model = (int)lroundf(GPDSPKernelParam(kernel, 0));
  model = model >= 0 && model < kernel->modelCount ? model : 0;
  if (model != kernel->activeModel) {
    for (int channel = 0; channel < kernel->channels; channel++) {
      GPConvolverReset(kernel->convolvers[model * kernel->channels + channel]);
    }
    kernel->activeModel = model;
  }
  for (int offset = 0; offset < frames; offset += GP_CABINET_CHUNK) {
    ProcessCabinetChunk(kernel, model, input, output, offset, MIN(GP_CABINET_CHUNK, frames - offset));
  }
}

void GPDSPKernelProcess(GPDSPKernel *kernel, float *const *input, float *const *output, int frames)
{
  if (atomic_load_explicit(&kernel->isBypassed, memory_order_relaxed)) {
    for (int channel = 0; channel < kernel->channels; channel++) {
      if (output[channel] != input[channel]) {
        memcpy(output[channel], input[channel], (size_t)frames * sizeof(float));
      }
    }
    return;
  }
  switch (kernel->kind) {
    case GPDSPKindChorus:
      ProcessChorus(kernel, input, output, frames);
      break;
    case GPDSPKindDrive:
      ProcessDrive(kernel, input, output, frames);
      break;
    case GPDSPKindCabinet:
      ProcessCabinet(kernel, input, output, frames);
      break;
  }
}
