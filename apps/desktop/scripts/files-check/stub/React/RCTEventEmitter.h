// RCTEventEmitter as GPFiles.m uses it (files-check.m implements it: events are recorded, never sent).
#import <React/RCTBridgeModule.h>

@interface RCTEventEmitter : NSObject <RCTBridgeModule>
- (void)sendEventWithName:(NSString *)name body:(id)body;
- (NSArray<NSString *> *)supportedEvents;
- (void)startObserving;
- (void)stopObserving;
@end
