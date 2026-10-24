// Microphone capture for the tuner (Tools ▸ Tuner…), the native half of TuxGuitar's TGTuner data line: a tap on the
// input node of an AVAudioEngine of its own, mixed to mono, low-passed and decimated to about 6 kHz (vDSP_desamp), and
// the last 2048 samples — a third of a second — sent to JS every 512 new samples (about 12 times a second) as an
// "audioFrame" event: { sampleRate, samples: little-endian 16-bit PCM in base64 }. JS finds the pitch (gp-core's
// detectPitch). Microphone access is asked for on the first start; refused, start rejects with code "denied".
// Capture stops on -stop, when the module goes away, and when the app quits (GPAudioInputStopForQuit, called by
// AppDelegate before it lets the app quit). Tools ▸ Tuner… arrives as GPEditorTunerCommandNotification and goes to JS as
// "tunerRequested".
// QA: outside the App Sandbox, GPEDITOR_QA_TUNER_HZ=<Hz> replaces the microphone with a synthetic plucked tone at 48 kHz
// fed through the same decimation, so the QA driver can show the tuner without a microphone or a permission prompt.

#import <Accelerate/Accelerate.h>
#import <AVFoundation/AVFoundation.h>
#import <React/RCTBridgeModule.h>
#import <React/RCTEventEmitter.h>

#import "GPAudioInput.h"
#import "GPEditorNotifications.h"
#import "GPSandbox.h"
#import "GPAppStrings.h"

static NSString *const kTunerRequestedEvent = @"tunerRequested";
static NSString *const kAudioFrameEvent = @"audioFrame";
static NSString *const kQAToneVariable = @"GPEDITOR_QA_TUNER_HZ";

/** About 6 kHz after decimation: Nyquist stays over the tuner's search range (up to 2 kHz, gp-core's detectPitch). */
static const double kTargetRate = 6000;
/** The highest frequency the tuner looks for; what aliases below it must be filtered out first. */
static const double kHighestToneHz = 2000;
/** Samples per frame (after decimation) and new samples between frames. */
static const NSUInteger kFrameLength = 2048;
static const NSUInteger kHopLength = 512;
/** Input samples per tap buffer (about 85 ms at 48 kHz). */
static const AVAudioFrameCount kTapBufferSize = 4096;
static const double kQAToneRate = 48000;

@interface GPAudioInput : RCTEventEmitter <RCTBridgeModule>
/** Stops capture now; YES when it was running. */
- (BOOL)stopForQuit;
@end

/** The module JS is using (one per bridge), for GPAudioInputStopForQuit. */
static __weak GPAudioInput *liveInput;

BOOL GPAudioInputStopForQuit(void)
{
  return [liveInput stopForQuit];
}

@implementation GPAudioInput {
  dispatch_queue_t _queue;
  BOOL _hasListeners;
  /** Bumped by every start and stop: work queued for an older capture is dropped. */
  NSUInteger _session;
  AVAudioEngine *_engine;
  dispatch_source_t _qaTimer;
  double _qaPhase;
  // Decimation: input samples not yet used, the low-pass filter, the decimation factor and the rate after it.
  NSMutableData *_pending;
  NSData *_filter;
  NSUInteger _factor;
  double _outputRate;
  // The frame: the last kFrameLength decimated samples, how many are filled and how many came since the last frame.
  NSMutableData *_frame;
  NSUInteger _filled;
  NSUInteger _sinceLastFrame;
}

RCT_EXPORT_MODULE();

+ (BOOL)requiresMainQueueSetup
{
  return NO;
}

- (instancetype)init
{
  if ((self = [super init])) {
    _queue = dispatch_queue_create("com.drakejin.gpeditor.audio-input", DISPATCH_QUEUE_SERIAL);
    _pending = [NSMutableData data];
    _frame = [NSMutableData dataWithLength:kFrameLength * sizeof(float)];
    [[NSNotificationCenter defaultCenter] addObserver:self selector:@selector(onTunerCommand:) name:GPEditorTunerCommandNotification object:nil];
    liveInput = self;
  }
  return self;
}

- (void)dealloc
{
  [[NSNotificationCenter defaultCenter] removeObserver:self];
  [self stopCapture];
}

- (dispatch_queue_t)methodQueue
{
  return _queue;
}

- (NSArray<NSString *> *)supportedEvents
{
  return @[ kTunerRequestedEvent, kAudioFrameEvent ];
}

- (void)startObserving
{
  _hasListeners = YES;
}

- (void)stopObserving
{
  _hasListeners = NO;
}

- (void)onTunerCommand:(NSNotification *)note
{
  if (_hasListeners) {
    [self sendEventWithName:kTunerRequestedEvent body:@{}];
  }
}

- (BOOL)stopForQuit
{
  __block BOOL wasRunning = NO;
  dispatch_sync(_queue, ^{
    wasRunning = self->_engine != nil || self->_qaTimer != nil;
    [self stopCapture];
  });
  return wasRunning;
}

#pragma mark - Start and stop

RCT_EXPORT_METHOD(start : (RCTPromiseResolveBlock)resolve reject : (RCTPromiseRejectBlock)reject)
{
  [self stopCapture];
  double qaToneHz = [self qaToneHz];
  if (qaToneHz > 0) {
    [self startQAToneAt:qaToneHz];
    resolve(nil);
    return;
  }
  switch ([AVCaptureDevice authorizationStatusForMediaType:AVMediaTypeAudio]) {
    case AVAuthorizationStatusAuthorized:
      [self startEngineResolve:resolve reject:reject];
      break;
    case AVAuthorizationStatusNotDetermined:
      [self askForMicrophoneResolve:resolve reject:reject];
      break;
    default:
      reject(@"denied", GPLocalizedString(@"Microphone access is off."), nil);
      break;
  }
}

RCT_EXPORT_METHOD(stop : (RCTPromiseResolveBlock)resolve reject : (RCTPromiseRejectBlock)reject)
{
  [self stopCapture];
  resolve(nil);
}

/** The first start: macOS asks the user; the answer comes on another queue, maybe after the panel was closed. */
- (void)askForMicrophoneResolve:(RCTPromiseResolveBlock)resolve reject:(RCTPromiseRejectBlock)reject
{
  NSUInteger session = _session;
  [AVCaptureDevice requestAccessForMediaType:AVMediaTypeAudio
                           completionHandler:^(BOOL granted) {
                             dispatch_async(self->_queue, ^{
                               if (!granted) {
                                 reject(@"denied", GPLocalizedString(@"Microphone access is off."), nil);
                               } else if (self->_session != session) {
                                 reject(@"stopped", GPLocalizedString(@"The tuner was closed."), nil);
                               } else {
                                 [self startEngineResolve:resolve reject:reject];
                               }
                             });
                           }];
}

- (void)startEngineResolve:(RCTPromiseResolveBlock)resolve reject:(RCTPromiseRejectBlock)reject
{
  AVAudioEngine *engine = [AVAudioEngine new];
  AVAudioInputNode *input = engine.inputNode;
  AVAudioFormat *format = [input outputFormatForBus:0];
  if (format.sampleRate <= 0 || format.channelCount == 0) {
    reject(@"no_input", GPLocalizedString(@"No microphone was found."), nil);
    return;
  }
  [self prepareDecimatorForRate:format.sampleRate];
  NSUInteger session = _session;
  __weak GPAudioInput *weakSelf = self;
  NSError *error = nil;
  @try {
    [input installTapOnBus:0
                bufferSize:kTapBufferSize
                    format:format
                     block:^(AVAudioPCMBuffer *buffer, AVAudioTime *when) {
                       [weakSelf takeBuffer:buffer session:session];
                     }];
    [engine prepare];
    if (![engine startAndReturnError:&error]) {
      [input removeTapOnBus:0];
      reject(@"start_failed", error.localizedDescription ?: GPLocalizedString(@"The microphone could not start."), error);
      return;
    }
  } @catch (NSException *exception) {
    reject(@"start_failed", exception.reason ?: GPLocalizedString(@"The microphone could not start."), nil);
    return;
  }
  _engine = engine;
  resolve(nil);
}

- (void)stopCapture
{
  _session += 1;
  if (_engine != nil) {
    [_engine.inputNode removeTapOnBus:0];
    [_engine stop];
    _engine = nil;
  }
  if (_qaTimer != nil) {
    dispatch_source_cancel(_qaTimer);
    _qaTimer = nil;
  }
  _pending.length = 0;
  _filled = 0;
  _sinceLastFrame = 0;
}

#pragma mark - Samples

/** On the audio thread: the buffer mixed to mono, handed to the module's queue. */
- (void)takeBuffer:(AVAudioPCMBuffer *)buffer session:(NSUInteger)session
{
  float *const *channels = buffer.floatChannelData;
  NSUInteger count = buffer.frameLength;
  NSUInteger channelCount = buffer.format.channelCount;
  if (channels == NULL || count == 0 || channelCount == 0) {
    return;
  }
  NSMutableData *mono = [NSMutableData dataWithBytes:channels[0] length:count * sizeof(float)];
  float *samples = mono.mutableBytes;
  for (NSUInteger channel = 1; channel < channelCount; channel++) {
    vDSP_vadd(samples, 1, channels[channel], 1, samples, 1, count);
  }
  float scale = 1.0f / (float)channelCount;
  vDSP_vsmul(samples, 1, &scale, samples, 1, count);
  dispatch_async(_queue, ^{
    if (self->_session == session) {
      [self consumeSamples:mono];
    }
  });
}

/**
 * The decimation for an input rate: the integer factor that keeps the output at or over kTargetRate, and a Blackman
 * windowed-sinc low-pass (about 74 dB down) cutting at the output's Nyquist, its transition band ending where an alias
 * would land under kHighestToneHz.
 */
- (void)prepareDecimatorForRate:(double)rate
{
  _factor = MAX((NSUInteger)1, (NSUInteger)floor(rate / kTargetRate));
  _outputRate = rate / (double)_factor;
  double transition = _outputRate - 2 * kHighestToneHz;
  NSUInteger length = _factor == 1 ? 1 : ((NSUInteger)ceil(5.5 * rate / transition) | 1);
  NSMutableData *filter = [NSMutableData dataWithLength:length * sizeof(float)];
  float *taps = filter.mutableBytes;
  double cutoff = (_outputRate / 2) / rate;
  double sum = 0;
  for (NSUInteger i = 0; i < length; i++) {
    double offset = (double)i - (double)(length - 1) / 2;
    double sinc = offset == 0 ? 2 * cutoff : sin(2 * M_PI * cutoff * offset) / (M_PI * offset);
    double phase = length == 1 ? 0 : 2 * M_PI * (double)i / (double)(length - 1);
    double window = 0.42 - 0.5 * cos(phase) + 0.08 * cos(2 * phase);
    taps[i] = (float)(sinc * (length == 1 ? 1 : window));
    sum += taps[i];
  }
  float gain = (float)(1 / sum);
  vDSP_vsmul(taps, 1, &gain, taps, 1, length);
  _filter = filter;
  _pending.length = 0;
}

/** On the module's queue: input samples → decimated samples → a frame now and then. */
- (void)consumeSamples:(NSData *)mono
{
  [_pending appendData:mono];
  NSUInteger filterLength = _filter.length / sizeof(float);
  NSUInteger available = _pending.length / sizeof(float);
  if (available < filterLength) {
    return;
  }
  NSUInteger count = (available - filterLength) / _factor + 1;
  NSMutableData *decimated = [NSMutableData dataWithLength:count * sizeof(float)];
  vDSP_desamp(_pending.bytes, (vDSP_Stride)_factor, _filter.bytes, decimated.mutableBytes, count, filterLength);
  [_pending replaceBytesInRange:NSMakeRange(0, count * _factor * sizeof(float)) withBytes:NULL length:0];
  [self appendToFrame:decimated.bytes count:count];
}

- (void)appendToFrame:(const float *)samples count:(NSUInteger)count
{
  float *frame = _frame.mutableBytes;
  NSUInteger kept = count >= kFrameLength ? 0 : kFrameLength - count;
  NSUInteger taken = MIN(count, kFrameLength);
  memmove(frame, frame + (kFrameLength - kept), kept * sizeof(float));
  memcpy(frame + kept, samples + (count - taken), taken * sizeof(float));
  _filled = MIN(kFrameLength, _filled + count);
  _sinceLastFrame += count;
  if (_filled == kFrameLength && _sinceLastFrame >= kHopLength) {
    _sinceLastFrame = 0;
    [self sendFrame];
  }
}

- (void)sendFrame
{
  if (!_hasListeners) {
    return;
  }
  const float *frame = _frame.bytes;
  NSMutableData *pcm = [NSMutableData dataWithLength:kFrameLength * sizeof(uint16_t)];
  uint16_t *out = pcm.mutableBytes;
  for (NSUInteger i = 0; i < kFrameLength; i++) {
    float clipped = fmaxf(-1.0f, fminf(1.0f, frame[i]));
    out[i] = CFSwapInt16HostToLittle((uint16_t)(int16_t)lrintf(clipped * 32767.0f));
  }
  [self sendEventWithName:kAudioFrameEvent body:@{@"sampleRate" : @(_outputRate), @"samples" : [pcm base64EncodedStringWithOptions:0]}];
}

#pragma mark - QA tone

/** GPEDITOR_QA_TUNER_HZ, honoured only outside the App Sandbox (the QA copy); 0 when unset or out of range. */
- (double)qaToneHz
{
  NSString *value = NSProcessInfo.processInfo.environment[kQAToneVariable];
  if (value.length == 0 || GPIsSandboxed()) {
    return 0;
  }
  double hz = value.doubleValue;
  return hz >= 20 && hz <= 5000 ? hz : 0;
}

/** A tap buffer's worth of a plucked-string-like tone every 85 ms, as the microphone would deliver it. */
- (void)startQAToneAt:(double)hz
{
  [self prepareDecimatorForRate:kQAToneRate];
  _qaPhase = 0;
  NSUInteger session = _session;
  uint64_t interval = (uint64_t)((double)kTapBufferSize / kQAToneRate * NSEC_PER_SEC);
  dispatch_source_t timer = dispatch_source_create(DISPATCH_SOURCE_TYPE_TIMER, 0, 0, _queue);
  dispatch_source_set_timer(timer, dispatch_time(DISPATCH_TIME_NOW, 0), interval, interval / 10);
  __weak GPAudioInput *weakSelf = self;
  dispatch_source_set_event_handler(timer, ^{
    GPAudioInput *strongSelf = weakSelf;
    if (strongSelf != nil && strongSelf->_session == session) {
      [strongSelf consumeSamples:[strongSelf qaToneBufferAt:hz]];
    }
  });
  dispatch_resume(timer);
  _qaTimer = timer;
}

- (NSData *)qaToneBufferAt:(double)hz
{
  NSMutableData *buffer = [NSMutableData dataWithLength:kTapBufferSize * sizeof(float)];
  float *samples = buffer.mutableBytes;
  double step = 2 * M_PI * hz / kQAToneRate;
  for (NSUInteger i = 0; i < kTapBufferSize; i++) {
    double phase = _qaPhase + step * (double)i;
    samples[i] = (float)(0.2 * sin(phase) + 0.12 * sin(2 * phase) + 0.06 * sin(3 * phase));
  }
  _qaPhase = fmod(_qaPhase + step * kTapBufferSize, 2 * M_PI);
  return buffer;
}

@end
