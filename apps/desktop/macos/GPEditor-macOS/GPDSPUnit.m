#import "GPDSPUnit.h"

/** Our manufacturer code and one subtype per kernel kind (GPDSPKind order). */
static const OSType kManufacturer = 'GPEd';
static const OSType kSubTypes[] = {'gpCh', 'gpDr', 'gpCb'};
static NSString *const kNames[] = {@"GP Editor: Chorus", @"GP Editor: Drive", @"GP Editor: Cabinet"};
static const int kKindCount = 3;
static const AUAudioFrameCount kDefaultMaximumFrames = 4096;

/** What the render block reads: set while render resources are allocated, so never changed while it runs. */
typedef struct {
  GPDSPKernel *kernel;
  AudioBufferList *inputList;
  float *inputSamples[GP_DSP_MAX_CHANNELS];
  AUAudioFrameCount capacity;
  int channels;
} GPDSPRenderState;

@implementation GPDSPUnit {
  GPDSPKind _kind;
  AUAudioUnitBus *_inputBus;
  AUAudioUnitBus *_outputBus;
  AUAudioUnitBusArray *_inputBusArray;
  AUAudioUnitBusArray *_outputBusArray;
  GPDSPRenderState *_state;
  float _params[GP_DSP_PARAM_COUNT];
  BOOL _hasParam[GP_DSP_PARAM_COUNT];
  BOOL _isBypassed;
}

static AudioComponentDescription DescriptionOfKind(GPDSPKind kind)
{
  AudioComponentDescription description = {kAudioUnitType_Effect, kSubTypes[kind], kManufacturer, 0, 0};
  return description;
}

+ (void)registerUnits
{
  static dispatch_once_t once;
  dispatch_once(&once, ^{
    for (int kind = 0; kind < kKindCount; kind++) {
      [AUAudioUnit registerSubclass:self asComponentDescription:DescriptionOfKind((GPDSPKind)kind) name:kNames[kind] version:1];
    }
  });
}

+ (AVAudioUnitEffect *)effectNodeOfKind:(GPDSPKind)kind
{
  [self registerUnits];
  return [[AVAudioUnitEffect alloc] initWithAudioComponentDescription:DescriptionOfKind(kind)];
}

- (nullable instancetype)initWithComponentDescription:(AudioComponentDescription)componentDescription
                                              options:(AudioComponentInstantiationOptions)options
                                                error:(NSError **)outError
{
  if (!(self = [super initWithComponentDescription:componentDescription options:options error:outError])) {
    return nil;
  }
  _kind = GPDSPKindChorus;
  for (int kind = 0; kind < kKindCount; kind++) {
    if (kSubTypes[kind] == componentDescription.componentSubType) {
      _kind = (GPDSPKind)kind;
    }
  }
  AVAudioFormat *format = [[AVAudioFormat alloc] initStandardFormatWithSampleRate:44100 channels:2];
  _inputBus = [[AUAudioUnitBus alloc] initWithFormat:format error:outError];
  _outputBus = [[AUAudioUnitBus alloc] initWithFormat:format error:outError];
  if (_inputBus == nil || _outputBus == nil) {
    return nil;
  }
  _inputBus.maximumChannelCount = GP_DSP_MAX_CHANNELS;
  _outputBus.maximumChannelCount = GP_DSP_MAX_CHANNELS;
  _inputBusArray = [[AUAudioUnitBusArray alloc] initWithAudioUnit:self busType:AUAudioUnitBusTypeInput busses:@[ _inputBus ]];
  _outputBusArray = [[AUAudioUnitBusArray alloc] initWithAudioUnit:self busType:AUAudioUnitBusTypeOutput busses:@[ _outputBus ]];
  _state = calloc(1, sizeof(GPDSPRenderState));
  self.maximumFramesToRender = kDefaultMaximumFrames;
  return _state == NULL ? nil : self;
}

- (void)dealloc
{
  [self freeRenderState];
  free(_state);
}

- (AUAudioUnitBusArray *)inputBusses
{
  return _inputBusArray;
}

- (AUAudioUnitBusArray *)outputBusses
{
  return _outputBusArray;
}

- (BOOL)allocateRenderResourcesAndReturnError:(NSError **)outError
{
  if (![super allocateRenderResourcesAndReturnError:outError]) {
    return NO;
  }
  int channels = (int)_outputBus.format.channelCount;
  if (channels < 1 || channels > GP_DSP_MAX_CHANNELS || _inputBus.format.channelCount != (AVAudioChannelCount)channels) {
    if (outError != NULL) {
      *outError = [NSError errorWithDomain:NSOSStatusErrorDomain code:kAudioUnitErr_FormatNotSupported userInfo:nil];
    }
    return NO;
  }
  [self freeRenderState];
  GPDSPKernel *kernel = GPDSPKernelCreate(_kind, _outputBus.format.sampleRate, channels);
  AudioBufferList *list = calloc(1, sizeof(AudioBufferList) + sizeof(AudioBuffer) * (GP_DSP_MAX_CHANNELS - 1));
  if (kernel == NULL || list == NULL) {
    GPDSPKernelDestroy(kernel);
    free(list);
    return NO;
  }
  for (int index = 0; index < GP_DSP_PARAM_COUNT; index++) {
    if (_hasParam[index]) {
      GPDSPKernelSetParam(kernel, index, _params[index]);
    }
  }
  GPDSPKernelSetBypass(kernel, _isBypassed);
  list->mNumberBuffers = (UInt32)channels;
  for (int channel = 0; channel < channels; channel++) {
    _state->inputSamples[channel] = calloc(self.maximumFramesToRender, sizeof(float));
  }
  _state->inputList = list;
  _state->capacity = self.maximumFramesToRender;
  _state->channels = channels;
  _state->kernel = kernel;
  return YES;
}

- (void)deallocateRenderResources
{
  [self freeRenderState];
  [super deallocateRenderResources];
}

- (void)freeRenderState
{
  if (_state == NULL) {
    return;
  }
  GPDSPKernelDestroy(_state->kernel);
  free(_state->inputList);
  for (int channel = 0; channel < GP_DSP_MAX_CHANNELS; channel++) {
    free(_state->inputSamples[channel]);
  }
  memset(_state, 0, sizeof(GPDSPRenderState));
}

- (void)setParam:(int)index value:(float)value
{
  if (index < 0 || index >= GP_DSP_PARAM_COUNT) {
    return;
  }
  _params[index] = value;
  _hasParam[index] = YES;
  GPDSPKernelSetParam(_state->kernel, index, value);
}

- (BOOL)shouldBypassEffect
{
  return _isBypassed;
}

- (void)setShouldBypassEffect:(BOOL)shouldBypassEffect
{
  _isBypassed = shouldBypassEffect;
  GPDSPKernelSetBypass(_state->kernel, shouldBypassEffect);
}

- (AUInternalRenderBlock)internalRenderBlock
{
  GPDSPRenderState *state = _state;
  return ^AUAudioUnitStatus(AudioUnitRenderActionFlags *actionFlags, const AudioTimeStamp *timestamp, AVAudioFrameCount frameCount,
                            NSInteger outputBusNumber, AudioBufferList *outputData, const AURenderEvent *realtimeEventListHead,
                            AURenderPullInputBlock pullInputBlock) {
    if (state->kernel == NULL || pullInputBlock == nil) {
      return kAudioUnitErr_Uninitialized;
    }
    if (frameCount > state->capacity || outputData->mNumberBuffers != (UInt32)state->channels) {
      return kAudioUnitErr_TooManyFramesToProcess;
    }
    AudioBufferList *input = state->inputList;
    for (int channel = 0; channel < state->channels; channel++) {
      input->mBuffers[channel] = (AudioBuffer){1, frameCount * (UInt32)sizeof(float), state->inputSamples[channel]};
    }
    AudioUnitRenderActionFlags pullFlags = 0;
    AUAudioUnitStatus status = pullInputBlock(&pullFlags, timestamp, frameCount, 0, input);
    if (status != noErr) {
      return status;
    }
    float *ins[GP_DSP_MAX_CHANNELS] = {NULL, NULL};
    float *outs[GP_DSP_MAX_CHANNELS] = {NULL, NULL};
    for (int channel = 0; channel < state->channels; channel++) {
      AudioBuffer *out = &outputData->mBuffers[channel];
      ins[channel] = input->mBuffers[channel].mData;
      if (out->mData == NULL) {
        out->mData = ins[channel];
      }
      out->mDataByteSize = frameCount * (UInt32)sizeof(float);
      outs[channel] = out->mData;
    }
    GPDSPKernelProcess(state->kernel, ins, outs, (int)frameCount);
    return noErr;
  };
}

@end
