// Native score canvas: draws the DrawCommand list of src/score/draw.ts, one view per score row. The `commands` prop is
// a JSON array; it is parsed once per change and drawn in -drawRect: by GPCommandPainter (shared with the PDF export).

#import <AppKit/AppKit.h>
#import <React/RCTViewComponentView.h>

#import <react/renderer/components/GPEditorSpec/ComponentDescriptors.h>
#import <react/renderer/components/GPEditorSpec/Props.h>
#import <react/renderer/components/GPEditorSpec/RCTComponentViewHelpers.h>

#import "GPCommandPainter.h"

using namespace facebook::react;

#pragma mark - Drawing view

/** Flipped NSView that draws the parsed commands. Never handles clicks: React Native's touch handling sits above it. */
@interface GPScoreCanvasDrawingView : NSView
@property (nonatomic, copy) NSArray<NSDictionary *> *commands;
@end

@implementation GPScoreCanvasDrawingView {
  GPCommandPainter *_painter;
}

- (BOOL)isFlipped
{
  return YES;
}

- (NSView *)hitTest:(NSPoint)point
{
  return nil;
}

- (void)setCommands:(NSArray<NSDictionary *> *)commands
{
  _commands = [commands copy];
  [self setNeedsDisplay:YES];
}

- (void)drawRect:(NSRect)dirtyRect
{
  if (_painter == nil) {
    _painter = [GPCommandPainter new];
  }
  [_painter drawCommands:self.commands];
}

@end

#pragma mark - Fabric component

@interface GPScoreCanvasComponentView : RCTViewComponentView
@end

@implementation GPScoreCanvasComponentView {
  GPScoreCanvasDrawingView *_canvas;
  /// The canvas was emptied for recycling: the next props draw even when their commands equal `_props`' (Fabric keeps
  /// a recycled view's last props, so a row remounted with the same drawing — a track moved in the multitrack view —
  /// would stay blank).
  BOOL _isCleared;
}

+ (ComponentDescriptorProvider)componentDescriptorProvider
{
  return concreteComponentDescriptorProvider<GPScoreCanvasComponentDescriptor>();
}

- (instancetype)initWithFrame:(CGRect)frame
{
  if (self = [super initWithFrame:frame]) {
    static const auto defaultProps = std::make_shared<const GPScoreCanvasProps>();
    _props = defaultProps;
    _canvas = [[GPScoreCanvasDrawingView alloc] initWithFrame:self.bounds];
    self.contentView = _canvas;
  }
  return self;
}

- (void)updateProps:(Props::Shared const &)props oldProps:(Props::Shared const &)oldProps
{
  const auto &previous = *std::static_pointer_cast<GPScoreCanvasProps const>(_props);
  const auto &next = *std::static_pointer_cast<GPScoreCanvasProps const>(props);
  if (_isCleared || previous.commands != next.commands) {
    _isCleared = NO;
    NSData *json = [NSData dataWithBytes:next.commands.data() length:next.commands.size()];
    id parsed = json.length == 0 ? nil : [NSJSONSerialization JSONObjectWithData:json options:0 error:nil];
    _canvas.commands = [parsed isKindOfClass:[NSArray class]] ? parsed : @[];
  }
  [super updateProps:props oldProps:oldProps];
}

- (void)prepareForRecycle
{
  [super prepareForRecycle];
  _canvas.commands = @[];
  _isCleared = YES;
}

@end

Class<RCTComponentViewProtocol> GPScoreCanvasCls(void)
{
  return GPScoreCanvasComponentView.class;
}
