// MIDI playback for the JS side: plays a Standard MIDI File (built by gp-core's renderMidi) on GPMidiEngine with the
// selected sound bank (GPSoundBanks: GeneralUser GS, the macOS GS bank, or a SoundFont the user added). JS polls
// -position to follow the playing beat, and changes a channel's program live when a track's instrument changes.

#import <AppKit/AppKit.h>
#import <React/RCTBridgeModule.h>
#import <UniformTypeIdentifiers/UniformTypeIdentifiers.h>

#import "GPMidiEngine.h"
#import "GPSoundBanks.h"

@interface GPPlayer : NSObject <RCTBridgeModule>
@end

@implementation GPPlayer {
  GPMidiEngine *_engine;
}

RCT_EXPORT_MODULE();

+ (BOOL)requiresMainQueueSetup
{
  return NO;
}

- (dispatch_queue_t)methodQueue
{
  return dispatch_get_main_queue();
}

- (GPMidiEngine *)engine
{
  if (_engine == nil) {
    _engine = [GPMidiEngine new];
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
