// GP Editor ▸ Settings…: the settings JS keeps in user defaults (its own JSON, checked by JS — src/lib/app-settings.ts),
// the system's languages JS resolves "System" against, and the language JS applied. Applying it stores the language for
// the menus and native panels (GPAppStrings.m, live) and, for a chosen language, the app's AppleLanguages, so macOS's own
// menu items (Services, Window, Quit …) follow at the next start; "System" removes that override.
// GP Editor ▸ Settings… (⌘,) arrives as GPEditorSettingsCommandNotification and goes to JS as "settingsRequested".
// QA: outside the App Sandbox, GPEDITOR_QA_KEEP_APPLE_LANGUAGES=1 leaves AppleLanguages alone — QA copies of every
// branch share the unsandboxed defaults domain, and another copy starting meanwhile must keep its menus' language.

#import <React/RCTBridgeModule.h>
#import <React/RCTEventEmitter.h>

#import "GPAppStrings.h"
#import "GPEditorNotifications.h"
#import "GPSandbox.h"

static NSString *const kSettingsDefault = @"GPEditorAppSettings";
static NSString *const kSettingsRequestedEvent = @"settingsRequested";
static NSString *const kQAKeepAppleLanguages = @"GPEDITOR_QA_KEEP_APPLE_LANGUAGES";

@interface GPAppSettings : RCTEventEmitter <RCTBridgeModule>
@end

@implementation GPAppSettings {
  BOOL _hasListeners;
}

RCT_EXPORT_MODULE();

+ (BOOL)requiresMainQueueSetup
{
  return NO;
}

- (instancetype)init
{
  if ((self = [super init])) {
    [[NSNotificationCenter defaultCenter] addObserver:self selector:@selector(onSettingsCommand:) name:GPEditorSettingsCommandNotification object:nil];
  }
  return self;
}

- (void)dealloc
{
  [[NSNotificationCenter defaultCenter] removeObserver:self];
}

- (NSArray<NSString *> *)supportedEvents
{
  return @[ kSettingsRequestedEvent ];
}

- (void)startObserving
{
  _hasListeners = YES;
}

- (void)stopObserving
{
  _hasListeners = NO;
}

- (void)onSettingsCommand:(NSNotification *)note
{
  if (_hasListeners) {
    [self sendEventWithName:kSettingsRequestedEvent body:@{}];
  }
}

/** { settings: the JSON JS saved or null, systemLanguages: ["ko-KR", …] }. */
RCT_EXPORT_METHOD(load : (RCTPromiseResolveBlock)resolve reject : (RCTPromiseRejectBlock)reject)
{
  NSString *json = [[NSUserDefaults standardUserDefaults] stringForKey:kSettingsDefault];
  resolve(@{@"settings" : json ?: (id)[NSNull null], @"systemLanguages" : GPSystemLanguages()});
}

RCT_EXPORT_METHOD(save : (NSString *)json resolve : (RCTPromiseResolveBlock)resolve reject : (RCTPromiseRejectBlock)reject)
{
  [[NSUserDefaults standardUserDefaults] setObject:json forKey:kSettingsDefault];
  resolve(nil);
}

/**
 * The language JS shows now ("en", "ko") and its setting ("system", "en", "ko"). Resolves whether macOS's own menu
 * items need a restart to follow (the process started in another language).
 */
RCT_EXPORT_METHOD(applyLanguage : (NSString *)language setting : (NSString *)setting resolve : (RCTPromiseResolveBlock)resolve reject : (RCTPromiseRejectBlock)reject)
{
  if (![@[ @"en", @"ko" ] containsObject:language] || ![@[ @"system", @"en", @"ko" ] containsObject:setting]) {
    reject(@"bad_language", @"Unknown language", nil);
    return;
  }
  NSUserDefaults *defaults = [NSUserDefaults standardUserDefaults];
  BOOL changed = ![[defaults stringForKey:GPAppLanguageDefaultsKey] isEqualToString:language];
  [defaults setObject:language forKey:GPAppLanguageDefaultsKey];
  BOOL keepsAppleLanguages = NSProcessInfo.processInfo.environment[kQAKeepAppleLanguages].length > 0 && !GPIsSandboxed();
  if (keepsAppleLanguages) {
    // QA only (see the top of the file).
  } else if ([setting isEqualToString:@"system"]) {
    [defaults removeObjectForKey:@"AppleLanguages"];
  } else {
    [defaults setObject:@[ setting ] forKey:@"AppleLanguages"];
  }
  if (changed) {
    dispatch_async(dispatch_get_main_queue(), ^{
      [[NSNotificationCenter defaultCenter] postNotificationName:GPEditorLanguageChangedNotification object:nil];
    });
  }
  NSString *launched = [NSBundle mainBundle].preferredLocalizations.firstObject ?: @"en";
  resolve(@{@"needsRestart" : @(![launched hasPrefix:language])});
}

@end
