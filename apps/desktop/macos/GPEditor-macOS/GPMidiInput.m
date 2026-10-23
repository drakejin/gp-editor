// MIDI input for note entry (CoreMIDI, a free system API): lists the MIDI sources (keyboards, MIDI guitars, virtual
// sources of other apps), listens to the ones JS names, and forwards note-on / note-off messages as "midiNote" events
// ({on, channel, key, velocity}); "midiSourcesChanged" tells JS that a device came or went. JS checks every value (the
// messages come from outside the app) and keeps the user's choice in user defaults through -saveSettings. The App
// Sandbox needs no entitlement for this: its base profile lets apps reach the MIDI server.

#import <CoreMIDI/CoreMIDI.h>
#import <React/RCTBridgeModule.h>
#import <React/RCTEventEmitter.h>
#import <os/log.h>

static NSString *const kNoteEvent = @"midiNote";
static NSString *const kSourcesChangedEvent = @"midiSourcesChanged";
static NSString *const kSettingsDefault = @"GPMidiInputSettings";

/** Universal MIDI Packet words per message, by message type (the packet's top 4 bits). */
static const UInt32 kUmpWordCounts[16] = {1, 1, 1, 2, 2, 4, 1, 1, 2, 2, 2, 3, 3, 4, 4, 4};
static const UInt32 kUmpMidi1ChannelVoice = 0x2;
static const UInt8 kNoteOff = 0x80;
static const UInt8 kNoteOn = 0x90;

@interface GPMidiInput : RCTEventEmitter <RCTBridgeModule>
@end

@implementation GPMidiInput {
  MIDIClientRef _client;
  MIDIPortRef _port;
  NSMutableSet<NSNumber *> *_listened;
  BOOL _hasListeners;
}

RCT_EXPORT_MODULE();

+ (BOOL)requiresMainQueueSetup
{
  return NO;
}

/** CoreMIDI's client is made and used on the main queue; its notifications arrive on the main run loop. */
- (dispatch_queue_t)methodQueue
{
  return dispatch_get_main_queue();
}

- (NSArray<NSString *> *)supportedEvents
{
  return @[ kNoteEvent, kSourcesChangedEvent ];
}

- (void)startObserving
{
  _hasListeners = YES;
}

- (void)stopObserving
{
  _hasListeners = NO;
}

- (void)invalidate
{
  if (_client != 0) {
    MIDIClientDispose(_client);
    _client = 0;
    _port = 0;
  }
  [super invalidate];
}

- (void)emit:(NSString *)name body:(id)body
{
  if (_hasListeners) {
    [self sendEventWithName:name body:body];
  }
}

/** The client and its input port, made once; NO when CoreMIDI refuses (no MIDI server). */
- (BOOL)ensureClient
{
  if (_port != 0) {
    return YES;
  }
  __weak GPMidiInput *weakSelf = self;
  OSStatus status = MIDIClientCreateWithBlock(CFSTR("GP Editor"), &_client, ^(const MIDINotification *message) {
    if (message->messageID == kMIDIMsgSetupChanged) {
      [weakSelf emit:kSourcesChangedEvent body:@{}];
    }
  });
  if (status != noErr) {
    os_log_error(OS_LOG_DEFAULT, "GPMidiInput: MIDIClientCreate failed (%d)", (int)status);
    return NO;
  }
  status = MIDIInputPortCreateWithProtocol(_client, CFSTR("GP Editor input"), kMIDIProtocol_1_0, &_port, ^(const MIDIEventList *list, void *source) {
    [weakSelf receive:list];
  });
  if (status != noErr) {
    os_log_error(OS_LOG_DEFAULT, "GPMidiInput: MIDIInputPortCreate failed (%d)", (int)status);
    MIDIClientDispose(_client);
    _client = 0;
    return NO;
  }
  _listened = [NSMutableSet set];
  return YES;
}

/** Runs on CoreMIDI's thread: picks the MIDI 1.0 note messages out of the packets and sends them on from the main queue. */
- (void)receive:(const MIDIEventList *)list
{
  NSMutableArray<NSDictionary *> *notes = [NSMutableArray array];
  const MIDIEventPacket *packet = &list->packet[0];
  for (UInt32 p = 0; p < list->numPackets; p++) {
    UInt32 index = 0;
    while (index < packet->wordCount) {
      UInt32 word = packet->words[index];
      UInt32 type = word >> 28;
      UInt8 status = (word >> 16) & 0xF0;
      if (type == kUmpMidi1ChannelVoice && (status == kNoteOn || status == kNoteOff)) {
        UInt8 velocity = word & 0x7F;
        BOOL isOn = status == kNoteOn && velocity > 0;
        [notes addObject:@{@"on" : @(isOn), @"channel" : @((word >> 16) & 0x0F), @"key" : @((word >> 8) & 0x7F), @"velocity" : @(velocity)}];
      }
      index += kUmpWordCounts[type];
    }
    packet = MIDIEventPacketNext(packet);
  }
  if (notes.count == 0) {
    return;
  }
  dispatch_async(dispatch_get_main_queue(), ^{
    for (NSDictionary *note in notes) {
      [self emit:kNoteEvent body:note];
    }
  });
}

static NSString *SourceName(MIDIEndpointRef source)
{
  CFStringRef name = NULL;
  if (MIDIObjectGetStringProperty(source, kMIDIPropertyDisplayName, &name) != noErr || name == NULL) {
    return @"MIDI source";
  }
  return (__bridge_transfer NSString *)name;
}

/** Every MIDI source now: [{id (CoreMIDI's unique id, kept across launches), name}]. */
RCT_EXPORT_METHOD(sources : (RCTPromiseResolveBlock)resolve reject : (RCTPromiseRejectBlock)reject)
{
  if (![self ensureClient]) {
    reject(@"midi", @"MIDI is not available on this Mac.", nil);
    return;
  }
  NSMutableArray<NSDictionary *> *sources = [NSMutableArray array];
  ItemCount count = MIDIGetNumberOfSources();
  for (ItemCount i = 0; i < count; i++) {
    MIDIEndpointRef source = MIDIGetSource(i);
    SInt32 uniqueId = 0;
    if (source != 0 && MIDIObjectGetIntegerProperty(source, kMIDIPropertyUniqueID, &uniqueId) == noErr) {
      [sources addObject:@{@"id" : @(uniqueId), @"name" : SourceName(source)}];
    }
  }
  resolve(sources);
}

/** Listens to exactly these sources (unique ids); ids no source has any more are skipped. Resolves how many it listens to. */
RCT_EXPORT_METHOD(listen : (NSArray<NSNumber *> *)sourceIds resolve : (RCTPromiseResolveBlock)resolve reject : (RCTPromiseRejectBlock)reject)
{
  if (![self ensureClient]) {
    reject(@"midi", @"MIDI is not available on this Mac.", nil);
    return;
  }
  [self disconnectAll];
  for (NSNumber *sourceId in sourceIds) {
    MIDIObjectRef object = 0;
    MIDIObjectType type = kMIDIObjectType_Other;
    if ([sourceId isKindOfClass:[NSNumber class]] && MIDIObjectFindByUniqueID(sourceId.intValue, &object, &type) == noErr &&
        type == kMIDIObjectType_Source && MIDIPortConnectSource(_port, (MIDIEndpointRef)object, NULL) == noErr) {
      [_listened addObject:@(sourceId.intValue)];
    }
  }
  resolve(@(_listened.count));
}

/** Stops listening to every source. */
RCT_EXPORT_METHOD(stop : (RCTPromiseResolveBlock)resolve reject : (RCTPromiseRejectBlock)reject)
{
  [self disconnectAll];
  resolve(nil);
}

- (void)disconnectAll
{
  for (NSNumber *sourceId in _listened) {
    MIDIObjectRef object = 0;
    MIDIObjectType type = kMIDIObjectType_Other;
    if (MIDIObjectFindByUniqueID(sourceId.intValue, &object, &type) == noErr && type == kMIDIObjectType_Source) {
      MIDIPortDisconnectSource(_port, (MIDIEndpointRef)object);
    }
  }
  [_listened removeAllObjects];
}

/** The MIDI input settings JS saved (its own JSON, checked by JS), or null. */
RCT_EXPORT_METHOD(loadSettings : (RCTPromiseResolveBlock)resolve reject : (RCTPromiseRejectBlock)reject)
{
  NSString *json = [[NSUserDefaults standardUserDefaults] stringForKey:kSettingsDefault];
  resolve(json ?: (id)[NSNull null]);
}

RCT_EXPORT_METHOD(saveSettings : (NSString *)json resolve : (RCTPromiseResolveBlock)resolve reject : (RCTPromiseRejectBlock)reject)
{
  [[NSUserDefaults standardUserDefaults] setObject:json forKey:kSettingsDefault];
  resolve(nil);
}

@end
