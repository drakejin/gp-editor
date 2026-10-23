// Convolution with an impulse response (the cabinet effect): uniformly partitioned, overlap-save, Accelerate's vDSP FFT.
// The signal comes out GP_CONVOLVER_BLOCK samples late (2.7 ms at 48 kHz). Create, reset and destroy off the audio
// thread; GPConvolverProcess allocates nothing and is safe on it.

#import <stddef.h>

#ifdef __cplusplus
extern "C" {
#endif

/** Samples per partition, and the delay the convolution adds. */
#define GP_CONVOLVER_BLOCK 128

typedef struct GPConvolver GPConvolver;

/** A convolver for `impulse` (`length` samples, copied); NULL when `length` is 0 or memory runs out. */
GPConvolver *GPConvolverCreate(const float *impulse, size_t length);

/** Convolves `frames` samples of `input` into `output` (they may be the same buffer). */
void GPConvolverProcess(GPConvolver *convolver, const float *input, float *output, size_t frames);

/** Forgets the signal heard so far (silence in, silence out), e.g. before a convolver is used again. */
void GPConvolverReset(GPConvolver *convolver);

void GPConvolverDestroy(GPConvolver *convolver);

#ifdef __cplusplus
}
#endif
