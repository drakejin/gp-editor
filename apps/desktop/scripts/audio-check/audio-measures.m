// The audio check's song and measures (audio-check.m runs the checks).

#import "audio-measures.h"

#import <Accelerate/Accelerate.h>
#import <mach/mach.h>

double Db(double ratio)
{
  return ratio > 0 ? 20 * log10(ratio) : -999;
}

// MARK: - A synthetic song: one clean electric guitar chord for a second, then three seconds of silence.

static void AppendVarLen(NSMutableData *data, uint32_t value)
{
  uint8_t bytes[4];
  int count = 0;
  do {
    bytes[count++] = value & 0x7F;
    value >>= 7;
  } while (value > 0);
  for (int index = count - 1; index >= 0; index--) {
    uint8_t byte = bytes[index] | (index > 0 ? 0x80 : 0);
    [data appendBytes:&byte length:1];
  }
}

static NSData *Track(NSArray<NSArray<NSNumber *> *> *events)
{
  NSMutableData *body = [NSMutableData data];
  uint32_t last = 0;
  for (NSArray<NSNumber *> *event in events) {
    AppendVarLen(body, event[0].unsignedIntValue - last);
    last = event[0].unsignedIntValue;
    for (NSUInteger index = 1; index < event.count; index++) {
      uint8_t byte = event[index].unsignedCharValue;
      [body appendBytes:&byte length:1];
    }
  }
  NSMutableData *track = [NSMutableData dataWithBytes:"MTrk" length:4];
  uint32_t length = CFSwapInt32HostToBig((uint32_t)body.length);
  [track appendBytes:&length length:4];
  [track appendData:body];
  return track;
}

NSData *ChordMidi(uint8_t program, NSArray<NSNumber *> *keys)
{
  const uint8_t header[] = {'M', 'T', 'h', 'd', 0, 0, 0, 6, 0, 1, 0, 2, 0x03, 0xC0}; // format 1, 2 tracks, 960 PPQ
  NSMutableData *midi = [NSMutableData dataWithBytes:header length:sizeof(header)];
  [midi appendData:Track(@[
    @[ @0, @0xFF, @0x51, @3, @0x07, @0xA1, @0x20 ], // 120 bpm
    @[ @0, @0xB0, @101, @0 ], @[ @0, @0xB0, @100, @0 ], @[ @0, @0xB0, @6, @12 ], @[ @0, @0xB0, @38, @0 ],
    @[ @7680, @0xFF, @0x2F, @0 ],
  ])];
  NSMutableArray<NSArray<NSNumber *> *> *events = [NSMutableArray arrayWithArray:@[ @[ @0, @0xB0, @7, @100 ], @[ @0, @0xC0, @(program) ] ]];
  for (NSNumber *key in keys) {
    [events addObject:@[ @0, @0x90, key, @110 ]];
  }
  for (NSNumber *key in keys) {
    [events addObject:@[ @1920, @0x80, key, @0 ]];
  }
  [events addObject:@[ @7680, @0xFF, @0x2F, @0 ]];
  [midi appendData:Track(events)];
  return midi;
}

// MARK: - Measures

/** Mean square of both channels over [from, to) seconds. */
double Power(AVAudioPCMBuffer *buffer, double from, double to)
{
  AVAudioFramePosition start = (AVAudioFramePosition)(from * kRate);
  AVAudioFramePosition end = MIN((AVAudioFramePosition)(to * kRate), (AVAudioFramePosition)buffer.frameLength);
  double sum = 0;
  for (int channel = 0; channel < 2 && end > start; channel++) {
    float meanSquare = 0;
    vDSP_measqv(buffer.floatChannelData[channel] + start, 1, &meanSquare, (vDSP_Length)(end - start));
    sum += meanSquare / 2;
  }
  return sum;
}

float Peak(AVAudioPCMBuffer *buffer)
{
  float peak = 0;
  for (int channel = 0; channel < 2; channel++) {
    float channelPeak = 0;
    vDSP_maxmgv(buffer.floatChannelData[channel], 1, &channelPeak, buffer.frameLength);
    peak = MAX(peak, channelPeak);
  }
  return peak;
}

/** Energy of the left channel in [low, high) Hz over the first second (one 32768-point FFT). */
double BandEnergy(AVAudioPCMBuffer *buffer, double low, double high)
{
  const int log2n = 15;
  const int n = 1 << log2n;
  static FFTSetup setup;
  if (setup == NULL) {
    setup = vDSP_create_fftsetup(log2n, FFT_RADIX2);
  }
  float *frame = calloc(n, sizeof(float)), *real = calloc(n / 2, sizeof(float)), *imag = calloc(n / 2, sizeof(float)), *magnitudes = calloc(n / 2, sizeof(float));
  memcpy(frame, buffer.floatChannelData[0], MIN((AVAudioFrameCount)n, buffer.frameLength) * sizeof(float));
  DSPSplitComplex split = {real, imag};
  vDSP_ctoz((DSPComplex *)frame, 2, &split, 1, n / 2);
  vDSP_fft_zrip(setup, &split, 1, log2n, FFT_FORWARD);
  vDSP_zvmags(&split, 1, magnitudes, 1, n / 2);
  double energy = 0;
  for (int bin = 1; bin < n / 2; bin++) {
    double frequency = bin * kRate / n;
    energy += frequency >= low && frequency < high ? magnitudes[bin] : 0;
  }
  free(frame), free(real), free(imag), free(magnitudes);
  return energy;
}

double DominantFrequency(AVAudioPCMBuffer *buffer, double from)
{
  const int log2n = 13;
  const int n = 1 << log2n;
  static FFTSetup setup;
  if (setup == NULL) {
    setup = vDSP_create_fftsetup(log2n, FFT_RADIX2);
  }
  AVAudioFramePosition start = (AVAudioFramePosition)(from * kRate);
  if (start + n > (AVAudioFramePosition)buffer.frameLength) {
    return 0;
  }
  float *frame = calloc(n, sizeof(float)), *window = calloc(n, sizeof(float)), *real = calloc(n / 2, sizeof(float)), *imag = calloc(n / 2, sizeof(float)), *magnitudes = calloc(n / 2, sizeof(float));
  vDSP_hann_window(window, n, vDSP_HANN_NORM);
  vDSP_vmul(buffer.floatChannelData[0] + start, 1, window, 1, frame, 1, n);
  DSPSplitComplex split = {real, imag};
  vDSP_ctoz((DSPComplex *)frame, 2, &split, 1, n / 2);
  vDSP_fft_zrip(setup, &split, 1, log2n, FFT_FORWARD);
  vDSP_zvmags(&split, 1, magnitudes, 1, n / 2);
  float strongest = 0;
  vDSP_Length bin = 0;
  vDSP_maxvi(magnitudes + 1, 1, &strongest, &bin, n / 2 - 2);
  double frequency = strongest < 1e-9 ? 0 : (bin + 1) * kRate / n;
  free(frame), free(window), free(real), free(imag), free(magnitudes);
  return frequency;
}

/** Correlation of left and right over the first second: 1 for a centred mono sound. */
double Correlation(AVAudioPCMBuffer *buffer)
{
  vDSP_Length count = (vDSP_Length)MIN((AVAudioFrameCount)kRate, buffer.frameLength);
  float lr = 0, ll = 0, rr = 0;
  vDSP_dotpr(buffer.floatChannelData[0], 1, buffer.floatChannelData[1], 1, &lr, count);
  vDSP_svesq(buffer.floatChannelData[0], 1, &ll, count);
  vDSP_svesq(buffer.floatChannelData[1], 1, &rr, count);
  return ll > 0 && rr > 0 ? lr / sqrt((double)ll * rr) : 0;
}

double ResidentMegabytes(void)
{
  struct mach_task_basic_info info;
  mach_msg_type_number_t count = MACH_TASK_BASIC_INFO_COUNT;
  task_info(mach_task_self(), MACH_TASK_BASIC_INFO, (task_info_t)&info, &count);
  return info.resident_size / 1048576.0;
}
