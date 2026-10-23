// MIDI playback for the JS side: plays a Standard MIDI File (built by gp-core's renderMidi) on GPMidiEngine with the
// selected sound bank (GPSoundBanks: GeneralUser GS, the macOS GS bank, or a SoundFont the user added), and the song's
// audio track under it (GPAudioTrackPlayer). JS polls
// -position to follow the playing beat, and changes a channel's program live when a track's instrument changes.
// The song's effects (setMix) and the line in (Tools ▸ Line In) live on the same engine. View ▸ Mixer and
// Tools ▸ Line In… (GPEditorNotifications.h) are forwarded to JS as "mixerRequested" / "lineInRequested".
// Methods run on a serial queue of their own, so loading a bank never blocks the window; only the open panel of
// -addSoundBank goes to the main queue.

#import <AppKit/AppKit.h>
#import <React/RCTBridgeModule.h>
#import <React/RCTEventEmitter.h>
#import <UniformTypeIdentifiers/UniformTypeIdentifiers.h>

#import "GPEditorNotifications.h"
#import "GPLineIn.h"
#import "GPMidiEngine.h"
#import "GPSoundBanks.h"

static NSString *const kMixerRequestedEvent = @"mixerRequested";
static NSString *const kLineInRequestedEvent = @"lineInRequested";

@interface GPPlayer : RCTEventEmitter <RCTBridgeModule>
@end

@implementation GPPlayer {
  dispatch_queue_t _queue;
  GPMidiEngine *_engine;
  BOOL _hasListeners;
}

RCT_EXPORT_MODULE();

+ (BOOL)requiresMainQueueSetup
{
  return NO;
}

- (instancetype)init
{
  if ((self = [super init])) {
    _queue = dispatch_queue_create("com.drakejin.gpeditor.player", DISPATCH_QUEUE_SERIAL);
    NSNotificationCenter *center = [NSNotificationCenter defaultCenter];
    [center addObserver:self selector:@selector(onMixerCommand:) name:GPEditorMixerCommandNotification object:nil];
    [center addObserver:self selector:@selector(onLineInCommand:) name:GPEditorLineInCommandNotification object:nil];
  }
  return self;
}

- (void)dealloc
{
  [[NSNotificationCenter defaultCenter] removeObserver:self];
}

- (NSArray<NSString *> *)supportedEvents
{
  return @[ kMixerRequestedEvent, kLineInRequestedEvent ];
}

- (void)startObserving
{
  _hasListeners = YES;
}

- (void)stopObserving
{
  _hasListeners = NO;
}

- (void)onMixerCommand:(NSNotification *)note
{
  if (_hasListeners) {
    [self sendEventWithName:kMixerRequestedEvent body:@{}];
  }
}

- (void)onLineInCommand:(NSNotification *)note
{
  if (_hasListeners) {
    [self sendEventWithName:kLineInRequestedEvent body:@{}];
  }
}

- (dispatch_queue_t)methodQueue
{
  return _queue;
}

- (GPMidiEngine *)engine
{
  if (_engine == nil) {
    _engine = [[GPMidiEngine alloc] initWithQueue:_queue];
  }
  return _engine;
}

/** Plays the MIDI file from `seconds`, with the audio track's runs under it (`audio`, GPAudioTrackPlayer.h; null: none). */
RCT_EXPORT_METHOD(play : (NSString *)base64 fromSeconds : (double)seconds audio : (nullable NSDictionary *)audio resolve : (RCTPromiseResolveBlock)resolve reject : (RCTPromiseRejectBlock)reject)
{
  NSData *data = [[NSData alloc] initWithBase64EncodedString:base64 options:0];
  if (data == nil) {
    [self.engine stop];
    reject(@"bad_midi", @"The MIDI data is not valid base64", nil);
    return;
  }
  NSError *error = nil;
  NSDictionary *audioTrack = [audio isKindOfClass:[NSDictionary class]] ? audio : nil;
  if (![self.engine playData:data fromSeconds:seconds bankURL:[GPSoundBanks selectedBankURL] audio:audioTrack error:&error]) {
    reject(@"player_failed", error.localizedDescription ?: @"Could not play the song", error);
    return;
  }
  resolve(nil);
}

RCT_EXPORT_METHOD(stop : (RCTPromiseResolveBlock)resolve reject : (RCTPromiseRejectBlock)reject)
{
  [_engine stop];
  resolve(nil);
}

/** A channel's instrument changes now, in the playing song (a track's instrument was picked). */
RCT_EXPORT_METHOD(setProgram : (double)channel program : (double)program resolve : (RCTPromiseResolveBlock)resolve reject : (RCTPromiseRejectBlock)reject)
{
  [_engine setProgram:(UInt8)program onChannel:(UInt8)channel];
  resolve(nil);
}

/** A channel's mixer setting changes now, in the playing song (7 = volume, 10 = pan). */
RCT_EXPORT_METHOD(setController : (double)channel controller : (double)controller value : (double)value resolve : (RCTPromiseResolveBlock)resolve reject : (RCTPromiseRejectBlock)reject)
{
  [_engine setController:(UInt8)controller value:(UInt8)value onChannel:(UInt8)channel];
  resolve(nil);
}

/** The playing audio track's volume (`gain`, 0–1) and detune (`detuneCents`), heard at once. */
RCT_EXPORT_METHOD(setAudioTrackMix : (NSDictionary *)mix resolve : (RCTPromiseResolveBlock)resolve reject : (RCTPromiseRejectBlock)reject)
{
  double gain = [mix[@"gain"] isKindOfClass:[NSNumber class]] ? [mix[@"gain"] doubleValue] : 1;
  double detune = [mix[@"detuneCents"] isKindOfClass:[NSNumber class]] ? [mix[@"detuneCents"] doubleValue] : 0;
  [_engine setAudioTrackGain:gain detuneCents:detune];
  resolve(nil);
}

RCT_EXPORT_METHOD(soundBanks : (RCTPromiseResolveBlock)resolve reject : (RCTPromiseRejectBlock)reject)
{
  resolve([GPSoundBanks state]);
}

RCT_EXPORT_METHOD(selectSoundBank : (NSString *)bankId resolve : (RCTPromiseResolveBlock)resolve reject : (RCTPromiseRejectBlock)reject)
{
  if (![GPSoundBanks selectBankWithId:bankId]) {
    reject(@"no_bank", @"That sound bank is no longer available", nil);
    return;
  }
  resolve([GPSoundBanks state]);
}

/** Open panel for a .sf2/.dls file; the copy becomes the selected bank. Resolves null when cancelled. */
RCT_EXPORT_METHOD(addSoundBank : (RCTPromiseResolveBlock)resolve reject : (RCTPromiseRejectBlock)reject)
{
  dispatch_async(dispatch_get_main_queue(), ^{
    [GPPlayer addSoundBankWithPanelResolve:resolve reject:reject];
  });
}

+ (void)addSoundBankWithPanelResolve:(RCTPromiseResolveBlock)resolve reject:(RCTPromiseRejectBlock)reject
{
  NSOpenPanel *panel = [NSOpenPanel openPanel];
  panel.canChooseFiles = YES;
  panel.canChooseDirectories = NO;
  panel.allowsMultipleSelection = NO;
  NSMutableArray<UTType *> *types = [NSMutableArray array];
  for (NSString *extension in @[ @"sf2", @"dls" ]) {
    UTType *type = [UTType typeWithFilenameExtension:extension];
    if (type != nil) {
      [types addObject:type];
    }
  }
  panel.allowedContentTypes = types;
  panel.message = @"Add a SoundFont (.sf2) or DLS sound bank for playback";
  if ([panel runModal] != NSModalResponseOK || panel.URL == nil) {
    resolve([NSNull null]);
    return;
  }
  NSError *error = nil;
  if ([GPSoundBanks addBankFromURL:panel.URL error:&error] == nil) {
    reject(@"add_failed", error.localizedDescription ?: @"Could not add the sound bank", error);
    return;
  }
  resolve([GPSoundBanks state]);
}

RCT_EXPORT_METHOD(removeSoundBank : (NSString *)bankId resolve : (RCTPromiseResolveBlock)resolve reject : (RCTPromiseRejectBlock)reject)
{
  NSError *error = nil;
  if (![GPSoundBanks removeBankWithId:bankId error:&error]) {
    reject(@"remove_failed", error.localizedDescription ?: @"Could not remove the sound bank", error);
    return;
  }
  resolve([GPSoundBanks state]);
}

RCT_EXPORT_METHOD(position : (RCTPromiseResolveBlock)resolve reject : (RCTPromiseRejectBlock)reject)
{
  resolve(@{@"seconds" : @(_engine.positionSeconds), @"isPlaying" : @(_engine.isPlaying)});
}

/** The song's effects, `{ tracks: [effects | null], master }` (gp-core's model): heard now, kept for later plays. */
RCT_EXPORT_METHOD(setMix : (NSDictionary *)mix resolve : (RCTPromiseResolveBlock)resolve reject : (RCTPromiseRejectBlock)reject)
{
  [self.engine setMix:[mix isKindOfClass:[NSDictionary class]] ? mix : @{}];
  resolve(nil);
}

/** `{ devices: [{ id, name, isBuiltIn }], defaultId, isOutputBuiltIn }`. */
RCT_EXPORT_METHOD(lineInDevices : (RCTPromiseResolveBlock)resolve reject : (RCTPromiseRejectBlock)reject)
{
  resolve([GPLineIn devicesState]);
}

/** Starts the line in: `{ deviceId, trackIndex, gainDb, isMonitoring }`, asking for microphone access first. */
RCT_EXPORT_METHOD(startLineIn : (NSDictionary *)settings resolve : (RCTPromiseResolveBlock)resolve reject : (RCTPromiseRejectBlock)reject)
{
  [GPLineIn requestAccess:^(BOOL isGranted) {
    dispatch_async(self->_queue, ^{
      if (!isGranted) {
        reject(@"no_access", @"GP Editor may not use the audio input: allow it in System Settings ▸ Privacy & Security ▸ Microphone", nil);
        return;
      }
      NSError *error = nil;
      NSString *deviceId = [settings[@"deviceId"] isKindOfClass:[NSString class]] && [settings[@"deviceId"] length] > 0 ? settings[@"deviceId"] : nil;
      if (![self.engine startLineInWithDevice:deviceId trackIndex:[settings[@"trackIndex"] integerValue] gainDb:[settings[@"gainDb"] doubleValue]
                                 isMonitoring:[settings[@"isMonitoring"] boolValue] error:&error]) {
        reject(@"line_in_failed", error.localizedDescription ?: @"The audio input could not be started", error);
        return;
      }
      resolve(nil);
    });
  }];
}

/** Another track, input gain or monitoring for the running line in: `{ trackIndex, gainDb, isMonitoring }`. */
RCT_EXPORT_METHOD(updateLineIn : (NSDictionary *)settings resolve : (RCTPromiseResolveBlock)resolve reject : (RCTPromiseRejectBlock)reject)
{
  [_engine updateLineInTrack:[settings[@"trackIndex"] integerValue] gainDb:[settings[@"gainDb"] doubleValue] isMonitoring:[settings[@"isMonitoring"] boolValue]];
  resolve(nil);
}

RCT_EXPORT_METHOD(stopLineIn : (RCTPromiseResolveBlock)resolve reject : (RCTPromiseRejectBlock)reject)
{
  [_engine stopLineIn];
  resolve(nil);
}

/** The line in's peak since the last call, in dBFS (−120 when off or silent). */
RCT_EXPORT_METHOD(lineInLevel : (RCTPromiseResolveBlock)resolve reject : (RCTPromiseRejectBlock)reject)
{
  resolve(@(_engine == nil ? -120 : [_engine takeLineInLevel]));
}

@end
