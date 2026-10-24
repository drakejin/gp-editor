#import "GPMp3Writer.h"
#import "GPAppStrings.h"

#import <lame/lame.h>

/** LAME's -q: 2 is its recommended high quality (slower search, better sound). */
static const int kAlgorithmQuality = 2;
/** LAME's -V for the variable bit rate: 2 is about 190 kbps. */
static const float kVbrQuality = 2;

@implementation GPMp3Writer {
  lame_t _lame;
  FILE *_file;
  NSMutableData *_output;
}

- (nullable instancetype)initWithURL:(NSURL *)url sampleRate:(double)sampleRate bitrate:(NSInteger)bitrate error:(NSError **)error
{
  if ((self = [super init])) {
    _lame = lame_init();
    if (_lame == NULL) {
      if (error != NULL) {
        *error = GPAudioExportError(2, GPLocalizedString(@"The MP3 encoder could not start"));
      }
      return nil;
    }
    lame_set_in_samplerate(_lame, (int)sampleRate);
    lame_set_out_samplerate(_lame, (int)sampleRate);
    lame_set_num_channels(_lame, 2);
    lame_set_mode(_lame, JOINT_STEREO);
    lame_set_quality(_lame, kAlgorithmQuality);
    // No ID3 tag: the LAME tag must be the file's first frame, where -finish: writes it.
    lame_set_write_id3tag_automatic(_lame, 0);
    lame_set_bWriteVbrTag(_lame, 1);
    if (bitrate > 0) {
      lame_set_VBR(_lame, vbr_off);
      lame_set_brate(_lame, (int)bitrate);
    } else {
      lame_set_VBR(_lame, vbr_default);
      lame_set_VBR_quality(_lame, kVbrQuality);
    }
    if (lame_init_params(_lame) < 0) {
      if (error != NULL) {
        *error = GPAudioExportError(2, GPLocalizedString(@"The MP3 encoder does not take these settings"));
      }
      return nil;
    }
    _file = fopen(url.fileSystemRepresentation, "wb");
    if (_file == NULL) {
      if (error != NULL) {
        *error = GPAudioExportFileError(GPLocalizedString(@"The MP3 file could not be created"));
      }
      return nil;
    }
    _output = [NSMutableData data];
  }
  return self;
}

- (void)dealloc
{
  if (_file != NULL) {
    fclose(_file);
  }
  if (_lame != NULL) {
    lame_close(_lame);
  }
}

- (BOOL)writeBytes:(int)count error:(NSError **)error
{
  if (count < 0) {
    if (error != NULL) {
      *error = GPAudioExportError(3, [NSString stringWithFormat:GPLocalizedString(@"The MP3 encoder failed (%d)"), count]);
    }
    return NO;
  }
  if (count > 0 && fwrite(_output.bytes, 1, (size_t)count, _file) != (size_t)count) {
    if (error != NULL) {
      *error = GPAudioExportFileError(GPLocalizedString(@"The MP3 file could not be written"));
    }
    return NO;
  }
  return YES;
}

- (BOOL)writeBuffer:(AVAudioPCMBuffer *)buffer error:(NSError **)error
{
  int frames = (int)buffer.frameLength;
  // LAME's worst case: 1.25 × samples + 7200 bytes.
  _output.length = (NSUInteger)(frames * 5 / 4 + 7200);
  const float *left = buffer.floatChannelData[0];
  const float *right = buffer.floatChannelData[MIN(1u, buffer.format.channelCount - 1)];
  int count = lame_encode_buffer_ieee_float(_lame, left, right, frames, _output.mutableBytes, (int)_output.length);
  return [self writeBytes:count error:error];
}

- (BOOL)finish:(NSError **)error
{
  _output.length = 7200;
  if (![self writeBytes:lame_encode_flush(_lame, _output.mutableBytes, (int)_output.length) error:error]) {
    return NO;
  }
  // The LAME tag (VBR seek table, exact length, encoder delay and padding) replaces the placeholder first frame.
  _output.length = 4096;
  size_t tagSize = lame_get_lametag_frame(_lame, _output.mutableBytes, _output.length);
  // 0: no tag; more than the buffer never happens (an MP3 frame is at most 1441 bytes) — the placeholder then stays.
  BOOL isTagged = tagSize == 0 || tagSize > _output.length || (fseek(_file, 0, SEEK_SET) == 0 && fwrite(_output.bytes, 1, tagSize, _file) == tagSize);
  BOOL isClosed = fclose(_file) == 0;
  _file = NULL;
  if (!isTagged || !isClosed) {
    if (error != NULL) {
      *error = GPAudioExportFileError(GPLocalizedString(@"The MP3 file could not be finished"));
    }
    return NO;
  }
  return YES;
}

@end
