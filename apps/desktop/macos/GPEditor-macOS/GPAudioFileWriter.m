#import "GPAudioFileWriter.h"

#import <AudioToolbox/AudioToolbox.h>

#import "GPMp3Writer.h"
#import "GPVorbisWriter.h"
#import "GPAppStrings.h"

NSErrorDomain const GPAudioExportErrorDomain = @"GPAudioExport";

NSError *GPAudioExportError(NSInteger code, NSString *message)
{
  return [NSError errorWithDomain:GPAudioExportErrorDomain code:code userInfo:@{NSLocalizedDescriptionKey : message}];
}

NSError *GPAudioExportFileError(NSString *message)
{
  int code = errno;
  return GPAudioExportError(code, [NSString stringWithFormat:@"%@: %s", message, strerror(code)]);
}

static NSInteger IntegerIn(NSDictionary *settings, NSString *key, NSArray<NSNumber *> *allowed, NSInteger fallback)
{
  id value = settings[key];
  if (![value isKindOfClass:[NSNumber class]]) {
    return fallback;
  }
  return [allowed containsObject:@([value integerValue])] && [value doubleValue] == [value integerValue] ? [value integerValue] : NSIntegerMin;
}

@implementation GPAudioFileSettings

- (instancetype)initWithFormat:(NSString *)format sampleRate:(double)sampleRate bitDepth:(NSInteger)bitDepth mp3Bitrate:(NSInteger)mp3Bitrate oggQuality:(NSInteger)oggQuality
{
  if ((self = [super init])) {
    _format = [format copy];
    _sampleRate = sampleRate;
    _bitDepth = bitDepth;
    _mp3Bitrate = mp3Bitrate;
    _oggQuality = oggQuality;
  }
  return self;
}

+ (nullable instancetype)settingsFrom:(NSDictionary *)settings error:(NSError **)error
{
  NSString *format = [settings isKindOfClass:[NSDictionary class]] && [settings[@"format"] isKindOfClass:[NSString class]] ? settings[@"format"] : @"";
  BOOL isFormat = [@[ @"wav", @"aiff", @"flac", @"mp3", @"ogg" ] containsObject:format];
  NSInteger sampleRate = isFormat ? IntegerIn(settings, @"sampleRate", @[ @44100, @48000 ], NSIntegerMin) : NSIntegerMin;
  NSInteger bitDepth = IntegerIn(settings, @"bitDepth", @[ @16, @24 ], 24);
  NSInteger mp3Bitrate = IntegerIn(settings, @"mp3Bitrate", @[ @0, @128, @192, @256, @320 ], 192);
  NSInteger oggQuality = IntegerIn(settings, @"oggQuality", @[ @0, @1, @2, @3, @4, @5, @6, @7, @8, @9, @10 ], 6);
  if (sampleRate == NSIntegerMin || bitDepth == NSIntegerMin || mp3Bitrate == NSIntegerMin || oggQuality == NSIntegerMin) {
    if (error != NULL) {
      *error = GPAudioExportError(1, GPLocalizedString(@"These export settings are not offered"));
    }
    return nil;
  }
  return [[self alloc] initWithFormat:format sampleRate:sampleRate bitDepth:bitDepth mp3Bitrate:mp3Bitrate oggQuality:oggQuality];
}

@end

/**
 * WAV, AIFF and FLAC through ExtAudioFile (macOS's converter and FLAC encoder): the file type named, not guessed from
 * the extension (AVAudioFile writes AIFF-C for .aiff), and FLAC told its source depth (16 or 24-bit).
 */
@interface GPPcmFileWriter : NSObject <GPAudioFileWriter>
@end

@implementation GPPcmFileWriter {
  ExtAudioFileRef _file;
}

static AudioStreamBasicDescription FileFormatFor(GPAudioFileSettings *settings)
{
  AudioStreamBasicDescription format = {0};
  format.mSampleRate = settings.sampleRate;
  format.mChannelsPerFrame = 2;
  if ([settings.format isEqualToString:@"flac"]) {
    format.mFormatID = kAudioFormatFLAC;
    format.mFormatFlags = settings.bitDepth == 16 ? kAppleLosslessFormatFlag_16BitSourceData : kAppleLosslessFormatFlag_24BitSourceData;
    UInt32 size = sizeof(format);
    AudioFormatGetProperty(kAudioFormatProperty_FormatInfo, 0, NULL, &size, &format);
    return format;
  }
  BOOL isAiff = [settings.format isEqualToString:@"aiff"];
  format.mFormatID = kAudioFormatLinearPCM;
  format.mFormatFlags = kAudioFormatFlagIsSignedInteger | kAudioFormatFlagIsPacked | (isAiff ? kAudioFormatFlagIsBigEndian : 0);
  format.mBitsPerChannel = (UInt32)settings.bitDepth;
  format.mBytesPerFrame = format.mBitsPerChannel / 8 * 2;
  format.mFramesPerPacket = 1;
  format.mBytesPerPacket = format.mBytesPerFrame;
  return format;
}

static AudioFileTypeID FileTypeFor(NSString *format)
{
  return [format isEqualToString:@"flac"] ? kAudioFileFLACType : [format isEqualToString:@"aiff"] ? kAudioFileAIFFType : kAudioFileWAVEType;
}

static NSError *StatusError(OSStatus status, NSString *message)
{
  return GPAudioExportError(status, [NSString stringWithFormat:@"%@ (error %d)", message, (int)status]);
}

- (nullable instancetype)initWithSettings:(GPAudioFileSettings *)settings url:(NSURL *)url error:(NSError **)error
{
  if ((self = [super init])) {
    AudioStreamBasicDescription fileFormat = FileFormatFor(settings);
    OSStatus status = ExtAudioFileCreateWithURL((__bridge CFURLRef)url, FileTypeFor(settings.format), &fileFormat, NULL, kAudioFileFlags_EraseFile, &_file);
    if (status == noErr) {
      // What the renderer hands over: stereo, deinterleaved 32-bit float at the file's rate.
      AVAudioFormat *rendered = [[AVAudioFormat alloc] initStandardFormatWithSampleRate:settings.sampleRate channels:2];
      status = ExtAudioFileSetProperty(_file, kExtAudioFileProperty_ClientDataFormat, sizeof(AudioStreamBasicDescription), rendered.streamDescription);
    }
    if (status != noErr) {
      if (error != NULL) {
        *error = StatusError(status, [NSString stringWithFormat:GPLocalizedString(@"The %@ file could not be created"), settings.format.uppercaseString]);
      }
      return nil;
    }
  }
  return self;
}

- (void)dealloc
{
  if (_file != NULL) {
    ExtAudioFileDispose(_file);
  }
}

- (BOOL)writeBuffer:(AVAudioPCMBuffer *)buffer error:(NSError **)error
{
  UInt32 bytes = buffer.frameLength * sizeof(float);
  AudioBufferList *list = alloca(offsetof(AudioBufferList, mBuffers) + 2 * sizeof(AudioBuffer));
  list->mNumberBuffers = 2;
  for (AVAudioChannelCount channel = 0; channel < 2; channel++) {
    list->mBuffers[channel] = (AudioBuffer){1, bytes, buffer.floatChannelData[MIN(channel, buffer.format.channelCount - 1)]};
  }
  OSStatus status = ExtAudioFileWrite(_file, buffer.frameLength, list);
  if (status != noErr && error != NULL) {
    *error = StatusError(status, GPLocalizedString(@"The audio file could not be written"));
  }
  return status == noErr;
}

- (BOOL)finish:(NSError **)error
{
  OSStatus status = ExtAudioFileDispose(_file);
  _file = NULL;
  if (status != noErr && error != NULL) {
    *error = StatusError(status, GPLocalizedString(@"The audio file could not be finished"));
  }
  return status == noErr;
}

@end

id<GPAudioFileWriter> _Nullable GPCreateAudioFileWriter(GPAudioFileSettings *settings, NSURL *url, NSError **error)
{
  // The save panel asked before replacing; each writer creates a new file.
  [[NSFileManager defaultManager] removeItemAtURL:url error:nil];
  if ([settings.format isEqualToString:@"mp3"]) {
    return [[GPMp3Writer alloc] initWithURL:url sampleRate:settings.sampleRate bitrate:settings.mp3Bitrate error:error];
  }
  if ([settings.format isEqualToString:@"ogg"]) {
    return [[GPVorbisWriter alloc] initWithURL:url sampleRate:settings.sampleRate quality:settings.oggQuality error:error];
  }
  return [[GPPcmFileWriter alloc] initWithSettings:settings url:url error:error];
}
