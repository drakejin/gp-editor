// MIDI playback for the JS side: plays a Standard MIDI File (built by gp-core's renderMidi) with AVMIDIPlayer and the
// selected sound bank (GPSoundBanks: GeneralUser GS, the macOS GS bank, or a SoundFont the user added). JS polls
// -position to follow the playing beat.

#import <AVFoundation/AVFoundation.h>
#import <AppKit/AppKit.h>
#import <React/RCTBridgeModule.h>
#import <UniformTypeIdentifiers/UniformTypeIdentifiers.h>

#import "GPSoundBanks.h"

@interface GPPlayer : NSObject <RCTBridgeModule>
@end

@implementation GPPlayer {
  AVMIDIPlayer *_player;
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

RCT_EXPORT_METHOD(play : (NSString *)base64 fromSeconds : (double)seconds resolve : (RCTPromiseResolveBlock)resolve reject : (RCTPromiseRejectBlock)reject)
{
  [_player stop];
  NSData *data = [[NSData alloc] initWithBase64EncodedString:base64 options:0];
  if (data == nil) {
    reject(@"bad_midi", @"The MIDI data is not valid base64", nil);
    return;
  }
  NSError *error = nil;
  // nil (no bank at all) makes AVMIDIPlayer use its default bank.
  AVMIDIPlayer *player = [[AVMIDIPlayer alloc] initWithData:data soundBankURL:[GPSoundBanks selectedBankURL] error:&error];
  if (player == nil) {
    reject(@"player_failed", error.localizedDescription ?: @"Could not create the MIDI player", error);
    return;
  }
  [player prepareToPlay];
  player.currentPosition = MAX(0, seconds);
  [player play:nil];
  _player = player;
  resolve(nil);
}

RCT_EXPORT_METHOD(stop : (RCTPromiseResolveBlock)resolve reject : (RCTPromiseRejectBlock)reject)
{
  [_player stop];
  _player = nil;
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
  AVMIDIPlayer *player = _player;
  resolve(@{
    @"seconds" : @(player == nil ? 0 : player.currentPosition),
    @"isPlaying" : @(player != nil && player.isPlaying && player.currentPosition < player.duration),
  });
}

@end
