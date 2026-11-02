// Two GP Editors at once (assets-check): each keeps its audio track's files where GPAudioAssets puts them, and one
// starting must not empty the other's — in 0.21's QA a second copy's launch removed the first one's file, so its next
// save dropped the audio track and its playback stopped. Run by run.sh (`run.sh assets`; also part of `all`).
// Usage: assets-check            — this app: a file kept, another app started (this binary with --launch), checks
//        assets-check --launch   — the other app: its launch cleanup, then a file of its own

#import <AVFoundation/AVFoundation.h>

#import "GPAudioAssets.h"

static int failures = 0;

static void Report(BOOL isOk, NSString *name, NSString *detail)
{
  printf("%s %s: %s\n", isOk ? "PASS" : "FAIL", name.UTF8String, detail.UTF8String);
  failures += isOk ? 0 : 1;
}

/** A tenth of a second of a sine as a WAV, kept by GPAudioAssets (its content made unique by `hz`); the kept file. */
static NSURL *KeepTone(double hz)
{
  const double rate = 44100;
  AVAudioFormat *format = [[AVAudioFormat alloc] initStandardFormatWithSampleRate:rate channels:1];
  AVAudioPCMBuffer *buffer = [[AVAudioPCMBuffer alloc] initWithPCMFormat:format frameCapacity:4410];
  for (AVAudioFrameCount index = 0; index < 4410; index++) {
    buffer.floatChannelData[0][index] = (float)(0.5 * sin(2 * M_PI * hz * index / rate));
  }
  buffer.frameLength = 4410;
  NSString *name = [NSString stringWithFormat:@"assets-check-%d-%.0f.wav", getpid(), hz];
  NSURL *url = [[NSURL fileURLWithPath:NSTemporaryDirectory()] URLByAppendingPathComponent:name];
  NSDictionary *settings = @{AVFormatIDKey : @(kAudioFormatLinearPCM), AVSampleRateKey : @(rate), AVNumberOfChannelsKey : @1, AVLinearPCMBitDepthKey : @16};
  AVAudioFile *file = [[AVAudioFile alloc] initForWriting:url settings:settings error:nil];
  [file writeFromBuffer:buffer error:nil];
  file = nil;
  NSString *assetId = [GPAudioAssets storeFileAtURL:url error:nil];
  [[NSFileManager defaultManager] removeItemAtURL:url error:nil];
  return assetId == nil ? nil : [GPAudioAssets URLForAssetId:assetId];
}

/** Another app starting: this binary with --launch, waited for; the file it kept. */
static NSString *RunOtherApp(const char *binary)
{
  NSTask *task = [[NSTask alloc] init];
  task.executableURL = [NSURL fileURLWithPath:[NSString stringWithUTF8String:binary]];
  task.arguments = @[ @"--launch" ];
  NSPipe *pipe = [NSPipe pipe];
  task.standardOutput = pipe;
  [task launchAndReturnError:nil];
  [task waitUntilExit];
  NSData *output = [pipe.fileHandleForReading readDataToEndOfFile];
  return [[[NSString alloc] initWithData:output encoding:NSUTF8StringEncoding] stringByTrimmingCharactersInSet:NSCharacterSet.whitespaceAndNewlineCharacterSet];
}

int main(int argc, const char *argv[])
{
  @autoreleasepool {
    if (argc > 1 && strcmp(argv[1], "--launch") == 0) {
      [GPAudioAssets cleanUpAtLaunch];
      printf("%s\n", KeepTone(660).path.UTF8String ?: "");
      return 0;
    }
    [GPAudioAssets cleanUpAtLaunch];
    NSURL *mine = KeepTone(440);
    NSFileManager *files = [NSFileManager defaultManager];
    NSString *others = RunOtherApp(argv[0]);
    Report(mine != nil && [files fileExistsAtPath:mine.path], @"another app's launch", @"this app's audio file is still there");
    Report(others.length > 0 && ![others isEqualToString:mine.path], @"the other app's file", [NSString stringWithFormat:@"kept apart: %@", others]);
    // A later launch, the other app gone: its files go, this running app's stay.
    [GPAudioAssets cleanUpAtLaunch];
    Report(others.length > 0 && ![files fileExistsAtPath:others], @"a quit app's files", @"removed at the next launch");
    Report(mine != nil && [files fileExistsAtPath:mine.path], @"a running app's files", @"kept at another launch");
    [GPAudioAssets removeAll];
    printf("%s: %d failed\n", failures == 0 ? "OK" : "FAILED", failures);
  }
  return failures == 0 ? 0 : 1;
}
