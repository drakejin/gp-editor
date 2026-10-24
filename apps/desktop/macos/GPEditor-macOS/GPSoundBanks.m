#import "GPSoundBanks.h"
#import "GPAppStrings.h"

static NSString *const kBundledBankId = @"generaluser";
static NSString *const kSystemBankId = @"macos";
/** Ids of banks the user added: this prefix and the file name in the bank folder. */
static NSString *const kUserBankPrefix = @"file:";
static NSString *const kSelectedBankDefault = @"GPEditorSoundBank";
static NSString *const kSystemBankPath = @"/System/Library/Components/CoreAudio.component/Contents/Resources/gs_instruments.dls";

@interface GPSoundBank : NSObject
@property (nonatomic, copy) NSString *bankId;
@property (nonatomic, copy) NSString *name;
@property (nonatomic, strong) NSURL *url;
@property (nonatomic) BOOL isRemovable;
@end

@implementation GPSoundBank
@end

@implementation GPSoundBanks

+ (GPSoundBank *)bankWithId:(NSString *)bankId name:(NSString *)name url:(NSURL *)url isRemovable:(BOOL)isRemovable
{
  GPSoundBank *bank = [GPSoundBank new];
  bank.bankId = bankId;
  bank.name = name;
  bank.url = url;
  bank.isRemovable = isRemovable;
  return bank;
}

/** Application Support/GPEditor/SoundFonts inside the sandbox container, created when missing. */
+ (nullable NSURL *)userBankFolder
{
  NSFileManager *files = [NSFileManager defaultManager];
  NSURL *support = [files URLForDirectory:NSApplicationSupportDirectory inDomain:NSUserDomainMask appropriateForURL:nil create:YES error:nil];
  NSURL *folder = [support URLByAppendingPathComponent:@"GPEditor/SoundFonts" isDirectory:YES];
  if (folder == nil || ![files createDirectoryAtURL:folder withIntermediateDirectories:YES attributes:nil error:nil]) {
    return nil;
  }
  return folder;
}

+ (BOOL)isBankFile:(NSURL *)url
{
  NSString *extension = url.pathExtension.lowercaseString;
  return [extension isEqualToString:@"sf2"] || [extension isEqualToString:@"dls"];
}

/** Bundled first (the default), then macOS, then the user's banks by name. */
+ (NSArray<GPSoundBank *> *)availableBanks
{
  NSMutableArray<GPSoundBank *> *banks = [NSMutableArray array];
  NSString *bundled = [[NSBundle mainBundle] pathForResource:@"GeneralUser-GS" ofType:@"sf2" inDirectory:@"SoundFonts"];
  if (bundled != nil) {
    [banks addObject:[self bankWithId:kBundledBankId name:@"GeneralUser GS" url:[NSURL fileURLWithPath:bundled] isRemovable:NO]];
  }
  if ([[NSFileManager defaultManager] fileExistsAtPath:kSystemBankPath]) {
    [banks addObject:[self bankWithId:kSystemBankId name:@"macOS (Roland GS)" url:[NSURL fileURLWithPath:kSystemBankPath] isRemovable:NO]];
  }
  NSURL *folder = [self userBankFolder];
  NSArray<NSURL *> *files = folder == nil ? @[] : [[NSFileManager defaultManager] contentsOfDirectoryAtURL:folder includingPropertiesForKeys:nil options:NSDirectoryEnumerationSkipsHiddenFiles error:nil];
  NSArray<NSURL *> *sorted = [files sortedArrayUsingComparator:^NSComparisonResult(NSURL *a, NSURL *b) {
    return [a.lastPathComponent localizedCaseInsensitiveCompare:b.lastPathComponent];
  }];
  for (NSURL *file in sorted) {
    if ([self isBankFile:file]) {
      NSString *bankId = [kUserBankPrefix stringByAppendingString:file.lastPathComponent];
      [banks addObject:[self bankWithId:bankId name:file.lastPathComponent.stringByDeletingPathExtension url:file isRemovable:YES]];
    }
  }
  return banks;
}

+ (nullable GPSoundBank *)selectedBankIn:(NSArray<GPSoundBank *> *)banks
{
  NSString *selectedId = [[NSUserDefaults standardUserDefaults] stringForKey:kSelectedBankDefault];
  for (GPSoundBank *bank in banks) {
    if ([bank.bankId isEqualToString:selectedId]) {
      return bank;
    }
  }
  return banks.firstObject;
}

+ (NSDictionary *)state
{
  NSArray<GPSoundBank *> *banks = [self availableBanks];
  NSMutableArray *list = [NSMutableArray array];
  for (GPSoundBank *bank in banks) {
    [list addObject:@{@"id" : bank.bankId, @"name" : bank.name, @"isRemovable" : @(bank.isRemovable)}];
  }
  return @{@"banks" : list, @"selectedId" : [self selectedBankIn:banks].bankId ?: @""};
}

+ (BOOL)selectBankWithId:(NSString *)bankId
{
  for (GPSoundBank *bank in [self availableBanks]) {
    if ([bank.bankId isEqualToString:bankId]) {
      [[NSUserDefaults standardUserDefaults] setObject:bankId forKey:kSelectedBankDefault];
      return YES;
    }
  }
  return NO;
}

+ (NSError *)errorWithMessage:(NSString *)message
{
  return [NSError errorWithDomain:@"GPSoundBanks" code:1 userInfo:@{NSLocalizedDescriptionKey : message}];
}

+ (nullable NSString *)addBankFromURL:(NSURL *)url error:(NSError **)error
{
  NSURL *folder = [self userBankFolder];
  if (![self isBankFile:url] || folder == nil) {
    if (error != NULL) {
      *error = [self errorWithMessage:folder == nil ? GPLocalizedString(@"The sound bank folder could not be created") : GPLocalizedString(@"Choose a SoundFont (.sf2) or DLS (.dls) file")];
    }
    return nil;
  }
  NSURL *destination = [folder URLByAppendingPathComponent:url.lastPathComponent];
  NSFileManager *files = [NSFileManager defaultManager];
  [files removeItemAtURL:destination error:nil];
  if (![files copyItemAtURL:url toURL:destination error:error]) {
    return nil;
  }
  NSString *bankId = [kUserBankPrefix stringByAppendingString:url.lastPathComponent];
  [self selectBankWithId:bankId];
  return bankId;
}

+ (BOOL)removeBankWithId:(NSString *)bankId error:(NSError **)error
{
  for (GPSoundBank *bank in [self availableBanks]) {
    if (bank.isRemovable && [bank.bankId isEqualToString:bankId]) {
      NSUserDefaults *defaults = [NSUserDefaults standardUserDefaults];
      if ([[defaults stringForKey:kSelectedBankDefault] isEqualToString:bankId]) {
        [defaults removeObjectForKey:kSelectedBankDefault];
      }
      return [[NSFileManager defaultManager] removeItemAtURL:bank.url error:error];
    }
  }
  if (error != NULL) {
    *error = [self errorWithMessage:GPLocalizedString(@"Only sound banks you added can be removed")];
  }
  return NO;
}

+ (nullable NSURL *)selectedBankURL
{
  return [self selectedBankIn:[self availableBanks]].url;
}

@end
