#import "GPConvolver.h"

#import <Accelerate/Accelerate.h>
#import <stdlib.h>
#import <string.h>

/** FFT size: two partitions, so each block's linear convolution with one partition fits (overlap-save). */
#define GP_FFT_SIZE (2 * GP_CONVOLVER_BLOCK)
#define GP_FFT_LOG2 8
#define GP_HALF (GP_FFT_SIZE / 2)

/** One spectrum in vDSP's packed real format: realp[0] is DC, imagp[0] the Nyquist bin. */
typedef struct {
  float *realp;
  float *imagp;
} GPSpectrum;

struct GPConvolver {
  FFTSetup setup;
  size_t partitions;
  /** The impulse response's partitions, transformed. */
  GPSpectrum *filters;
  /** The last `partitions` input blocks, transformed; `head` is the newest. */
  GPSpectrum *history;
  size_t head;
  /** The previous block and the one being filled: the FFT's input window. */
  float window[GP_FFT_SIZE];
  size_t filled;
  /** The block computed last, played while the next one fills. */
  float ready[GP_CONVOLVER_BLOCK];
  float time[GP_FFT_SIZE];
  float accumulatorReal[GP_HALF];
  float accumulatorImag[GP_HALF];
  /** All spectra in one allocation. */
  float *storage;
};

static void Transform(GPConvolver *convolver, const float *time, GPSpectrum spectrum)
{
  DSPSplitComplex split = {spectrum.realp, spectrum.imagp};
  vDSP_ctoz((const DSPComplex *)time, 2, &split, 1, GP_HALF);
  vDSP_fft_zrip(convolver->setup, &split, 1, GP_FFT_LOG2, FFT_FORWARD);
}

static BOOL AllocateSpectra(GPConvolver *convolver)
{
  size_t count = 2 * convolver->partitions;
  convolver->storage = calloc(count * GP_FFT_SIZE, sizeof(float));
  convolver->filters = calloc(convolver->partitions, sizeof(GPSpectrum));
  convolver->history = calloc(convolver->partitions, sizeof(GPSpectrum));
  if (convolver->storage == NULL || convolver->filters == NULL || convolver->history == NULL) {
    return NO;
  }
  for (size_t index = 0; index < count; index++) {
    float *base = convolver->storage + index * GP_FFT_SIZE;
    GPSpectrum spectrum = {base, base + GP_HALF};
    if (index < convolver->partitions) {
      convolver->filters[index] = spectrum;
    } else {
      convolver->history[index - convolver->partitions] = spectrum;
    }
  }
  return YES;
}

GPConvolver *GPConvolverCreate(const float *impulse, size_t length)
{
  if (impulse == NULL || length == 0) {
    return NULL;
  }
  GPConvolver *convolver = calloc(1, sizeof(GPConvolver));
  if (convolver == NULL) {
    return NULL;
  }
  convolver->partitions = (length + GP_CONVOLVER_BLOCK - 1) / GP_CONVOLVER_BLOCK;
  convolver->setup = vDSP_create_fftsetup(GP_FFT_LOG2, FFT_RADIX2);
  if (convolver->setup == NULL || !AllocateSpectra(convolver)) {
    GPConvolverDestroy(convolver);
    return NULL;
  }
  // Each partition, zero-padded to the FFT size, as the filter it is for one block.
  float padded[GP_FFT_SIZE];
  for (size_t partition = 0; partition < convolver->partitions; partition++) {
    memset(padded, 0, sizeof(padded));
    size_t start = partition * GP_CONVOLVER_BLOCK;
    size_t count = MIN((size_t)GP_CONVOLVER_BLOCK, length - start);
    memcpy(padded, impulse + start, count * sizeof(float));
    Transform(convolver, padded, convolver->filters[partition]);
  }
  return convolver;
}

/** Y = Σ X[k−p]·H[p]: complex products, with the packed DC and Nyquist bins (real values) multiplied apart. */
static void Accumulate(GPConvolver *convolver)
{
  DSPSplitComplex sum = {convolver->accumulatorReal, convolver->accumulatorImag};
  memset(convolver->accumulatorReal, 0, sizeof(convolver->accumulatorReal));
  memset(convolver->accumulatorImag, 0, sizeof(convolver->accumulatorImag));
  float dc = 0;
  float nyquist = 0;
  for (size_t partition = 0; partition < convolver->partitions; partition++) {
    GPSpectrum input = convolver->history[(convolver->head + convolver->partitions - partition) % convolver->partitions];
    GPSpectrum filter = convolver->filters[partition];
    dc += input.realp[0] * filter.realp[0];
    nyquist += input.imagp[0] * filter.imagp[0];
    DSPSplitComplex a = {input.realp, input.imagp};
    DSPSplitComplex b = {filter.realp, filter.imagp};
    vDSP_zvma(&a, 1, &b, 1, &sum, 1, &sum, 1, GP_HALF);
  }
  convolver->accumulatorReal[0] = dc;
  convolver->accumulatorImag[0] = nyquist;
}

/** One full block: transform the window, sum the partitions' products, keep the valid (second) half. */
static void ProcessBlock(GPConvolver *convolver)
{
  convolver->head = (convolver->head + 1) % convolver->partitions;
  Transform(convolver, convolver->window, convolver->history[convolver->head]);
  Accumulate(convolver);
  DSPSplitComplex sum = {convolver->accumulatorReal, convolver->accumulatorImag};
  vDSP_fft_zrip(convolver->setup, &sum, 1, GP_FFT_LOG2, FFT_INVERSE);
  vDSP_ztoc(&sum, 1, (DSPComplex *)convolver->time, 2, GP_HALF);
  // vDSP's forward transforms scale by 2 each and the inverse by N: 4N in all.
  float scale = 1.0f / (4.0f * GP_FFT_SIZE);
  vDSP_vsmul(convolver->time + GP_CONVOLVER_BLOCK, 1, &scale, convolver->ready, 1, GP_CONVOLVER_BLOCK);
  memmove(convolver->window, convolver->window + GP_CONVOLVER_BLOCK, GP_CONVOLVER_BLOCK * sizeof(float));
}

void GPConvolverProcess(GPConvolver *convolver, const float *input, float *output, size_t frames)
{
  size_t done = 0;
  while (done < frames) {
    size_t count = MIN(frames - done, (size_t)GP_CONVOLVER_BLOCK - convolver->filled);
    memcpy(convolver->window + GP_CONVOLVER_BLOCK + convolver->filled, input + done, count * sizeof(float));
    memcpy(output + done, convolver->ready + convolver->filled, count * sizeof(float));
    convolver->filled += count;
    done += count;
    if (convolver->filled == GP_CONVOLVER_BLOCK) {
      convolver->filled = 0;
      ProcessBlock(convolver);
    }
  }
}

void GPConvolverReset(GPConvolver *convolver)
{
  if (convolver == NULL) {
    return;
  }
  memset(convolver->window, 0, sizeof(convolver->window));
  memset(convolver->ready, 0, sizeof(convolver->ready));
  convolver->filled = 0;
  for (size_t partition = 0; partition < convolver->partitions; partition++) {
    memset(convolver->history[partition].realp, 0, GP_FFT_SIZE * sizeof(float));
  }
}

void GPConvolverDestroy(GPConvolver *convolver)
{
  if (convolver == NULL) {
    return;
  }
  if (convolver->setup != NULL) {
    vDSP_destroy_fftsetup(convolver->setup);
  }
  free(convolver->storage);
  free(convolver->filters);
  free(convolver->history);
  free(convolver);
}
