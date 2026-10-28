#import "GPLineIn.h"

#import <Accelerate/Accelerate.h>
#import <CoreAudio/CoreAudio.h>
#import <stdatomic.h>

#import "GPSandbox.h"
#import "GPAppStrings.h"

static const double kMinGainDb = -24;
static const double kMaxGainDb = 24;
static const double kSilenceDb = -120;
static const AVAudioFrameCount kLevelTapFrames = 1024;
/** QA: outside the App Sandbox, GPEDITOR_QA_LINE_IN_HZ=<Hz> plays a sine at -12 dBFS instead of an audio input, and asks
 * for no microphone access, so the QA driver can turn the line in on without a microphone or a permission prompt. */
static NSString *const kQAToneVariable = @"GPEDITOR_QA_LINE_IN_HZ";
static const double kQAToneRate = 48000;
static const float kQAToneLevel = 0.25f;

static AudioObjectPropertyAddress Address(AudioObjectPropertySelector selector, AudioObjectPropertyScope scope)
{
  AudioObjectPropertyAddress address = {selector, scope, kAudioObjectPropertyElementMain};
  return address;
}

static NSArray<NSNumber *> *AllDevices(void)
{
  AudioObjectPropertyAddress address = Address(kAudioHardwarePropertyDevices, kAudioObjectPropertyScopeGlobal);
  UInt32 size = 0;
  if (AudioObjectGetPropertyDataSize(kAudioObjectSystemObject, &address, 0, NULL, &size) != noErr || size == 0) {
    return @[];
  }
  NSMutableData *data = [NSMutableData dataWithLength:size];
  if (AudioObjectGetPropertyData(kAudioObjectSystemObject, &address, 0, NULL, &size, data.mutableBytes) != noErr) {
    return @[];
  }
  NSMutableArray<NSNumber *> *devices = [NSMutableArray array];
  const AudioDeviceID *ids = data.bytes;
  for (UInt32 index = 0; index < size / sizeof(AudioDeviceID); index++) {
    [devices addObject:@(ids[index])];
  }
  return devices;
}

static UInt32 InputChannelCount(AudioDeviceID device)
{
  AudioObjectPropertyAddress address = Address(kAudioDevicePropertyStreamConfiguration, kAudioDevicePropertyScopeInput);
  UInt32 size = 0;
  if (AudioObjectGetPropertyDataSize(device, &address, 0, NULL, &size) != noErr || size == 0) {
    return 0;
  }
  NSMutableData *data = [NSMutableData dataWithLength:size];
  if (AudioObjectGetPropertyData(device, &address, 0, NULL, &size, data.mutableBytes) != noErr) {
    return 0;
  }
  const AudioBufferList *list = data.bytes;
  UInt32 channels = 0;
  for (UInt32 index = 0; index < list->mNumberBuffers; index++) {
    channels += list->mBuffers[index].mNumberChannels;
  }
  return channels;
}

static NSString *StringProperty(AudioDeviceID device, AudioObjectPropertySelector selector)
{
  AudioObjectPropertyAddress address = Address(selector, kAudioObjectPropertyScopeGlobal);
  CFStringRef value = NULL;
  UInt32 size = sizeof(value);
  if (AudioObjectGetPropertyData(device, &address, 0, NULL, &size, &value) != noErr || value == NULL) {
    return @"";
  }
  return (__bridge_transfer NSString *)value;
}

static BOOL IsBuiltIn(AudioDeviceID device)
{
  AudioObjectPropertyAddress address = Address(kAudioDevicePropertyTransportType, kAudioObjectPropertyScopeGlobal);
  UInt32 transport = 0;
  UInt32 size = sizeof(transport);
  return AudioObjectGetPropertyData(device, &address, 0, NULL, &size, &transport) == noErr && transport == kAudioDeviceTransportTypeBuiltIn;
}

/** Devices the system keeps out of sight, such as the aggregate an audio engine makes of an input and an output. */
static BOOL IsHidden(AudioDeviceID device)
{
  AudioObjectPropertyAddress address = Address(kAudioDevicePropertyIsHidden, kAudioObjectPropertyScopeGlobal);
  UInt32 isHidden = 0;
  UInt32 size = sizeof(isHidden);
  BOOL hasFlag = AudioObjectGetPropertyData(device, &address, 0, NULL, &size, &isHidden) == noErr && isHidden != 0;
  return hasFlag || [StringProperty(device, kAudioDevicePropertyDeviceUID) hasPrefix:@"CADefaultDeviceAggregate"];
}

static AudioDeviceID DefaultDevice(AudioObjectPropertySelector selector)
{
  AudioObjectPropertyAddress address = Address(selector, kAudioObjectPropertyScopeGlobal);
  AudioDeviceID device = kAudioObjectUnknown;
  UInt32 size = sizeof(device);
  AudioObjectGetPropertyData(kAudioObjectSystemObject, &address, 0, NULL, &size, &device);
  return device;
}

/** The input device with that UID, else the system's default input. */
static AudioDeviceID InputDeviceWithId(NSString *_Nullable deviceId)
{
  for (NSNumber *device in AllDevices()) {
    AudioDeviceID candidate = device.unsignedIntValue;
    if (deviceId != nil && InputChannelCount(candidate) > 0 && [StringProperty(candidate, kAudioDevicePropertyDeviceUID) isEqualToString:deviceId]) {
      return candidate;
    }
  }
  return DefaultDevice(kAudioHardwarePropertyDefaultInputDevice);
}

/** GPEDITOR_QA_LINE_IN_HZ, honoured only outside the App Sandbox (the QA copy); 0 when unset or out of range. */
static double QAToneHz(void)
{
  NSString *value = NSProcessInfo.processInfo.environment[kQAToneVariable];
  double hz = value.length == 0 || GPIsSandboxed() ? 0 : value.doubleValue;
  return hz >= 20 && hz <= 5000 ? hz : 0;
}

/** The QA's stand-in for an audio input: a mono sine. */
static AVAudioSourceNode *QAToneNode(double hz)
{
  AVAudioFormat *format = [[AVAudioFormat alloc] initStandardFormatWithSampleRate:kQAToneRate channels:1];
  __block double phase = 0;
  double step = 2 * M_PI * hz / kQAToneRate;
  return [[AVAudioSourceNode alloc] initWithFormat:format
                                       renderBlock:^OSStatus(BOOL *isSilence, const AudioTimeStamp *timestamp, AVAudioFrameCount frameCount, AudioBufferList *outputData) {
                                         float *samples = outputData->mBuffers[0].mData;
                                         for (AVAudioFrameCount frame = 0; frame < frameCount; frame++) {
                                           samples[frame] = kQAToneLevel * (float)sin(phase);
                                           phase = fmod(phase + step, 2 * M_PI);
                                         }
                                         return noErr;
                                       }];
}

@implementation GPLineIn {
  AVAudioEngine *_engine;
  GPMixGraph *_graph;
  /** The QA's tone in place of the input (GPEDITOR_QA_LINE_IN_HZ); nil with a real input. */
  AVAudioSourceNode *_qaTone;
  /** Input gain: an EQ's global gain (−96…+24 dB; a mixer's volume stops at 1.0). */
  AVAudioUnitEQ *_gain;
  /** Monitoring on or off: this mixer's volume, 1 or 0. Its output is mono: one guitar into both sides. */
  AVAudioMixerNode *_monitor;
  _Atomic float _peak;
}

+ (NSDictionary *)devicesState
{
  NSMutableArray *devices = [NSMutableArray array];
  for (NSNumber *device in AllDevices()) {
    AudioDeviceID deviceID = device.unsignedIntValue;
    if (InputChannelCount(deviceID) > 0 && !IsHidden(deviceID)) {
      [devices addObject:@{
        @"id" : StringProperty(deviceID, kAudioDevicePropertyDeviceUID),
        @"name" : StringProperty(deviceID, kAudioObjectPropertyName),
        @"isBuiltIn" : @(IsBuiltIn(deviceID)),
      }];
    }
  }
  AudioDeviceID input = DefaultDevice(kAudioHardwarePropertyDefaultInputDevice);
  return @{
    @"devices" : devices,
    @"defaultId" : input == kAudioObjectUnknown ? @"" : StringProperty(input, kAudioDevicePropertyDeviceUID),
    @"isOutputBuiltIn" : @(IsBuiltIn(DefaultDevice(kAudioHardwarePropertyDefaultOutputDevice))),
  };
}

+ (void)requestAccess:(void (^)(BOOL isGranted))completion
{
  if (QAToneHz() > 0) {
    completion(YES);
    return;
  }
  switch ([AVCaptureDevice authorizationStatusForMediaType:AVMediaTypeAudio]) {
    case AVAuthorizationStatusAuthorized:
      completion(YES);
      break;
    case AVAuthorizationStatusNotDetermined:
      [AVCaptureDevice requestAccessForMediaType:AVMediaTypeAudio completionHandler:completion];
      break;
    default:
      completion(NO);
  }
}

- (instancetype)initWithEngine:(AVAudioEngine *)engine graph:(GPMixGraph *)graph
{
  if ((self = [super init])) {
    _engine = engine;
    _graph = graph;
    _trackIndex = -1;
    atomic_store(&_peak, 0.0f);
  }
  return self;
}

/** The input node on the device (nil or unknown: the default), or the QA's tone; nil with `error` set when it cannot open. */
- (nullable AVAudioNode *)sourceForDevice:(nullable NSString *)deviceId error:(NSError **)error
{
  double toneHz = QAToneHz();
  if (toneHz > 0) {
    _qaTone = QAToneNode(toneHz);
    [_engine attachNode:_qaTone];
    return _qaTone;
  }
  AVAudioInputNode *input = _engine.inputNode;
  AudioDeviceID device = InputDeviceWithId(deviceId);
  OSStatus status = device == kAudioObjectUnknown ? kAudioHardwareBadDeviceError
                                                  : AudioUnitSetProperty(input.audioUnit, kAudioOutputUnitProperty_CurrentDevice, kAudioUnitScope_Global, 0, &device, sizeof(device));
  AVAudioFormat *format = [input outputFormatForBus:0];
  if (status != noErr || format.channelCount == 0 || format.sampleRate <= 0) {
    if (error != NULL) {
      *error = [NSError errorWithDomain:NSOSStatusErrorDomain code:status ?: kAudioHardwareBadDeviceError userInfo:@{NSLocalizedDescriptionKey : GPLocalizedString(@"That audio input could not be opened")}];
    }
    return nil;
  }
  return input;
}

- (BOOL)connectDevice:(nullable NSString *)deviceId error:(NSError **)error
{
  [self disconnect];
  AVAudioNode *input = [self sourceForDevice:deviceId error:error];
  if (input == nil) {
    return NO;
  }
  AVAudioFormat *format = [input outputFormatForBus:0];
  _gain = [[AVAudioUnitEQ alloc] initWithNumberOfBands:1];
  _gain.bands.firstObject.bypass = YES;
  _monitor = [AVAudioMixerNode new];
  [_engine attachNode:_gain];
  [_engine attachNode:_monitor];
  [_engine connect:input to:_gain format:format];
  [_engine connect:_gain to:_monitor format:format];
  [self installLevelTapWithFormat:format];
  _isConnected = YES;
  return YES;
}

- (void)installLevelTapWithFormat:(AVAudioFormat *)format
{
  __weak GPLineIn *weakSelf = self;
  [_gain installTapOnBus:0 bufferSize:kLevelTapFrames format:format block:^(AVAudioPCMBuffer *buffer, AVAudioTime *when) {
    GPLineIn *strongSelf = weakSelf;
    if (strongSelf == nil || buffer.floatChannelData == NULL) {
      return;
    }
    float peak = 0;
    for (AVAudioChannelCount channel = 0; channel < buffer.format.channelCount; channel++) {
      float channelPeak = 0;
      vDSP_maxmgv(buffer.floatChannelData[channel], 1, &channelPeak, buffer.frameLength);
      peak = MAX(peak, channelPeak);
    }
    float seen = atomic_load(&strongSelf->_peak);
    while (peak > seen && !atomic_compare_exchange_weak(&strongSelf->_peak, &seen, peak)) {
    }
  }];
}

- (void)routeToTrack:(NSInteger)trackIndex
{
  if (!_isConnected) {
    return;
  }
  _trackIndex = trackIndex;
  [_engine disconnectNodeOutput:_monitor];
  AVAudioMixerNode *target = [_graph stripInputForTrack:trackIndex] ?: _graph.bus;
  AVAudioFormat *mono = [[AVAudioFormat alloc] initStandardFormatWithSampleRate:[_monitor outputFormatForBus:0].sampleRate channels:1];
  [_engine connect:_monitor to:target fromBus:0 toBus:[target nextAvailableInputBus] format:mono];
}

- (void)setGainDb:(double)gainDb isMonitoring:(BOOL)isMonitoring
{
  _gain.globalGain = (float)(isfinite(gainDb) ? MIN(kMaxGainDb, MAX(kMinGainDb, gainDb)) : 0);
  _monitor.outputVolume = isMonitoring ? 1 : 0;
}

- (void)disconnect
{
  if (!_isConnected) {
    return;
  }
  [_gain removeTapOnBus:0];
  [_engine disconnectNodeInput:_gain];
  [_engine detachNode:_gain];
  [_engine detachNode:_monitor];
  if (_qaTone != nil) {
    [_engine detachNode:_qaTone];
    _qaTone = nil;
  }
  _gain = nil;
  _monitor = nil;
  _isConnected = NO;
  _trackIndex = -1;
}

- (double)takePeakLevel
{
  float peak = atomic_exchange(&_peak, 0.0f);
  return peak > 0 ? MAX(kSilenceDb, 20 * log10(peak)) : kSilenceDb;
}

@end
