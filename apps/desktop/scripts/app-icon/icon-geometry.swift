// The app icon's shapes: the plate (macOS's continuous-corner rounded square, Windows' plainer one), where the plate
// sits on each platform's canvas, the plate's own units, and fret numbers as glyph outlines.
import AppKit
import CoreGraphics
import CoreText

/** Where the icon is drawn: macOS's Big Sur grid with its shadow margin, or Windows' fuller tile. */
enum Platform {
  case mac
  case windows
}

/** Apple's icon grid: an 824-point plate on a 1024-point canvas, corner radius 185 (Apple Design Resources). */
let MAC_PLATE_FRACTION: CGFloat = 824.0 / 1024.0
let MAC_CORNER_FRACTION: CGFloat = 185.0 / 824.0
/** Microsoft's 48 × 48 grid: 2 px of room around the tile, 2 px rounded exterior corners (Windows app icon design). */
let WINDOWS_PLATE_FRACTION: CGFloat = 44.0 / 48.0
let WINDOWS_CORNER_FRACTION: CGFloat = 2.0 / 44.0

/**
 * Apple's continuous corner (UIBezierPath's roundedRect, as PaintCode measured it), for the top-right corner going
 * clockwise: each point as (back along the edge coming in, along the edge going out), in corner radii.
 */
private let CONTINUOUS_CORNER_START: CGFloat = 1.52866483
private let CONTINUOUS_CORNER_CURVES: [(CGPoint, CGPoint, CGPoint)] = [
  (CGPoint(x: 1.08849323, y: 0), CGPoint(x: 0.86840689, y: 0), CGPoint(x: 0.63149399, y: 0.07491100)),
  (CGPoint(x: 0.37282392, y: 0.16905899), CGPoint(x: 0.16905883, y: 0.37282401), CGPoint(x: 0.07491176, y: 0.63149399)),
  (CGPoint(x: 0, y: 0.86840701), CGPoint(x: 0, y: 1.08849299), CGPoint(x: 0, y: 1.52866483)),
]

/** A rectangle with Apple's continuous corners, in a y-down space. */
func continuousRoundedRect(_ rect: CGRect, radius: CGFloat) -> CGPath {
  // Each corner: its point, the direction of the edge coming into it, the direction of the edge leaving it.
  let corners: [(CGPoint, CGVector, CGVector)] = [
    (CGPoint(x: rect.maxX, y: rect.minY), CGVector(dx: 1, dy: 0), CGVector(dx: 0, dy: 1)),
    (CGPoint(x: rect.maxX, y: rect.maxY), CGVector(dx: 0, dy: 1), CGVector(dx: -1, dy: 0)),
    (CGPoint(x: rect.minX, y: rect.maxY), CGVector(dx: -1, dy: 0), CGVector(dx: 0, dy: -1)),
    (CGPoint(x: rect.minX, y: rect.minY), CGVector(dx: 0, dy: -1), CGVector(dx: 1, dy: 0)),
  ]
  let path = CGMutablePath()
  path.move(to: CGPoint(x: rect.minX + CONTINUOUS_CORNER_START * radius, y: rect.minY))
  for (corner, incoming, outgoing) in corners {
    let point = { (offset: CGPoint) -> CGPoint in
      CGPoint(
        x: corner.x - incoming.dx * offset.x * radius + outgoing.dx * offset.y * radius,
        y: corner.y - incoming.dy * offset.x * radius + outgoing.dy * offset.y * radius)
    }
    path.addLine(to: point(CGPoint(x: CONTINUOUS_CORNER_START, y: 0)))
    for (control1, control2, end) in CONTINUOUS_CORNER_CURVES {
      path.addCurve(to: point(end), control1: point(control1), control2: point(control2))
    }
  }
  path.closeSubpath()
  return path
}

/** The plate on a canvas of `pixels` square: its rectangle in pixels (y down) and its outline. */
struct Plate {
  let platform: Platform
  let pixels: Int
  let rect: CGRect

  init(platform: Platform, pixels: Int) {
    self.platform = platform
    self.pixels = pixels
    let fraction = platform == .mac ? MAC_PLATE_FRACTION : WINDOWS_PLATE_FRACTION
    let canvas = CGFloat(pixels)
    let margin = (canvas - canvas * fraction) / 2
    // Small sizes: a whole-pixel margin, the same on every side, so the plate's edges stay sharp and centred.
    let inset = pixels < 128 ? margin.rounded(.down) : margin
    let side = canvas - 2 * inset
    self.rect = CGRect(x: inset, y: inset, width: side, height: side)
  }

  /** The plate's side in pixels: what decides how much detail it holds. */
  var side: CGFloat { rect.width }

  var outline: CGPath {
    switch platform {
    case .mac:
      return continuousRoundedRect(rect, radius: side * MAC_CORNER_FRACTION)
    case .windows:
      let radius = side * WINDOWS_CORNER_FRACTION
      return CGPath(roundedRect: rect, cornerWidth: radius, cornerHeight: radius, transform: nil)
    }
  }

  /** A point given in the plate's units (0…1 across, 0…1 down) in pixels. */
  func point(_ u: CGFloat, _ v: CGFloat) -> CGPoint {
    CGPoint(x: rect.minX + u * side, y: rect.minY + v * side)
  }

  /** A length in the plate's units in pixels. */
  func length(_ units: CGFloat) -> CGFloat { units * side }

  /** A rectangle centred on a point, its size in the plate's units. */
  func box(centerU: CGFloat, centerV: CGFloat, width: CGFloat, height: CGFloat) -> CGRect {
    let center = point(centerU, centerV)
    return CGRect(x: center.x - length(width) / 2, y: center.y - length(height) / 2, width: length(width), height: length(height))
  }
}

/** The rounded heavy system font the fret numbers are drawn in (SF Pro Rounded; said aloud when the system lacks it). */
let NUMBER_FONT: CTFont = {
  let base = NSFont.systemFont(ofSize: 100, weight: .heavy)
  guard let rounded = base.fontDescriptor.withDesign(.rounded), let font = NSFont(descriptor: rounded, size: 100) else {
    FileHandle.standardError.write(Data("app-icon: no rounded system font here, the numbers are drawn in the plain one\n".utf8))
    return base as CTFont
  }
  return font as CTFont
}()

/** A text's glyph outlines, y up from the baseline, as CoreText lays it out. */
func textOutline(_ text: String, font: CTFont) -> CGPath {
  let line = CTLineCreateWithAttributedString(NSAttributedString(string: text, attributes: [.font: font]))
  let path = CGMutablePath()
  for run in (CTLineGetGlyphRuns(line) as? [CTRun]) ?? [] {
    let count = CTRunGetGlyphCount(run)
    var glyphs = [CGGlyph](repeating: 0, count: count)
    var positions = [CGPoint](repeating: .zero, count: count)
    CTRunGetGlyphs(run, CFRange(location: 0, length: count), &glyphs)
    CTRunGetPositions(run, CFRange(location: 0, length: count), &positions)
    for (glyph, position) in zip(glyphs, positions) {
      if let outline = CTFontCreatePathForGlyph(font, glyph, nil) {
        path.addPath(outline, transform: CGAffineTransform(translationX: position.x, y: position.y))
      }
    }
  }
  return path
}

/** A text's outline centred on a point (y down), its ink `height` pixels tall. */
func centeredText(_ text: String, font: CTFont, center: CGPoint, height: CGFloat) -> CGPath {
  let outline = textOutline(text, font: font)
  let bounds = outline.boundingBoxOfPath
  precondition(bounds.height > 0, "the font has no outline for \"\(text)\"")
  let scale = height / bounds.height
  var transform = CGAffineTransform(translationX: center.x, y: center.y)
    .scaledBy(x: scale, y: -scale)
    .translatedBy(x: -bounds.midX, y: -bounds.midY)
  guard let placed = outline.copy(using: &transform) else {
    preconditionFailure("cannot place the outline of \"\(text)\"")
  }
  return placed
}
