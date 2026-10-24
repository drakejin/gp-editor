#import "GPVorbisWriter.h"
#import "GPAppStrings.h"

#import <ogg/ogg.h>
#import <vorbis/vorbisenc.h>

/** libvorbis' quality runs from -0.1 to 1.0; the export's 0–10 is a tenth of it. */
static const float kQualityScale = 10;

@implementation GPVorbisWriter {
  FILE *_file;
  vorbis_info _info;
  vorbis_comment _comment;
  vorbis_dsp_state _dsp;
  vorbis_block _block;
  ogg_stream_state _stream;
  BOOL _isEncoding;
}

- (nullable instancetype)initWithURL:(NSURL *)url sampleRate:(double)sampleRate quality:(NSInteger)quality error:(NSError **)error
{
  if ((self = [super init])) {
    vorbis_info_init(&_info);
    if (vorbis_encode_init_vbr(&_info, 2, (long)sampleRate, (float)quality / kQualityScale) != 0) {
      vorbis_info_clear(&_info);
      if (error != NULL) {
        *error = GPAudioExportError(4, GPLocalizedString(@"The Ogg Vorbis encoder does not take these settings"));
      }
      return nil;
    }
    vorbis_comment_init(&_comment);
    vorbis_comment_add_tag(&_comment, "ENCODER", "GP Editor");
    vorbis_analysis_init(&_dsp, &_info);
    vorbis_block_init(&_dsp, &_block);
    ogg_stream_init(&_stream, (int)arc4random());
    _isEncoding = YES;
    _file = fopen(url.fileSystemRepresentation, "wb");
    if (_file == NULL || ![self writeHeaders]) {
      if (error != NULL) {
        *error = GPAudioExportFileError(GPLocalizedString(@"The Ogg Vorbis file could not be created"));
      }
      return nil;
    }
  }
  return self;
}

- (void)dealloc
{
  if (_file != NULL) {
    fclose(_file);
  }
  if (_isEncoding) {
    ogg_stream_clear(&_stream);
    vorbis_block_clear(&_block);
    vorbis_dsp_clear(&_dsp);
    vorbis_comment_clear(&_comment);
    vorbis_info_clear(&_info);
  }
}

- (BOOL)writePage:(ogg_page *)page
{
  return fwrite(page->header, 1, (size_t)page->header_len, _file) == (size_t)page->header_len &&
         fwrite(page->body, 1, (size_t)page->body_len, _file) == (size_t)page->body_len;
}

/** The identification, comment and codebook headers, on pages of their own (as the Vorbis spec asks). */
- (BOOL)writeHeaders
{
  ogg_packet identification, comment, codebooks;
  vorbis_analysis_headerout(&_dsp, &_comment, &identification, &comment, &codebooks);
  ogg_stream_packetin(&_stream, &identification);
  ogg_stream_packetin(&_stream, &comment);
  ogg_stream_packetin(&_stream, &codebooks);
  ogg_page page;
  while (ogg_stream_flush(&_stream, &page) != 0) {
    if (![self writePage:&page]) {
      return NO;
    }
  }
  return YES;
}

/** Encodes what the encoder has buffered into packets, and writes each finished page. */
- (BOOL)drain
{
  ogg_packet packet;
  ogg_page page;
  while (vorbis_analysis_blockout(&_dsp, &_block) == 1) {
    vorbis_analysis(&_block, NULL);
    vorbis_bitrate_addblock(&_block);
    while (vorbis_bitrate_flushpacket(&_dsp, &packet) == 1) {
      ogg_stream_packetin(&_stream, &packet);
      while (ogg_stream_pageout(&_stream, &page) != 0) {
        if (![self writePage:&page]) {
          return NO;
        }
      }
    }
  }
  return YES;
}

- (BOOL)writeBuffer:(AVAudioPCMBuffer *)buffer error:(NSError **)error
{
  int frames = (int)buffer.frameLength;
  float **input = vorbis_analysis_buffer(&_dsp, frames);
  for (AVAudioChannelCount channel = 0; channel < 2; channel++) {
    memcpy(input[channel], buffer.floatChannelData[MIN(channel, buffer.format.channelCount - 1)], (size_t)frames * sizeof(float));
  }
  vorbis_analysis_wrote(&_dsp, frames);
  if (![self drain]) {
    if (error != NULL) {
      *error = GPAudioExportFileError(GPLocalizedString(@"The Ogg Vorbis file could not be written"));
    }
    return NO;
  }
  return YES;
}

- (BOOL)finish:(NSError **)error
{
  // No more samples: the last packet ends the stream, its page's granule position is the exact sample count.
  vorbis_analysis_wrote(&_dsp, 0);
  BOOL isWritten = [self drain];
  ogg_page page;
  while (isWritten && ogg_stream_flush(&_stream, &page) != 0) {
    isWritten = [self writePage:&page];
  }
  BOOL isClosed = fclose(_file) == 0;
  _file = NULL;
  if (!isWritten || !isClosed) {
    if (error != NULL) {
      *error = GPAudioExportFileError(GPLocalizedString(@"The Ogg Vorbis file could not be finished"));
    }
    return NO;
  }
  return YES;
}

@end
