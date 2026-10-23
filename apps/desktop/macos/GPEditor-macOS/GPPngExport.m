// PNG export for the JS side: JS lays the score out into the PDF export's pages (src/export/), this module draws each
// page with GPCommandPainter — the code that draws the score on screen and into the PDF — into a bitmap at the chosen
// resolution and saves it as a PNG, one file per page.

#import <AppKit/AppKit.h>
#import <ImageIO/ImageIO.h>
#import <React/RCTBridgeModule.h>
#import <UniformTypeIdentifiers/UniformTypeIdentifiers.h>

#import "GPCommandPainter.h"
#import "GPSandbox.h"

/** Pixels per point: 600 dpi at most (the app offers 72, 150 and 300). */
static const double kMaxScale = 600.0 / 72.0;
/** A page's pixels at most (A4 at 300 dpi is 8.7 million); bounds the bitmap a page needs. */
static const double kMaxPixels = 100e6;
static const double kPointsPerInch = 72.0;

@interface GPPngExport : NSObject <RCTBridgeModule>
@end

@implementation GPPngExport

RCT_EXPORT_MODULE();

+ (BOOL)requiresMainQueueSetup
{
  return NO;
}

- (dispatch_queue_t)methodQueue
{
  return dispatch_get_main_queue();
}

/** The pages of { title, pages: [{ width, height, commands }] } as JSON; nil when it is anything else. */
+ (nullable NSArray<NSDictionary *> *)pagesFromJson:(NSString *)json
{
  id document = [NSJSONSerialization JSONObjectWithData:[json dataUsingEncoding:NSUTF8StringEncoding] options:0 error:nil];
  NSArray *pages = [document isKindOfClass:[NSDictionary class]] ? document[@"pages"] : nil;
  if (![pages isKindOfClass:[NSArray class]] || pages.count == 0) {
    return nil;
  }
  for (id page in pages) {
    BOOL isPage = [page isKindOfClass:[NSDictionary class]] && [page[@"commands"] isKindOfClass:[NSArray class]] &&
                  [page[@"width"] isKindOfClass:[NSNumber class]] && [page[@"height"] isKindOfClass:[NSNumber class]];
    if (!isPage) {
      return nil;
    }
  }
  return pages;
}

/** One plain file name per page, ending in .png: no folders, no hidden files (the names come from JS). */
+ (BOOL)areFileNames:(NSArray *)names forPageCount:(NSUInteger)count
{
  if (![names isKindOfClass:[NSArray class]] || names.count != count) {
    return NO;
  }
  for (id name in names) {
    BOOL isPlain = [name isKindOfClass:[NSString class]] && [name length] > 4 && ![name hasPrefix:@"."] &&
                   ![name containsString:@"/"] && ![name containsString:@":"] &&
                   [[name pathExtension] caseInsensitiveCompare:@"png"] == NSOrderedSame;
    if (!isPlain) {
      return NO;
    }
  }
  return YES;
}

/** The page's commands drawn into a bitmap of its size × scale (sRGB with alpha, transparent where nothing is drawn); the caller releases it. */
+ (nullable CGImageRef)createImageOf:(NSDictionary *)page scale:(double)scale painter:(GPCommandPainter *)painter
{
  double width = [page[@"width"] doubleValue];
  double height = [page[@"height"] doubleValue];
  size_t pixelsWide = (size_t)llround(width * scale);
  size_t pixelsHigh = (size_t)llround(height * scale);
  if (width <= 0 || height <= 0 || pixelsWide == 0 || pixelsHigh == 0 || (double)pixelsWide * (double)pixelsHigh > kMaxPixels) {
    return NULL;
  }
  CGColorSpaceRef space = CGColorSpaceCreateWithName(kCGColorSpaceSRGB);
  CGContextRef bitmap = CGBitmapContextCreate(NULL, pixelsWide, pixelsHigh, 8, 0, space, (CGBitmapInfo)kCGImageAlphaPremultipliedLast);
  CGColorSpaceRelease(space);
  if (bitmap == NULL) {
    return NULL;
  }
  CGContextClearRect(bitmap, CGRectMake(0, 0, pixelsWide, pixelsHigh));
  // Flipped like the score canvas (origin top-left, y down), the page spread over the whole pixel grid.
  CGContextTranslateCTM(bitmap, 0, pixelsHigh);
  CGContextScaleCTM(bitmap, pixelsWide / width, -(pixelsHigh / height));
  [NSGraphicsContext saveGraphicsState];
  NSGraphicsContext.currentContext = [NSGraphicsContext graphicsContextWithCGContext:bitmap flipped:YES];
  [painter drawCommands:page[@"commands"]];
  [NSGraphicsContext restoreGraphicsState];
  CGImageRef image = CGBitmapContextCreateImage(bitmap);
  CGContextRelease(bitmap);
  return image;
}

/** PNG data of the image, recording its resolution (so it prints at the paper's size). */
+ (nullable NSData *)pngDataOf:(CGImageRef)image dpi:(double)dpi
{
  NSMutableData *data = [NSMutableData data];
  CGImageDestinationRef destination = CGImageDestinationCreateWithData((__bridge CFMutableDataRef)data, (__bridge CFStringRef)UTTypePNG.identifier, 1, NULL);
  if (destination == NULL) {
    return nil;
  }
  NSDictionary *properties = @{(__bridge NSString *)kCGImagePropertyDPIWidth : @(dpi), (__bridge NSString *)kCGImagePropertyDPIHeight : @(dpi)};
  CGImageDestinationAddImage(destination, image, (__bridge CFDictionaryRef)properties);
  BOOL isWritten = CGImageDestinationFinalize(destination);
  CFRelease(destination);
  return isWritten ? data : nil;
}

+ (NSArray<NSURL *> *)urlsIn:(NSURL *)folder names:(NSArray<NSString *> *)names
{
  NSMutableArray<NSURL *> *urls = [NSMutableArray array];
  for (NSString *name in names) {
    [urls addObject:[folder URLByAppendingPathComponent:name isDirectory:NO]];
  }
  return urls;
}

/** Asks before overwriting PNG images already in the chosen folder (a save panel asks for one file; an open panel does not). */
+ (BOOL)mayReplaceExisting:(NSArray<NSURL *> *)urls in:(NSURL *)folder
{
  NSUInteger existing = 0;
  for (NSURL *url in urls) {
    existing += [[NSFileManager defaultManager] fileExistsAtPath:url.path] ? 1 : 0;
  }
  if (existing == 0) {
    return YES;
  }
  NSAlert *alert = [NSAlert new];
  alert.messageText = existing == 1 ? [NSString stringWithFormat:@"Replace a file in “%@”?", folder.lastPathComponent]
                                    : [NSString stringWithFormat:@"Replace %lu files in “%@”?", (unsigned long)existing, folder.lastPathComponent];
  alert.informativeText = @"PNG images with these names are already in the folder. Replacing them overwrites them.";
  [alert addButtonWithTitle:@"Replace"];
  [alert addButtonWithTitle:@"Cancel"];
  return [alert runModal] == NSAlertFirstButtonReturn;
}

/**
 * Where the pages go; nil when cancelled. One page: the save panel's file. Several: a folder chosen in an open panel,
 * since the sandbox lets the app write only what the user chose — not other files next to a file it saved. The
 * unsandboxed QA copy (scripts/qa/run.sh) writes into GPEDITOR_QA_PNG_DIR without panels; the shipped app ignores it.
 */
+ (nullable NSArray<NSURL *> *)destinationsFor:(NSArray<NSString *> *)names
{
  NSString *qaFolder = [NSProcessInfo processInfo].environment[@"GPEDITOR_QA_PNG_DIR"];
  if (qaFolder.length > 0 && !GPIsSandboxed()) {
    return [self urlsIn:[NSURL fileURLWithPath:qaFolder isDirectory:YES] names:names];
  }
  if (names.count == 1) {
    NSSavePanel *panel = [NSSavePanel savePanel];
    panel.allowedContentTypes = @[ UTTypePNG ];
    panel.nameFieldStringValue = names.firstObject;
    panel.canCreateDirectories = YES;
    return [panel runModal] == NSModalResponseOK && panel.URL != nil ? @[ panel.URL ] : nil;
  }
  NSOpenPanel *panel = [NSOpenPanel openPanel];
  panel.canChooseFiles = NO;
  panel.canChooseDirectories = YES;
  panel.canCreateDirectories = YES;
  panel.allowsMultipleSelection = NO;
  panel.prompt = @"Export";
  panel.message = [NSString stringWithFormat:@"Choose a folder for the %lu PNG images, one per page: %@ … %@", (unsigned long)names.count, names.firstObject, names.lastObject];
  if ([panel runModal] != NSModalResponseOK || panel.URL == nil) {
    return nil;
  }
  NSArray<NSURL *> *urls = [self urlsIn:panel.URL names:names];
  return [self mayReplaceExisting:urls in:panel.URL] ? urls : nil;
}

/** Draws and writes each page to its URL; NO with `error` set when one cannot be. */
+ (BOOL)write:(NSArray<NSDictionary *> *)pages to:(NSArray<NSURL *> *)urls scale:(double)scale eraseColor:(NSString *)eraseColor error:(NSError **)error
{
  GPCommandPainter *painter = [GPCommandPainter new];
  painter.eraseColor = eraseColor.length > 0 ? eraseColor : nil;
  for (NSUInteger index = 0; index < pages.count; index++) {
    @autoreleasepool {
      CGImageRef image = [self createImageOf:pages[index] scale:scale painter:painter];
      NSData *png = image == NULL ? nil : [self pngDataOf:image dpi:scale * kPointsPerInch];
      if (image != NULL) {
        CGImageRelease(image);
      }
      if (png == nil) {
        if (error != NULL) {
          NSString *message = [NSString stringWithFormat:@"Could not draw page %lu", (unsigned long)index + 1];
          *error = [NSError errorWithDomain:@"GPPngExport" code:1 userInfo:@{NSLocalizedDescriptionKey : message}];
        }
        return NO;
      }
      if (![png writeToURL:urls[index] options:NSDataWritingAtomic error:error]) {
        return NO;
      }
    }
  }
  return YES;
}

/**
 * Asks where to save, then writes page i as `fileNames[i]` (a one-page export may be renamed in the save panel);
 * resolves { folder, folderName, names }, or null when cancelled.
 */
RCT_EXPORT_METHOD(savePngs : (NSString *)documentJson fileNames : (NSArray *)fileNames scale : (double)scale eraseColor : (NSString *)eraseColor resolve : (RCTPromiseResolveBlock)resolve reject : (RCTPromiseRejectBlock)reject)
{
  NSArray<NSDictionary *> *pages = [GPPngExport pagesFromJson:documentJson];
  if (pages == nil || ![GPPngExport areFileNames:fileNames forPageCount:pages.count] || !(scale > 0 && scale <= kMaxScale)) {
    reject(@"bad_document", @"Nothing to export", nil);
    return;
  }
  NSArray<NSURL *> *urls = [GPPngExport destinationsFor:fileNames];
  if (urls == nil) {
    resolve([NSNull null]);
    return;
  }
  NSError *error = nil;
  if (![GPPngExport write:pages to:urls scale:scale eraseColor:eraseColor error:&error]) {
    reject(@"write_failed", error.localizedDescription ?: @"Could not save the PNG images", error);
    return;
  }
  NSURL *folder = urls.firstObject.URLByDeletingLastPathComponent;
  resolve(@{@"folder" : folder.path, @"folderName" : folder.lastPathComponent, @"names" : [urls valueForKey:@"lastPathComponent"]});
}

@end
