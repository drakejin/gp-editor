#import "GPMcpSettings.h"

#import "GPEditorNotifications.h"
#import "GPSandbox.h"

const NSInteger GPMcpDefaultPort = 18256;
const NSInteger GPMcpMinPort = 1024;
const NSInteger GPMcpMaxPort = 65535;

static NSString *const kEnabledKey = @"GPEditorMcpEnabled";
static NSString *const kPortKey = @"GPEditorMcpPort";
static NSString *const kShowsInMenuBarKey = @"GPEditorMcpShowInMenuBar";
static NSString *const kPortVariable = @"GPEDITOR_MCP_PORT";

@implementation GPMcpSettings

+ (NSUserDefaults *)defaults
{
  NSUserDefaults *defaults = [NSUserDefaults standardUserDefaults];
  [defaults registerDefaults:@{kEnabledKey : @YES, kPortKey : @(GPMcpDefaultPort), kShowsInMenuBarKey : @YES}];
  return defaults;
}

+ (void)changed
{
  [[NSNotificationCenter defaultCenter] postNotificationName:GPEditorMcpSettingsChangedNotification object:nil];
}

+ (BOOL)isValidPort:(NSInteger)port
{
  return port >= GPMcpMinPort && port <= GPMcpMaxPort;
}

+ (BOOL)isEnabledAtLaunch
{
  return [[self defaults] boolForKey:kEnabledKey];
}

+ (void)setIsEnabledAtLaunch:(BOOL)isEnabledAtLaunch
{
  [[self defaults] setBool:isEnabledAtLaunch forKey:kEnabledKey];
  [self changed];
}

+ (NSInteger)port
{
  NSInteger port = [[self defaults] integerForKey:kPortKey];
  return [self isValidPort:port] ? port : GPMcpDefaultPort;
}

+ (void)setPort:(NSInteger)port
{
  if ([self isValidPort:port]) {
    [[self defaults] setInteger:port forKey:kPortKey];
    [self changed];
  }
}

+ (BOOL)showsInMenuBar
{
  return [[self defaults] boolForKey:kShowsInMenuBarKey];
}

+ (void)setShowsInMenuBar:(BOOL)showsInMenuBar
{
  [[self defaults] setBool:showsInMenuBar forKey:kShowsInMenuBarKey];
  [self changed];
}

/** GPEDITOR_MCP_PORT as a valid port, outside the sandbox only; 0 otherwise. */
+ (NSInteger)overridePort
{
  NSString *value = [NSProcessInfo processInfo].environment[kPortVariable];
  NSInteger port = value.integerValue;
  return value.length > 0 && !GPIsSandboxed() && [self isValidPort:port] ? port : 0;
}

+ (BOOL)isPortOverridden
{
  return [self overridePort] != 0;
}

+ (NSInteger)effectivePort
{
  NSInteger port = [self overridePort];
  return port != 0 ? port : self.port;
}

@end
