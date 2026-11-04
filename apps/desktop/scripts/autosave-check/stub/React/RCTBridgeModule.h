// The few React Native declarations GPAutosave.m uses, so scripts/autosave-check builds it with clang alone.
#import <Foundation/Foundation.h>

typedef void (^RCTPromiseResolveBlock)(id result);
typedef void (^RCTPromiseRejectBlock)(NSString *code, NSString *message, NSError *error);

@protocol RCTBridgeModule <NSObject>
@end

#define RCT_EXPORT_MODULE(...)
#define RCT_EXPORT_METHOD(method) -(void)method
