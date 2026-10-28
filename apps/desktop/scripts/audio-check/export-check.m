// The audio export check (run.sh): renders a fixture through GPAudioExporter — the code File ▸ Export Audio… runs — to
// each format and reads every file back (AVAudioFile for WAV, AIFF, FLAC and MP3; libvorbisfile for Ogg Vorbis): the
// sample rate and channels asked for, the length written (the song plus a tail that ends in silence), a level that is
// the playback render's (exactly for PCM, within half a dB for the lossy formats). Also checks that a reverb's tail is
// kept, that a cancelled export leaves no file, and that the song's audio track is in the file. Prints PASS / FAIL lines;
// exits 1 when a check fails.
// Usage: export-check <bank.sf2> <song.mid> <song seconds> <out dir>

#import <AVFoundation/AVFoundation.h>
#import <Accelerate/Accelerate.h>
#import <vorbis/vorbisfile.h>

#import "GPAudioAssets.h"
#import "GPAudioExporter.h"
#import "GPMixRenderer.h"
#import "audio-measures.h"

static int failures = 0;
static NSURL *bankURL;

static void Check(BOOL isPassed, NSString *name, NSString *detail)
{
  printf("%s %s: %s\n", isPassed ? "PASS" : "FAIL", name.UTF8String, detail.UTF8String);
  failures += isPassed ? 0 : 1;
}

/** A decoded file: its rate, channels and samples (deinterleaved). */
@interface Decoded : NSObject
@property (nonatomic) double rate;
@property (nonatomic) NSUInteger channels;
@property (nonatomic, strong) NSMutableData *left;
@property (nonatomic, strong) NSMutableData *right;
@property (nonatomic, readonly) AVAudioFramePosition frames;
@end

@implementation Decoded
- (AVAudioFramePosition)frames
{
  return (AVAudioFramePosition)(self.left.length / sizeof(float));
}
@end

static Decoded *DecodeWithAVAudioFile(NSURL *url)
{
  NSError *error = nil;
  AVAudioFile *file = [[AVAudioFile alloc] initForReading:url commonFormat:AVAudioPCMFormatFloat32 interleaved:NO error:&error];
  if (file == nil || file.length <= 0) {
    return nil;
  }
  AVAudioPCMBuffer *buffer = [[AVAudioPCMBuffer alloc] initWithPCMFormat:file.processingFormat frameCapacity:(AVAudioFrameCount)file.length];
  if (![file readIntoBuffer:buffer error:&error]) {
    return nil;
  }
  Decoded *decoded = [Decoded new];
  decoded.rate = file.processingFormat.sampleRate;
  decoded.channels = file.processingFormat.channelCount;
  decoded.left = [NSMutableData dataWithBytes:buffer.floatChannelData[0] length:buffer.frameLength * sizeof(float)];
  decoded.right = [NSMutableData dataWithBytes:buffer.floatChannelData[MIN(1u, decoded.channels - 1)] length:buffer.frameLength * sizeof(float)];
  return decoded;
}

/** Ogg Vorbis through libvorbisfile; also checks that the stream's own length (last granule) is what was decoded. */
static Decoded *DecodeVorbis(NSURL *url, ogg_int64_t *granuleFrames)
{
  OggVorbis_File vorbis;
  if (ov_fopen(url.fileSystemRepresentation, &vorbis) != 0) {
    return nil;
  }
  vorbis_info *info = ov_info(&vorbis, -1);
  Decoded *decoded = [Decoded new];
  decoded.rate = info->rate;
  decoded.channels = (NSUInteger)info->channels;
  decoded.left = [NSMutableData data];
  decoded.right = [NSMutableData data];
  *granuleFrames = ov_pcm_total(&vorbis, -1);
  float **pcm = NULL;
  int section = 0;
  long count;
  while ((count = ov_read_float(&vorbis, &pcm, 4096, &section)) > 0) {
    [decoded.left appendBytes:pcm[0] length:(NSUInteger)count * sizeof(float)];
    [decoded.right appendBytes:pcm[MIN(1, info->channels - 1)] length:(NSUInteger)count * sizeof(float)];
  }
  ov_clear(&vorbis);
  return decoded;
}

/** The container and coding as Core Audio reads them: "WAVE 24-bit", "AIFF 16-bit", "flac 16-bit source", "MPG3". */
static NSString *FileKind(NSURL *url)
{
  AudioFileID file = NULL;
  if (AudioFileOpenURL((__bridge CFURLRef)url, kAudioFileReadPermission, 0, &file) != noErr) {
    return @"unreadable";
  }
  AudioFileTypeID type = 0;
  AudioStreamBasicDescription format = {0};
  UInt32 size = sizeof(type);
  AudioFileGetProperty(file, kAudioFilePropertyFileFormat, &size, &type);
  size = sizeof(format);
  AudioFileGetProperty(file, kAudioFilePropertyDataFormat, &size, &format);
  AudioFileClose(file);
  NSString *name = [[NSString alloc] initWithBytes:(char[]){(char)(type >> 24), (char)(type >> 16), (char)(type >> 8), (char)type} length:4 encoding:NSMacOSRomanStringEncoding];
  if (format.mFormatID == kAudioFormatLinearPCM) {
    return [NSString stringWithFormat:@"%@ %u-bit", name, (unsigned)format.mBitsPerChannel];
  }
  if (format.mFormatID == kAudioFormatFLAC) {
    return [NSString stringWithFormat:@"%@ %d-bit source", name, format.mFormatFlags == kAppleLosslessFormatFlag_16BitSourceData ? 16 : 24];
  }
  return name;
}

/** What FileKind must say for these settings (Ogg is not Core Audio's: nil). */
static NSString *ExpectedKind(NSDictionary *settings)
{
  NSString *format = settings[@"format"];
  NSDictionary<NSString *, NSString *> *names = @{@"wav" : @"WAVE D-bit", @"aiff" : @"AIFF D-bit", @"flac" : @"flac D-bit source", @"mp3" : @"MPG3"};
  return [names[format] stringByReplacingOccurrencesOfString:@"D" withString:[settings[@"bitDepth"] description] ?: @""];
}

static double RmsDb(const float *left, const float *right, AVAudioFramePosition frames)
{
  float l = 0, r = 0;
  vDSP_measqv(left, 1, &l, (vDSP_Length)frames);
  vDSP_measqv(right, 1, &r, (vDSP_Length)frames);
  return Db(sqrt((l + r) / 2));
}

static AVAudioFramePosition Export(NSData *midi, double seconds, NSDictionary *mix, NSDictionary *settings, NSURL *url, NSError **error)
{
  GPAudioFileSettings *checked = [GPAudioFileSettings settingsFrom:settings error:error];
  return checked == nil ? -1 : [GPAudioExporter exportMidi:midi seconds:seconds mix:mix bankURL:bankURL settings:checked url:url progress:^BOOL(double fraction) {
    return YES;
  } error:error];
}

/** One format: written, read back, measured against the playback render of the same length. */
static void CheckFormat(NSData *midi, double seconds, NSDictionary *settings, NSString *name, NSURL *url, double toleranceMs)
{
  NSError *error = nil;
  AVAudioFramePosition written = Export(midi, seconds, @{}, settings, url, &error);
  if (written < 0) {
    Check(NO, name, error.localizedDescription ?: @"export failed");
    return;
  }
  double rate = [settings[@"sampleRate"] doubleValue];
  ogg_int64_t granule = -1;
  BOOL isVorbis = [settings[@"format"] isEqualToString:@"ogg"];
  Decoded *decoded = isVorbis ? DecodeVorbis(url, &granule) : DecodeWithAVAudioFile(url);
  if (decoded == nil) {
    Check(NO, name, @"the file does not decode");
    return;
  }
  double lengthMs = (decoded.frames - written) / rate * 1000;
  double tail = written / rate - seconds;
  NSString *kind = isVorbis ? @"Ogg Vorbis" : FileKind(url);
  BOOL isKind = isVorbis || [kind isEqualToString:ExpectedKind(settings)];
  Check(isKind && decoded.rate == rate && decoded.channels == 2 && fabs(lengthMs) <= toleranceMs && (!isVorbis || granule == written) && tail >= 0 &&
            tail <= GPAudioExportMaxTailSeconds,
        [name stringByAppendingString:@" length"],
        [NSString stringWithFormat:@"%@, %.0f Hz, %lu ch, %.3f s = %.3f s song + %.2f s tail; decoded %+.1f ms%@", kind, decoded.rate, (unsigned long)decoded.channels,
                                   written / rate, seconds, tail, lengthMs, isVorbis ? [NSString stringWithFormat:@", last granule %lld", granule] : @""]);
  AVAudioPCMBuffer *played = [GPMixRenderer renderMidi:midi bankURL:bankURL mix:@{} seconds:written / rate sampleRate:rate error:&error];
  AVAudioFramePosition frames = MIN(decoded.frames, (AVAudioFramePosition)played.frameLength);
  double fileDb = RmsDb(decoded.left.bytes, decoded.right.bytes, frames);
  double playedDb = RmsDb(played.floatChannelData[0], played.floatChannelData[1], frames);
  float difference = 0;
  for (AVAudioFramePosition frame = 0; frame < frames; frame++) {
    difference = MAX(difference, fabsf(((const float *)decoded.left.bytes)[frame] - played.floatChannelData[0][frame]));
  }
  BOOL isPcm = ![@[ @"mp3", @"ogg" ] containsObject:settings[@"format"]];
  double bitDepth = [settings[@"bitDepth"] doubleValue];
  BOOL isLevel = fileDb > -60 && (isPcm ? fabs(fileDb - playedDb) < 0.01 && difference <= 1.01 / pow(2, bitDepth - 1) : fabs(fileDb - playedDb) < 0.5);
  Check(isLevel, [name stringByAppendingString:@" level"],
        [NSString stringWithFormat:@"RMS %.2f dBFS, playback's render %.2f dBFS (%+.3f dB)%@", fileDb, playedDb, fileDb - playedDb,
                                   isPcm ? [NSString stringWithFormat:@", largest sample difference %.1e", difference] : @""]);
}

/** A reverb on the track keeps the tail ringing longer than the dry chord's. */
static void CheckTail(NSString *folder)
{
  NSData *chord = ChordMidi(27, @[ @45, @52, @57 ]);
  NSDictionary *settings = @{@"format" : @"wav", @"sampleRate" : @44100, @"bitDepth" : @16};
  NSDictionary *hall = @{@"tracks" : @[ @[ @{@"type" : @"reverb", @"isEnabled" : @YES, @"params" : @{@"room" : @8, @"mix" : @50}} ] ]};
  NSError *error = nil;
  AVAudioFramePosition dry = Export(chord, 1, @{}, settings, [NSURL fileURLWithPath:[folder stringByAppendingPathComponent:@"tail-dry.wav"]], &error);
  AVAudioFramePosition wet = Export(chord, 1, hall, settings, [NSURL fileURLWithPath:[folder stringByAppendingPathComponent:@"tail-reverb.wav"]], &error);
  Check(dry > 44100 && wet > dry + 22050, @"tail", [NSString stringWithFormat:@"after a 1 s chord: %.2f s dry, %.2f s with a hall reverb (until 0.5 s of silence)", dry / 44100.0 - 1, wet / 44100.0 - 1]);
}

static void CheckCancel(NSData *midi, double seconds, NSString *folder)
{
  NSURL *url = [NSURL fileURLWithPath:[folder stringByAppendingPathComponent:@"cancelled.mp3"]];
  GPAudioFileSettings *settings = [GPAudioFileSettings settingsFrom:@{@"format" : @"mp3", @"sampleRate" : @44100, @"mp3Bitrate" : @192} error:nil];
  NSError *error = nil;
  AVAudioFramePosition written = [GPAudioExporter exportMidi:midi seconds:seconds mix:@{} bankURL:bankURL settings:settings url:url progress:^BOOL(double fraction) {
    return fraction < 0.25;
  } error:&error];
  BOOL isGone = ![[NSFileManager defaultManager] fileExistsAtPath:url.path];
  Check(written == -1 && error.code == GPAudioExportCancelledCode && isGone, @"cancel", [NSString stringWithFormat:@"stopped at a quarter: %@, file %@", error.localizedDescription, isGone ? @"removed" : @"left behind"]);
}

/** A 440 Hz sine as the audio track under a song without notes: the file holds the sine, at the track's gain. */
static void CheckAudioTrack(NSString *folder)
{
  const double rate = 44100, seconds = 2;
  AVAudioFormat *format = [[AVAudioFormat alloc] initStandardFormatWithSampleRate:rate channels:1];
  AVAudioPCMBuffer *sine = [[AVAudioPCMBuffer alloc] initWithPCMFormat:format frameCapacity:(AVAudioFrameCount)(rate * seconds)];
  for (AVAudioFrameCount index = 0; index < sine.frameCapacity; index++) {
    sine.floatChannelData[0][index] = (float)(0.5 * sin(2 * M_PI * 440 * index / rate));
  }
  sine.frameLength = sine.frameCapacity;
  NSURL *source = [NSURL fileURLWithPath:[folder stringByAppendingPathComponent:@"audio-track-sine.wav"]];
  AVAudioFile *file = [[AVAudioFile alloc] initForWriting:source settings:@{AVFormatIDKey : @(kAudioFormatLinearPCM), AVSampleRateKey : @(rate), AVNumberOfChannelsKey : @1} error:nil];
  [file writeFromBuffer:sine error:nil];
  file = nil;
  NSString *assetId = [GPAudioAssets storeFileAtURL:source error:nil];
  NSDictionary *audio = @{@"assetId" : assetId ?: @"", @"runs" : @[ @{@"atSeconds" : @0, @"fromSeconds" : @0, @"toSeconds" : @(seconds), @"rate" : @1} ], @"gain" : @1, @"detuneCents" : @0};
  GPAudioFileSettings *settings = [GPAudioFileSettings settingsFrom:@{@"format" : @"wav", @"sampleRate" : @44100, @"bitDepth" : @16} error:nil];
  NSURL *url = [NSURL fileURLWithPath:[folder stringByAppendingPathComponent:@"audio-track.wav"]];
  NSError *error = nil;
  AVAudioFramePosition written = [GPAudioExporter exportMidi:ChordMidi(0, @[]) seconds:seconds mix:@{} audioTrack:audio bankURL:bankURL settings:settings url:url progress:^BOOL(double fraction) {
    return YES;
  } error:&error];
  AVAudioFile *exported = written > 0 ? [[AVAudioFile alloc] initForReading:url commonFormat:AVAudioPCMFormatFloat32 interleaved:NO error:&error] : nil;
  AVAudioPCMBuffer *buffer = exported == nil ? nil : [[AVAudioPCMBuffer alloc] initWithPCMFormat:exported.processingFormat frameCapacity:(AVAudioFrameCount)exported.length];
  BOOL isRead = buffer != nil && [exported readIntoBuffer:buffer error:&error];
  double peakHz = isRead ? DominantFrequency(buffer, 0.5) : 0;
  double level = isRead ? Db(Power(buffer, 0.5, 1.5)) / 2 : -200;
  Check(isRead && fabs(peakHz - 440) < 6 && level > -20, @"audio track",
        [NSString stringWithFormat:@"a 440 Hz sine under a song without notes: %.1f Hz, %.1f dB in the file%@", peakHz, level, isRead ? @"" : [@", " stringByAppendingString:error.localizedDescription ?: @"not written"]]);
}

static void CheckSettings(void)
{
  NSError *error = nil;
  BOOL isRefused = [GPAudioFileSettings settingsFrom:@{@"format" : @"wma", @"sampleRate" : @44100} error:&error] == nil &&
                   [GPAudioFileSettings settingsFrom:@{@"format" : @"wav", @"sampleRate" : @22050} error:nil] == nil &&
                   [GPAudioFileSettings settingsFrom:@{@"format" : @"mp3", @"sampleRate" : @44100, @"mp3Bitrate" : @100} error:nil] == nil &&
                   [GPAudioFileSettings settingsFrom:@{@"format" : @"ogg", @"sampleRate" : @48000, @"oggQuality" : @6.5} error:nil] == nil;
  Check(isRefused, @"settings", @"an unknown format, sample rate, bit rate or quality is refused");
}

int main(int argc, const char *argv[])
{
  @autoreleasepool {
    if (argc < 5) {
      fprintf(stderr, "usage: export-check <bank.sf2> <song.mid> <song seconds> <out dir>\n");
      return 2;
    }
    bankURL = [NSURL fileURLWithPath:[NSString stringWithUTF8String:argv[1]]];
    NSData *song = [NSData dataWithContentsOfFile:[NSString stringWithUTF8String:argv[2]]];
    double seconds = atof(argv[3]);
    NSString *folder = [NSString stringWithUTF8String:argv[4]];
    NSArray<NSArray *> *formats = @[
      @[ @"WAV 16-bit 44.1 kHz", @"song-16.wav", @{@"format" : @"wav", @"sampleRate" : @44100, @"bitDepth" : @16}, @0 ],
      @[ @"WAV 24-bit 48 kHz", @"song-24.wav", @{@"format" : @"wav", @"sampleRate" : @48000, @"bitDepth" : @24}, @0 ],
      @[ @"AIFF 16-bit 48 kHz", @"song-16.aiff", @{@"format" : @"aiff", @"sampleRate" : @48000, @"bitDepth" : @16}, @0 ],
      @[ @"AIFF 24-bit 44.1 kHz", @"song-24.aiff", @{@"format" : @"aiff", @"sampleRate" : @44100, @"bitDepth" : @24}, @0 ],
      @[ @"FLAC 16-bit 44.1 kHz", @"song-16.flac", @{@"format" : @"flac", @"sampleRate" : @44100, @"bitDepth" : @16}, @0 ],
      @[ @"FLAC 24-bit 48 kHz", @"song-24.flac", @{@"format" : @"flac", @"sampleRate" : @48000, @"bitDepth" : @24}, @0 ],
      @[ @"MP3 192 kbps", @"song-192.mp3", @{@"format" : @"mp3", @"sampleRate" : @44100, @"mp3Bitrate" : @192}, @5 ],
      @[ @"MP3 320 kbps 48 kHz", @"song-320.mp3", @{@"format" : @"mp3", @"sampleRate" : @48000, @"mp3Bitrate" : @320}, @5 ],
      @[ @"MP3 VBR V2", @"song-v2.mp3", @{@"format" : @"mp3", @"sampleRate" : @44100, @"mp3Bitrate" : @0}, @5 ],
      @[ @"Ogg Vorbis q6", @"song-q6.ogg", @{@"format" : @"ogg", @"sampleRate" : @44100, @"oggQuality" : @6}, @0 ],
      @[ @"Ogg Vorbis q10 48 kHz", @"song-q10.ogg", @{@"format" : @"ogg", @"sampleRate" : @48000, @"oggQuality" : @10}, @0 ],
    ];
    CheckSettings();
    for (NSArray *format in formats) {
      NSURL *url = [NSURL fileURLWithPath:[folder stringByAppendingPathComponent:format[1]]];
      CheckFormat(song, seconds, format[2], format[0], url, [format[3] doubleValue]);
    }
    CheckTail(folder);
    CheckCancel(song, seconds, folder);
    CheckAudioTrack(folder);
    printf("%s: %d failed (files in %s)\n", failures == 0 ? "OK" : "FAILED", failures, folder.UTF8String);
  }
  return failures == 0 ? 0 : 1;
}
