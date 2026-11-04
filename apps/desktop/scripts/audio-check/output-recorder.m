// The restart check's recording of the engine's output: see output-recorder.h.

#import "output-recorder.h"

#import <Accelerate/Accelerate.h>
#import <mach/mach_time.h>
#import <os/lock.h>

/** Frames kept: some 87 s at 48 kHz, longer than a scenario of the check. */
static const uint64_t kRingFrames = 1 << 22;
/** Buffers whose host times are kept (a tap buffer is some 10–100 ms). */
static const uint64_t kRecordCount = 1 << 14;
static const AVAudioFrameCount kTapFrames = 1024;
static const useconds_t kPollMicroseconds = 5000;

/** One tapped buffer: its first frame in the recording, the host time it rendered at, its length. */
typedef struct {
  uint64_t frame;
  uint64_t hostTime;
  uint32_t count;
} GPTappedBuffer;

static double HostTicksPerSecond(void)
{
  static double ticks = 0;
  if (ticks == 0) {
    mach_timebase_info_data_t timebase;
    mach_timebase_info(&timebase);
    ticks = 1e9 * timebase.denom / timebase.numer;
  }
  return ticks;
}

uint64_t HostTimeAfter(uint64_t hostTime, double seconds)
{
  return hostTime + (uint64_t)llround(seconds * HostTicksPerSecond());
}

@implementation GPOutputRecorder {
  AVAudioMixerNode *_mixer;
  float *_ring;
  GPTappedBuffer *_buffers;
  /** Frames and buffers recorded so far (the ring keeps the last kRingFrames / kRecordCount). */
  uint64_t _written;
  uint64_t _bufferCount;
  os_unfair_lock _lock;
}

- (instancetype)initWithEngine:(AVAudioEngine *)engine
{
  if ((self = [super init])) {
    _mixer = engine.mainMixerNode;
    _sampleRate = [_mixer outputFormatForBus:0].sampleRate;
    _ring = calloc(kRingFrames, sizeof(float));
    _buffers = calloc(kRecordCount, sizeof(GPTappedBuffer));
    _lock = OS_UNFAIR_LOCK_INIT;
    __weak GPOutputRecorder *weakSelf = self;
    [_mixer installTapOnBus:0 bufferSize:kTapFrames format:nil block:^(AVAudioPCMBuffer *buffer, AVAudioTime *when) {
      [weakSelf append:buffer at:when];
    }];
  }
  return self;
}

- (void)dealloc
{
  free(_ring);
  free(_buffers);
}

- (void)detach
{
  [_mixer removeTapOnBus:0];
}

- (void)append:(AVAudioPCMBuffer *)buffer at:(AVAudioTime *)when
{
  if (!when.isHostTimeValid || buffer.floatChannelData == NULL) {
    return;
  }
  const float *left = buffer.floatChannelData[0];
  os_unfair_lock_lock(&_lock);
  _buffers[_bufferCount % kRecordCount] = (GPTappedBuffer){_written, when.hostTime, buffer.frameLength};
  _bufferCount += 1;
  for (AVAudioFrameCount frame = 0; frame < buffer.frameLength; frame++) {
    _ring[(_written + frame) % kRingFrames] = left[frame];
  }
  _written += buffer.frameLength;
  os_unfair_lock_unlock(&_lock);
}

/** Under the lock: the recording's frame rendered at `hostTime`, or the first one after it (a paused engine's gap). */
- (BOOL)frame:(uint64_t *)frame atHostTime:(uint64_t)hostTime
{
  uint64_t first = _bufferCount > kRecordCount ? _bufferCount - kRecordCount : 0;
  for (uint64_t index = first; index < _bufferCount; index++) {
    GPTappedBuffer buffer = _buffers[index % kRecordCount];
    if (hostTime < buffer.hostTime) {
      *frame = buffer.frame;
      return YES;
    }
    double offset = (double)(hostTime - buffer.hostTime) / HostTicksPerSecond() * _sampleRate;
    if (offset < buffer.count) {
      *frame = buffer.frame + (uint64_t)offset;
      return YES;
    }
  }
  return NO;
}

- (nullable NSData *)samplesFrom:(uint64_t)hostTime seconds:(double)seconds timeout:(double)timeout
{
  uint64_t count = (uint64_t)(seconds * _sampleRate);
  CFAbsoluteTime deadline = CFAbsoluteTimeGetCurrent() + timeout;
  while (YES) {
    NSMutableData *samples = nil;
    uint64_t start = 0;
    os_unfair_lock_lock(&_lock);
    BOOL isFound = [self frame:&start atHostTime:hostTime];
    BOOL isKept = isFound && start + kRingFrames >= _written;
    if (isKept && start + count <= _written) {
      samples = [NSMutableData dataWithLength:count * sizeof(float)];
      float *copy = samples.mutableBytes;
      for (uint64_t frame = 0; frame < count; frame++) {
        copy[frame] = _ring[(start + frame) % kRingFrames];
      }
    }
    os_unfair_lock_unlock(&_lock);
    if (samples != nil || (isFound && !isKept) || CFAbsoluteTimeGetCurrent() > deadline) {
      return samples;
    }
    usleep(kPollMicroseconds);
  }
}

@end

double BandLevelDb(NSData *samples, double sampleRate, double low, double high)
{
  vDSP_Length count = samples.length / sizeof(float);
  if (count < 2) {
    return -999;
  }
  vDSP_Length log2Size = (vDSP_Length)ceil(log2((double)count));
  vDSP_Length size = (vDSP_Length)1 << log2Size;
  FFTSetup setup = vDSP_create_fftsetup(log2Size, FFT_RADIX2);
  float *frame = calloc(size, sizeof(float)), *window = calloc(count, sizeof(float));
  float *real = calloc(size / 2, sizeof(float)), *imag = calloc(size / 2, sizeof(float)), *magnitudes = calloc(size / 2, sizeof(float));
  vDSP_hann_window(window, count, vDSP_HANN_NORM);
  vDSP_vmul(samples.bytes, 1, window, 1, frame, 1, count);
  float windowEnergy = 0;
  vDSP_svesq(window, 1, &windowEnergy, count);
  DSPSplitComplex split = {real, imag};
  vDSP_ctoz((DSPComplex *)frame, 2, &split, 1, size / 2);
  vDSP_fft_zrip(setup, &split, 1, log2Size, FFT_FORWARD);
  vDSP_zvmags(&split, 1, magnitudes, 1, size / 2);
  double sum = 0;
  for (vDSP_Length bin = 1; bin < size / 2; bin++) {
    double frequency = bin * sampleRate / size;
    sum += frequency >= low && frequency < high ? magnitudes[bin] : 0;
  }
  free(frame), free(window), free(real), free(imag), free(magnitudes);
  vDSP_destroy_fftsetup(setup);
  // vDSP's forward FFT is twice the DFT: a sine of amplitude A sums to A² · size · Σw² over its positive bins.
  double power = sum / ((double)size * windowEnergy);
  return power > 0 ? 10 * log10(power) : -999;
}
