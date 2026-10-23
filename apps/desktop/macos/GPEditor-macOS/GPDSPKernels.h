// The DSP of the effects macOS has no unit for: chorus (a modulated delay), drive (a waveshaper between a tightening
// high-pass and a tone low-pass) and cabinet (convolution with GPCabinetImpulses). Plain C, so GPDSPUnit's render block
// calls it without Objective-C messaging. Create and destroy off the audio thread; parameters and bypass may be set from
// any thread (relaxed atomics); GPDSPKernelProcess allocates nothing.

#import <stdbool.h>

#ifdef __cplusplus
extern "C" {
#endif

typedef enum { GPDSPKindChorus = 0, GPDSPKindDrive = 1, GPDSPKindCabinet = 2 } GPDSPKind;

/** Parameters a kernel has, in the units gp-core's EFFECT_PARAMS uses, by index:
 * chorus: 0 rate Hz, 1 depth ms, 2 delay ms, 3 mix %;
 * drive: 0 mode (0 overdrive, 1 distortion, 2 fuzz), 1 gain dB, 2 tone %, 3 level dB;
 * cabinet: 0 model (GPCabinetImpulse), 1 mix %, 2 level dB. */
#define GP_DSP_PARAM_COUNT 4
#define GP_DSP_MAX_CHANNELS 2

typedef struct GPDSPKernel GPDSPKernel;

/** A kernel for 1 or 2 channels at `sampleRate`, parameters at their defaults; NULL when memory runs out. */
GPDSPKernel *GPDSPKernelCreate(GPDSPKind kind, double sampleRate, int channelCount);
void GPDSPKernelDestroy(GPDSPKernel *kernel);

void GPDSPKernelSetParam(GPDSPKernel *kernel, int index, float value);
float GPDSPKernelParam(const GPDSPKernel *kernel, int index);
void GPDSPKernelSetBypass(GPDSPKernel *kernel, bool isBypassed);

/** Processes `frames` samples of each channel; `output` may be `input`. */
void GPDSPKernelProcess(GPDSPKernel *kernel, float *const *input, float *const *output, int frames);

#ifdef __cplusplus
}
#endif
