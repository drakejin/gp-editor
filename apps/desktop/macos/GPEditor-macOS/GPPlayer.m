// MIDI playback for the JS side: plays a Standard MIDI File (built by gp-core's renderMidi) with AVMIDIPlayer and
// the General MIDI sound bank that ships with macOS. JS polls -position to follow the playing beat.

#import <AVFoundation/AVFoundation.h>
#import <React/RCTBridgeModule.h>

static NSString *const kSystemSoundBank = @"/System/Library/Components/CoreAudio.component/Contents/Resources/gs_instruments.dls";

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

/** The system GS sound bank when present; nil makes AVMIDIPlayer use the default bank. */
+ (NSURL *)soundBankURL
{
  return [[NSFileManager defaultManager] fileExistsAtPath:kSystemSoundBank] ? [NSURL fileURLWithPath:kSystemSoundBank] : nil;
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
  AVMIDIPlayer *player = [[AVMIDIPlayer alloc] initWithData:data soundBankURL:[GPPlayer soundBankURL] error:&error];
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

RCT_EXPORT_METHOD(position : (RCTPromiseResolveBlock)resolve reject : (RCTPromiseRejectBlock)reject)
{
  AVMIDIPlayer *player = _player;
  resolve(@{
    @"seconds" : @(player == nil ? 0 : player.currentPosition),
    @"isPlaying" : @(player != nil && player.isPlaying && player.currentPosition < player.duration),
  });
}

@end
