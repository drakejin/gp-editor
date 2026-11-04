// The icon's parts, drawn by IconArt (icon-art.swift) in pixels, y down. Shadow offsets are in the bitmap's own space,
// which is y up: a shadow falling down has a negative height.
import CoreGraphics

/** Apple's icon template shadow at 1024 pixels: 10 down, blurred 10, black at 30 %. */
private let MAC_SHADOW = (offset: CGFloat(10), blur: CGFloat(10), alpha: CGFloat(0.3))

private func gradient(_ colors: [CGColor], _ locations: [CGFloat]) -> CGGradient {
  let space = CGColorSpace(name: CGColorSpace.sRGB)
  guard let gradient = CGGradient(colorsSpace: space, colors: colors as CFArray, locations: locations) else {
    preconditionFailure("cannot make a gradient of \(colors.count) colours")
  }
  return gradient
}

/** A rectangle whose edges fall on whole pixels. */
private func snapped(_ rect: CGRect) -> CGRect {
  let minX = rect.minX.rounded(), minY = rect.minY.rounded()
  return CGRect(x: minX, y: minY, width: max(1, rect.maxX.rounded() - minX), height: max(1, rect.maxY.rounded() - minY))
}

extension IconArt {
  /** Sets a soft shadow under what is drawn next. */
  func castShadow(_ style: ShadowStyle, in context: CGContext) {
    let offset = CGSize(width: plate.length(style.rightward), height: -plate.length(style.down))
    context.setShadow(offset: offset, blur: plate.length(style.blur), color: rgb(0x000000, alpha: style.alpha))
  }

  func drawDropShadow(in context: CGContext) {
    let scale = CGFloat(plate.pixels) / 1024
    context.saveGState()
    context.setShadow(
      offset: CGSize(width: 0, height: -MAC_SHADOW.offset * scale), blur: MAC_SHADOW.blur * scale,
      color: rgb(0x000000, alpha: MAC_SHADOW.alpha))
    context.addPath(plate.outline)
    context.setFillColor(rgb(IconColor.boardBottom))
    context.fillPath()
    context.restoreGState()
  }

  func drawBoard(in context: CGContext) {
    let board = gradient([rgb(IconColor.boardTop), rgb(IconColor.boardBottom)], [0, 1])
    context.drawLinearGradient(board, start: plate.point(0, 0), end: plate.point(0, 1), options: [])
    let glow = gradient([rgb(0xFFFFFF, alpha: Light.glow.alpha), rgb(0xFFFFFF, alpha: 0)], [0, 1])
    let center = plate.point(Light.glow.u, Light.glow.v)
    context.drawRadialGradient(
      glow, startCenter: center, startRadius: 0, endCenter: center, endRadius: plate.length(Light.glow.radius), options: [])
  }

  /** A light edge inside the plate, which keeps the dark plate apart from a dark Dock or desktop. */
  func drawRim(in context: CGContext) {
    context.addPath(plate.outline)
    context.setStrokeColor(rgb(0xFFFFFF, alpha: Light.rim.alpha))
    // Stroked on the outline inside the plate's clip: half of the width shows.
    context.setLineWidth(2 * max(1, plate.length(Light.rim.width)))
    context.strokePath()
  }

  /** One of the bar's two bar lines: its shadow, then its face lit across from the left. */
  private func drawBarLine(_ rect: CGRect, corner: CGFloat, shadow: ShadowStyle, face: [UInt32], in context: CGContext) {
    let path = CGPath(roundedRect: rect, cornerWidth: corner, cornerHeight: corner, transform: nil)
    context.saveGState()
    castShadow(shadow, in: context)
    context.addPath(path)
    context.setFillColor(rgb(face[face.count - 1]))
    context.fillPath()
    context.restoreGState()
    context.saveGState()
    context.addPath(path)
    context.clip()
    let locations = face.indices.map { CGFloat($0) / CGFloat(face.count - 1) }
    let lit = gradient(face.map { rgb($0) }, locations)
    context.drawLinearGradient(lit, start: CGPoint(x: rect.minX, y: 0), end: CGPoint(x: rect.maxX, y: 0), options: [])
    context.restoreGState()
  }

  /** The nut, in bone, where the bar begins. */
  func drawNut(in context: CGContext) {
    let top = plate.point(Layout.nut.left, Layout.barLines.top)
    let bottom = plate.point(Layout.nut.right, Layout.barLines.bottom)
    let rect = CGRect(x: top.x, y: top.y, width: bottom.x - top.x, height: bottom.y - top.y)
    let face = [IconColor.nutLight, IconColor.nutDark]
    drawBarLine(rect, corner: plate.length(Layout.nut.corner), shadow: Light.nut, face: face, in: context)
  }

  /** A fret, in nickel, where the bar ends. */
  func drawFret(in context: CGContext) {
    let center = plate.point(Layout.fret.center, 0).x, width = plate.length(Layout.fret.width)
    let top = plate.point(0, Layout.barLines.top).y, bottom = plate.point(0, Layout.barLines.bottom).y
    let rect = CGRect(x: center - width / 2, y: top, width: width, height: bottom - top)
    let face = [IconColor.fretDark, IconColor.fretLight, IconColor.fretDark]
    drawBarLine(rect, corner: width / 2, shadow: Light.fret, face: face, in: context)
  }

  /** A string's band across the plate: whole pixels at small sizes, so a 1-pixel line stays one pixel. */
  func stringRect(_ line: StringLine) -> CGRect {
    let y = plate.point(0, line.v).y
    let thickness = max(1, plate.length(line.thickness))
    // Past the plate's edges, which clip it.
    let rect = CGRect(x: plate.rect.minX - 2, y: y - thickness / 2, width: plate.side + 4, height: thickness)
    return features.snapsToPixels ? snapped(rect) : rect
  }

  func drawString(_ line: StringLine, in context: CGContext) {
    let rect = stringRect(line)
    guard !features.snapsToPixels else {
      context.setFillColor(rgb(IconColor.stringFlat))
      context.fill(rect)
      return
    }
    context.saveGState()
    castShadow(Light.string, in: context)
    context.setFillColor(rgb(IconColor.stringMid))
    context.fill(rect)
    context.restoreGState()
    context.saveGState()
    context.clip(to: rect)
    let metal = gradient([rgb(IconColor.stringLight), rgb(IconColor.stringMid), rgb(IconColor.stringDark)], [0, 0.45, 1])
    context.drawLinearGradient(metal, start: CGPoint(x: 0, y: rect.minY), end: CGPoint(x: 0, y: rect.maxY), options: [])
    if features.hasWinding && line.isWound {
      drawWinding(in: context, rect: rect)
    }
    context.restoreGState()
  }

  /** A wound string's turns: fine slanted grooves across it, half its thickness apart. */
  func drawWinding(in context: CGContext, rect: CGRect) {
    let pitch = max(2, rect.height * 0.5)
    let slant = rect.height * 0.6
    context.setStrokeColor(rgb(0x000000, alpha: Light.windingAlpha))
    context.setLineWidth(pitch * 0.35)
    for x in stride(from: rect.minX - rect.height, to: rect.maxX, by: pitch) {
      context.move(to: CGPoint(x: x, y: rect.maxY))
      context.addLine(to: CGPoint(x: x + slant, y: rect.minY))
    }
    context.strokePath()
  }

  /** The strings, cut where the fret numbers stand: a gap as wide as the number, as tab cuts its lines. */
  func drawStrings(cutAround numbers: [CGPath], in context: CGContext) {
    context.saveGState()
    context.beginTransparencyLayer(auxiliaryInfo: nil)
    strings.forEach { drawString($0, in: context) }
    context.saveGState()
    context.setBlendMode(.destinationOut)
    context.setFillColor(rgb(0x000000))
    for outline in numbers {
      let gap = outline.boundingBoxOfPath.insetBy(
        dx: -plate.length(Layout.numberGap.across), dy: -plate.length(Layout.numberGap.down))
      context.fill(gap)
    }
    context.restoreGState()
    context.endTransparencyLayer()
    context.restoreGState()
  }

  func drawNumber(_ outline: CGPath, in context: CGContext) {
    context.saveGState()
    castShadow(Light.number, in: context)
    context.addPath(outline)
    context.setFillColor(rgb(IconColor.number))
    context.fillPath()
    context.restoreGState()
  }

  /** The editor's tab cursor: an orange-brown box over a string, its fret number in white (a plain block when tiny). */
  func drawCursor(in context: CGContext) {
    let cursor = features.layout.cursor
    let center = (u: cursor.u, v: strings[cursor.stringIndex].v)
    let box = plate.box(centerU: center.u, centerV: center.v, width: cursor.width, height: cursor.height)
    let rect = features.snapsToPixels ? snapped(box) : box
    let corner = plate.length(cursor.corner)
    let path = CGPath(roundedRect: rect, cornerWidth: corner, cornerHeight: corner, transform: nil)
    guard let numberHeight = cursor.numberHeight else {
      context.addPath(path)
      context.setFillColor(rgb(IconColor.cursorTop))
      context.fillPath()
      return
    }
    context.saveGState()
    if !features.snapsToPixels {
      castShadow(Light.cursor, in: context)
    }
    context.addPath(path)
    context.setFillColor(rgb(IconColor.cursorBottom))
    context.fillPath()
    context.restoreGState()
    drawCursorFace(path: path, rect: rect, in: context)
    drawCursorNumber(in: rect, height: plate.length(numberHeight), context: context)
  }

  private func drawCursorFace(path: CGPath, rect: CGRect, in context: CGContext) {
    context.saveGState()
    context.addPath(path)
    context.clip()
    let face = gradient([rgb(IconColor.cursorTop), rgb(IconColor.cursorBottom)], [0, 1])
    context.drawLinearGradient(face, start: CGPoint(x: 0, y: rect.minY), end: CGPoint(x: 0, y: rect.maxY), options: [])
    let shine = gradient([rgb(0xFFFFFF, alpha: Light.cursorShine), rgb(0xFFFFFF, alpha: 0)], [0, 1])
    context.drawLinearGradient(shine, start: CGPoint(x: 0, y: rect.minY), end: CGPoint(x: 0, y: rect.midY), options: [])
    context.restoreGState()
    context.saveGState()
    context.addPath(path)
    context.setStrokeColor(rgb(IconColor.cursorEdge, alpha: Light.cursorEdge.alpha))
    context.setLineWidth(max(1, plate.length(Light.cursorEdge.width)))
    context.strokePath()
    context.restoreGState()
  }

  private func drawCursorNumber(in rect: CGRect, height: CGFloat, context: CGContext) {
    let outline = centeredText(Layout.cursorText, font: font, center: CGPoint(x: rect.midX, y: rect.midY), height: height)
    context.saveGState()
    if !features.snapsToPixels {
      castShadow(Light.cursorNumber, in: context)
    }
    context.addPath(outline)
    context.setFillColor(rgb(IconColor.cursorNumber))
    context.fillPath()
    context.restoreGState()
  }
}
