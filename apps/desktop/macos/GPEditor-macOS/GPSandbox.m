#import "GPSandbox.h"

#import <Security/Security.h>

static BOOL ReadIsSandboxed(void)
{
  SecTaskRef task = SecTaskCreateFromSelf(kCFAllocatorDefault);
  if (task == NULL) {
    return YES;
  }
  CFTypeRef value = SecTaskCopyValueForEntitlement(task, CFSTR("com.apple.security.app-sandbox"), NULL);
  CFRelease(task);
  BOOL isSandboxed = value != NULL && CFGetTypeID(value) == CFBooleanGetTypeID() && CFBooleanGetValue((CFBooleanRef)value);
  if (value != NULL) {
    CFRelease(value);
  }
  return isSandboxed;
}

BOOL GPIsSandboxed(void)
{
  static BOOL isSandboxed;
  static dispatch_once_t once;
  dispatch_once(&once, ^{
    isSandboxed = ReadIsSandboxed();
  });
  return isSandboxed;
}
