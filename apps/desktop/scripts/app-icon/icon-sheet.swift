// A contact sheet to look at the icon: every size at its own pixels on a light and a dark background (Finder, Dock,
// desktop), and the smallest ones enlarged pixel by pixel.
import AppKit
import CoreGraphics

private let SHEET_WIDTH = 2000
private let SHEET_HEIGHT = 1640
private let HALF = CGFloat(SHEET_WIDTH / 2)
private let LIGHT_BACKGROUND: UInt32 = 0xF0F0F2
private let DARK_BACKGROUND: UInt32 = 0x1E1F22
private let ZOOM = 6

private struct SheetItem {
  let platform: Platform
  let pixels: Int
  let zoom: Int
}

/** The sheet's rows, for each half: the macOS sizes, the Windows sizes, the small ones enlarged. */
private let SHEET_ROWS: [(String, [SheetItem])] = [
  ("macOS", [SheetItem(platform: .mac, pixels: 512, zoom: 1)]),
  ("", [256, 128, 64, 32, 16].map { SheetItem(platform: .mac, pixels: $0, zoom: 1) }),
  ("Windows", [256, 64, 48, 32, 24, 16].map { SheetItem(platform: .windows, pixels: $0, zoom: 1) }),
  ("× \(ZOOM)", [(Platform.mac, 16), (.mac, 32), (.windows, 16), (.windows, 24), (.windows, 32)].map {
    SheetItem(platform: $0.0, pixels: $0.1, zoom: ZOOM)
  }),
]

private func drawLabel(_ text: String, at point: CGPoint, color: NSColor) {
  let attributes: [NSAttributedString.Key: Any] = [.font: NSFont.systemFont(ofSize: 15, weight: .medium), .foregroundColor: color]
  (text as NSString).draw(at: point, withAttributes: attributes)
}

/** Draws one row of icons from `origin`, each with its size under it; returns the row's height. */
private func drawRow(_ items: [SheetItem], origin: CGPoint, isDark: Bool, in context: CGContext) throws -> CGFloat {
  var x = origin.x
  var height: CGFloat = 0
  let labelColor = isDark ? NSColor(white: 0.75, alpha: 1) : NSColor(white: 0.3, alpha: 1)
  for item in items {
    let image = try renderIcon(platform: item.platform, pixels: item.pixels)
    let side = CGFloat(item.pixels * item.zoom)
    context.saveGState()
    context.interpolationQuality = item.zoom > 1 ? .none : .high
    // The context is flipped: draw the image upside down so it shows upright.
    context.translateBy(x: x, y: origin.y + side)
    context.scaleBy(x: 1, y: -1)
    context.draw(image, in: CGRect(x: 0, y: 0, width: side, height: side))
    context.restoreGState()
    let platform = item.platform == .mac ? "mac" : "win"
    drawLabel("\(platform) \(item.pixels)", at: CGPoint(x: x, y: origin.y + side + 6), color: labelColor)
    x += max(side, 60) + 24
    height = max(height, side + 34)
  }
  return height
}

func writeContactSheet(to path: String) throws {
  guard
    let space = CGColorSpace(name: CGColorSpace.sRGB),
    let context = CGContext(
      data: nil, width: SHEET_WIDTH, height: SHEET_HEIGHT, bitsPerComponent: 8, bytesPerRow: 0, space: space,
      bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue)
  else {
    throw IconFileError(description: "cannot make the contact sheet's bitmap")
  }
  context.translateBy(x: 0, y: CGFloat(SHEET_HEIGHT))
  context.scaleBy(x: 1, y: -1)
  NSGraphicsContext.current = NSGraphicsContext(cgContext: context, flipped: true)
  for (index, background) in [LIGHT_BACKGROUND, DARK_BACKGROUND].enumerated() {
    let left = CGFloat(index) * HALF
    context.setFillColor(rgb(background))
    context.fill(CGRect(x: left, y: 0, width: HALF, height: CGFloat(SHEET_HEIGHT)))
    var y: CGFloat = 24
    for (title, items) in SHEET_ROWS {
      let isDark = index == 1
      let titleHeight: CGFloat = title.isEmpty ? 0 : 28
      drawLabel(title, at: CGPoint(x: left + 24, y: y), color: isDark ? .white : .black)
      y += titleHeight + (try drawRow(items, origin: CGPoint(x: left + 24, y: y + titleHeight), isDark: isDark, in: context)) + 12
    }
  }
  NSGraphicsContext.current = nil
  guard let image = context.makeImage() else {
    throw IconFileError(description: "cannot read back the contact sheet")
  }
  try write(pngData(image), to: path)
}
