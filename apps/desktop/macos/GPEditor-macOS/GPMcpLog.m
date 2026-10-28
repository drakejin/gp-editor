#import "GPMcpLog.h"

#import "GPEditorNotifications.h"

const NSUInteger GPMcpLogCapacity = 1000;
const unsigned long long GPMcpLogFileLimit = 1024 * 1024;
/** Longest field kept (a client's name, a request, an outcome): what a client sends cannot grow the log without end. */
static const NSUInteger kMaxFieldLength = 200;
/** The log window hears of new entries at most this often (a flood of requests must not stall the window). */
static const double kNotifySeconds = 0.2;

/** Formatters made once (on the main thread, where entries are made). */
static NSDateFormatter *GPMcpFormatter(BOOL isFull)
{
  static NSDateFormatter *full;
  static NSDateFormatter *time;
  static dispatch_once_t once;
  dispatch_once(&once, ^{
    full = [NSDateFormatter new];
    full.locale = [NSLocale localeWithLocaleIdentifier:@"en_US_POSIX"];
    full.dateFormat = @"yyyy-MM-dd HH:mm:ss.SSS";
    time = [NSDateFormatter new];
    time.locale = full.locale;
    time.dateFormat = @"HH:mm:ss.SSS";
  });
  return isFull ? full : time;
}

/** A field as kept: control characters (a line break could forge a line of the file) as spaces, at most 200 characters. */
static NSString *GPMcpField(NSString *text)
{
  NSString *line = [[text componentsSeparatedByCharactersInSet:[NSCharacterSet controlCharacterSet]] componentsJoinedByString:@" "];
  return line.length <= kMaxFieldLength ? line : [[line substringToIndex:kMaxFieldLength - 1] stringByAppendingString:@"…"];
}

@implementation GPMcpLogEntry

- (instancetype)initWithSerial:(NSInteger)serial client:(NSString *)client request:(NSString *)request durationMs:(NSInteger)durationMs outcome:(NSString *)outcome isError:(BOOL)isError isEvent:(BOOL)isEvent
{
  if (self = [super init]) {
    _serial = serial;
    _date = [NSDate date];
    _client = GPMcpField(client);
    _request = GPMcpField(request);
    _durationMs = durationMs;
    _outcome = GPMcpField(outcome);
    _isError = isError;
    _isEvent = isEvent;
    _timeText = [GPMcpFormatter(NO) stringFromDate:_date];
    NSString *when = [GPMcpFormatter(YES) stringFromDate:_date];
    _line = isEvent ? [NSString stringWithFormat:@"%@  [server]  %@", when, _request]
                    : [NSString stringWithFormat:@"%@  %@  %@  %ld ms  %@", when, _client, _request, (long)durationMs, _outcome];
  }
  return self;
}

@end

@implementation GPMcpLog {
  NSArray<GPMcpLogEntry *> *_entries;
  NSInteger _nextSerial;
  dispatch_queue_t _fileQueue;
  /** A change notification is on its way (main thread). */
  BOOL _isNotifying;
}

+ (instancetype)shared
{
  static GPMcpLog *log;
  static dispatch_once_t once;
  dispatch_once(&once, ^{
    log = [GPMcpLog new];
  });
  return log;
}

- (instancetype)init
{
  if (self = [super init]) {
    _entries = @[];
    _fileQueue = dispatch_queue_create("com.drakejin.gpeditor.mcp-log", DISPATCH_QUEUE_SERIAL);
    NSURL *support = [[NSFileManager defaultManager] URLForDirectory:NSApplicationSupportDirectory inDomain:NSUserDomainMask appropriateForURL:nil create:YES error:nil];
    _fileURL = [[support URLByAppendingPathComponent:@"GPEditor" isDirectory:YES] URLByAppendingPathComponent:@"mcp-server.log"];
  }
  return self;
}

- (NSArray<GPMcpLogEntry *> *)entries
{
  return _entries;
}

/** On the main thread: the entry joins the list (the oldest go past the capacity) and the file. */
- (void)append:(NSString *)client request:(NSString *)request durationMs:(NSInteger)durationMs outcome:(NSString *)outcome isError:(BOOL)isError isEvent:(BOOL)isEvent
{
  dispatch_async(dispatch_get_main_queue(), ^{
    GPMcpLogEntry *entry = [[GPMcpLogEntry alloc] initWithSerial:self->_nextSerial++ client:client request:request durationMs:durationMs outcome:outcome isError:isError isEvent:isEvent];
    NSArray<GPMcpLogEntry *> *entries = [self->_entries arrayByAddingObject:entry];
    self->_entries = entries.count > GPMcpLogCapacity ? [entries subarrayWithRange:NSMakeRange(entries.count - GPMcpLogCapacity, GPMcpLogCapacity)] : entries;
    [self writeLine:entry.line];
    [self notifyChange];
  });
}

/** On the main thread: one change notification for what changed within kNotifySeconds. */
- (void)notifyChange
{
  if (_isNotifying) {
    return;
  }
  _isNotifying = YES;
  dispatch_after(dispatch_time(DISPATCH_TIME_NOW, (int64_t)(kNotifySeconds * NSEC_PER_SEC)), dispatch_get_main_queue(), ^{
    self->_isNotifying = NO;
    [[NSNotificationCenter defaultCenter] postNotificationName:GPEditorMcpLogChangedNotification object:nil];
  });
}

- (void)addRequestFrom:(NSString *)client request:(NSString *)request durationMs:(NSInteger)durationMs outcome:(NSString *)outcome isError:(BOOL)isError
{
  [self append:client request:request durationMs:durationMs outcome:outcome isError:isError isEvent:NO];
}

- (void)addEvent:(NSString *)text isError:(BOOL)isError
{
  [self append:@"" request:text durationMs:-1 outcome:@"" isError:isError isEvent:YES];
}

- (void)clear
{
  dispatch_async(dispatch_get_main_queue(), ^{
    self->_entries = @[];
    [self notifyChange];
  });
}

- (NSString *)text
{
  NSMutableString *text = [NSMutableString string];
  for (GPMcpLogEntry *entry in _entries) {
    [text appendFormat:@"%@\n", entry.line];
  }
  return text;
}

/** Appends a line to the file, first moving a full file to mcp-server.1.log. */
- (void)writeLine:(NSString *)line
{
  NSURL *url = self.fileURL;
  dispatch_async(_fileQueue, ^{
    NSFileManager *files = [NSFileManager defaultManager];
    [files createDirectoryAtURL:url.URLByDeletingLastPathComponent withIntermediateDirectories:YES attributes:nil error:nil];
    unsigned long long size = [[files attributesOfItemAtPath:url.path error:nil] fileSize];
    if (size > GPMcpLogFileLimit) {
      NSURL *previous = [url.URLByDeletingPathExtension URLByAppendingPathExtension:@"1.log"];
      [files removeItemAtURL:previous error:nil];
      [files moveItemAtURL:url toURL:previous error:nil];
    }
    if (![files fileExistsAtPath:url.path]) {
      [files createFileAtPath:url.path contents:nil attributes:@{NSFilePosixPermissions : @0600}];
    }
    NSFileHandle *handle = [NSFileHandle fileHandleForWritingAtPath:url.path];
    [handle seekToEndOfFile];
    [handle writeData:[[line stringByAppendingString:@"\n"] dataUsingEncoding:NSUTF8StringEncoding]];
    [handle closeFile];
  });
}

@end
