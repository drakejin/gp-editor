// PDF export for the JS side: JS lays the score out into pages of DrawCommands (src/export/), this module draws each
// page with GPCommandPainter — the code that draws the score on screen — into a PDF and saves it where the user says.

#import <AppKit/AppKit.h>
#import <React/RCTBridgeModule.h>
#import <UniformTypeIdentifiers/UniformTypeIdentifiers.h>

#import "GPCommandPainter.h"
#import "GPSandbox.h"

@interface GPPdfExport : NSObject <RCTBridgeModule>
@end

@implementation GPPdfExport

RCT_EXPORT_MODULE();

+ (BOOL)requiresMainQueueSetup
{
  return NO;
}

- (dispatch_queue_t)methodQueue
{
  return dispatch_get_main_queue();
}

/** { title, pages: [{ width, height, commands }] } as JSON; nil when it is anything else. */
+ (nullable NSDictionary *)documentFromJson:(NSString *)json
{
  id document = [NSJSONSerialization JSONObjectWithData:[json dataUsingEncoding:NSUTF8StringEncoding] options:0 error:nil];
  BOOL isDocument = [document isKindOfClass:[NSDictionary class]] && [document[@"pages"] isKindOfClass:[NSArray class]];
  return isDocument ? document : nil;
}

/** The pages drawn into PDF data: each page's commands in a flipped context of the page's size, as on screen. */
+ (NSData *)pdfDataFor:(NSDictionary *)document
{
  NSMutableData *data = [NSMutableData data];
  CGDataConsumerRef consumer = CGDataConsumerCreateWithCFData((__bridge CFMutableDataRef)data);
  NSString *title = [document[@"title"] isKindOfClass:[NSString class]] ? document[@"title"] : @"";
  NSDictionary *info = @{(__bridge NSString *)kCGPDFContextTitle : title, (__bridge NSString *)kCGPDFContextCreator : @"GP Editor"};
  CGContextRef pdf = CGPDFContextCreate(consumer, NULL, (__bridge CFDictionaryRef)info);
  GPCommandPainter *painter = [GPCommandPainter new];
  for (NSDictionary *page in document[@"pages"]) {
    if (![page isKindOfClass:[NSDictionary class]] || ![page[@"commands"] isKindOfClass:[NSArray class]]) {
      continue;
    }
    CGRect box = CGRectMake(0, 0, [page[@"width"] doubleValue], [page[@"height"] doubleValue]);
    NSData *boxData = [NSData dataWithBytes:&box length:sizeof(box)];
    CGPDFContextBeginPage(pdf, (__bridge CFDictionaryRef) @{(__bridge NSString *)kCGPDFContextMediaBox : boxData});
    CGContextTranslateCTM(pdf, 0, box.size.height);
    CGContextScaleCTM(pdf, 1, -1);
    [NSGraphicsContext saveGraphicsState];
    NSGraphicsContext.currentContext = [NSGraphicsContext graphicsContextWithCGContext:pdf flipped:YES];
    [painter drawCommands:page[@"commands"]];
    [NSGraphicsContext restoreGraphicsState];
    CGPDFContextEndPage(pdf);
  }
  CGPDFContextClose(pdf);
  CGContextRelease(pdf);
  CGDataConsumerRelease(consumer);
  return data;
}

/**
 * Where to save: the save panel's choice; nil when cancelled. The unsandboxed QA copy (scripts/qa/run.sh) skips the
 * panel when GPEDITOR_QA_PDF_PATH names a file — the shipped, sandboxed app ignores it.
 */
+ (nullable NSURL *)destinationFor:(NSString *)suggestedName
{
  NSString *qaPath = [NSProcessInfo processInfo].environment[@"GPEDITOR_QA_PDF_PATH"];
  if (qaPath.length > 0 && !GPIsSandboxed()) {
    return [NSURL fileURLWithPath:qaPath];
  }
  NSSavePanel *panel = [NSSavePanel savePanel];
  panel.allowedContentTypes = @[ UTTypePDF ];
  panel.nameFieldStringValue = suggestedName;
  panel.canCreateDirectories = YES;
  return [panel runModal] == NSModalResponseOK ? panel.URL : nil;
}

RCT_EXPORT_METHOD(savePdf : (NSString *)documentJson suggestedName : (NSString *)suggestedName resolve : (RCTPromiseResolveBlock)resolve reject : (RCTPromiseRejectBlock)reject)
{
  NSDictionary *document = [GPPdfExport documentFromJson:documentJson];
  if (document == nil) {
    reject(@"bad_document", @"Nothing to export", nil);
    return;
  }
  NSURL *destination = [GPPdfExport destinationFor:suggestedName];
  if (destination == nil) {
    resolve([NSNull null]);
    return;
  }
  NSError *error = nil;
  if (![[GPPdfExport pdfDataFor:document] writeToURL:destination options:NSDataWritingAtomic error:&error]) {
    reject(@"write_failed", error.localizedDescription ?: @"Could not save the PDF", error);
    return;
  }
  resolve(@{@"name" : destination.lastPathComponent, @"path" : destination.path});
}

@end
