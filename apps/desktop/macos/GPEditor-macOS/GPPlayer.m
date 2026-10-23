// MIDI playback for the JS side: plays a Standard MIDI File (built by gp-core's renderMidi) on GPMidiEngine with the
// selected sound bank (GPSoundBanks: GeneralUser GS, the macOS GS bank, or a SoundFont the user added). JS polls
// -position to follow the playing beat, and changes a channel's program live when a track's instrument changes. It mutes
// the metronome's track while the metronome is off (-setMutedTracks:) and plays a single note for the hover preview.
// Methods run on a serial queue of their own, so loading a bank never blocks the window; only the open panel of
// -addSoundBank goes to the main queue.

#import <AppKit/AppKit.h>
#import <React/RCTBridgeModule.h>
#import <UniformTypeIdentifiers/UniformTypeIdentifiers.h>
#import <os/log.h>

#import "GPMidiEngine.h"
#import "GPSoundBanks.h"

@interface GPPlayer : NSObject <RCTBridgeModule>
@end

@implementation GPPlayer {
  dispatch_queue_t _queue;
  GPMidiEngine *_engine;
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
  }
  return self;
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

RCT_EXPORT_METHOD(play : (NSString *)base64 fromSeconds : (double)seconds resolve : (RCTPromiseResolveBlock)resolve reject : (RCTPromiseRejectBlock)reject)
{
  NSData *data = [[NSData alloc] initWithBase64EncodedString:base64 options:0];
  if (data == nil) {
    [self.engine stop];
    reject(@"bad_midi", @"The MIDI data is not valid base64", nil);
    return;
  }
  NSError *error = nil;
  if (![self.engine playData:data fromSeconds:seconds bankURL:[GPSoundBanks selectedBankURL] error:&error]) {
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

/** Highest MIDI file track index taken (renderMidi writes far fewer: the tracks, the metronome, the count-in). */
static const NSInteger kMaxTrackIndex = 1024;

/** MIDI file tracks kept silent, now and in later songs (the metronome's track while the metronome is off). */
RCT_EXPORT_METHOD(setMutedTracks : (NSArray *)trackIndexes resolve : (RCTPromiseResolveBlock)resolve reject : (RCTPromiseRejectBlock)reject)
{
  NSMutableIndexSet *muted = [NSMutableIndexSet indexSet];
  for (id value in trackIndexes) {
    if ([value isKindOfClass:[NSNumber class]] && [value integerValue] >= 0 && [value integerValue] <= kMaxTrackIndex) {
      [muted addIndex:(NSUInteger)[value integerValue]];
    }
  }
  [self.engine setMutedTrackIndexes:muted];
  os_log(OS_LOG_DEFAULT, "GPPlayer: muted tracks %{public}@", [trackIndexes componentsJoinedByString:@","]);
  resolve(nil);
}

/** One note now (a key or fret hovered with Preview on hover): checked ranges, at most five seconds. */
RCT_EXPORT_METHOD(previewNote : (double)channel program : (double)program key : (double)key velocity : (double)velocity durationMs : (double)durationMs resolve : (RCTPromiseResolveBlock)resolve reject : (RCTPromiseRejectBlock)reject)
{
  BOOL isValid = channel >= 0 && channel <= 15 && program >= 0 && program <= 127 && key >= 0 && key <= 127 && velocity >= 1 && velocity <= 127;
  if (!isValid) {
    reject(@"bad_note", @"The note to preview is out of range", nil);
    return;
  }
  NSTimeInterval seconds = MIN(5, MAX(0.02, durationMs / 1000));
  NSError *error = nil;
  if (![self.engine playNote:(UInt8)key velocity:(UInt8)velocity program:(UInt8)program onChannel:(UInt8)channel forSeconds:seconds bankURL:[GPSoundBanks selectedBankURL] error:&error]) {
    reject(@"preview_failed", error.localizedDescription ?: @"Could not preview the note", error);
    return;
  }
  os_log(OS_LOG_DEFAULT, "GPPlayer: preview note %d on channel %d, program %d", (int)key, (int)channel, (int)program);
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

@end
