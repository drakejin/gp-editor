// The app icon's picture: a bar of tab drawn as a guitar's neck — the six strings are the tab's lines, the nut and a
// fret its bar lines — with fret numbers on the strings and the editor's orange-brown cursor on one of them.
// Drawn in pixels, y down, on a plate (icon-geometry.swift); the smaller the plate, the fewer and thicker its lines.
import CoreGraphics
import CoreText

/** A colour from 0xRRGGBB in sRGB. */
func rgb(_ hex: UInt32, alpha: CGFloat = 1) -> CGColor {
  let channel = { (shift: UInt32) -> CGFloat in CGFloat((hex >> shift) & 0xFF) / 255 }
  return CGColor(srgbRed: channel(16), green: channel(8), blue: channel(0), alpha: alpha)
}

/** The icon's colours: the app's dark chrome (theme.ts) and its tab cursor's orange-brown. */
enum IconColor {
  static let boardTop: UInt32 = 0x34425C
  static let boardBottom: UInt32 = 0x141A27
  static let stringLight: UInt32 = 0xF4F5F7
  static let stringMid: UInt32 = 0xB7BCC4
  static let stringDark: UInt32 = 0x60656D
  static let stringFlat: UInt32 = 0xC9CDD3
  static let nutLight: UInt32 = 0xF4EFE3
  static let nutDark: UInt32 = 0xC4BBA5
  static let fretLight: UInt32 = 0xF2F3F5
  static let fretDark: UInt32 = 0x7F858E
  static let cursorTop: UInt32 = 0xEE7C47
  static let cursorBottom: UInt32 = 0xB3431B
  static let cursorEdge: UInt32 = 0x7A2A0C
  static let number: UInt32 = 0xE4E7EC
  static let cursorNumber: UInt32 = 0xFFFFFF
}

/** One string: where it runs down the plate and how thick it is, in plate units. */
struct StringLine {
  let v: CGFloat
  let thickness: CGFloat
  let isWound: Bool
}

/** The cursor in plate units: the string it is on, where across, its size and corner; its number's height (none). */
struct CursorLayout {
  let stringIndex: Int
  let u: CGFloat
  let width: CGFloat
  let height: CGFloat
  let corner: CGFloat
  let numberHeight: CGFloat?
}

/** The strings and the cursor at one level of detail. */
struct TabLayout {
  let strings: [StringLine]
  let cursor: CursorLayout
}

/** The tab's layouts in plate units: six strings, four from a 20-pixel plate, three below. */
enum Layout {
  static let full = TabLayout(
    strings: [0.0095, 0.0115, 0.0135, 0.0165, 0.0195, 0.0225].enumerated().map { index, thickness in
      StringLine(v: 0.2 + CGFloat(index) * 0.12, thickness: thickness, isWound: index >= 3)
    },
    cursor: CursorLayout(stringIndex: 3, u: 0.625, width: 0.2, height: 0.235, corner: 0.045, numberHeight: 0.145))
  static let small = TabLayout(
    strings: [0.27, 0.42, 0.57, 0.72].map { StringLine(v: $0, thickness: 0.05, isWound: false) },
    cursor: CursorLayout(stringIndex: 1, u: 0.62, width: 0.36, height: 0.4, corner: 0.09, numberHeight: 0.25))
  static let tiny = TabLayout(
    strings: [0.3, 0.5, 0.7].map { StringLine(v: $0, thickness: 0.08, isWound: false) },
    cursor: CursorLayout(stringIndex: 1, u: 0.62, width: 0.38, height: 0.42, corner: 0.07, numberHeight: nil))
  /** The nut and the fret, the bar's two bar lines: across, and how far down they run. */
  static let nut = (left: CGFloat(0.105), right: CGFloat(0.145), corner: CGFloat(0.008))
  static let fret = (center: CGFloat(0.875), width: CGFloat(0.016))
  static let barLines = (top: CGFloat(0.14), bottom: CGFloat(0.86))
  /** The numbers left of the cursor (a chord on the second and fifth strings): (string index, across, text). */
  static let numbers: [(Int, CGFloat, String)] = [(1, 0.32, "3"), (4, 0.32, "2")]
  static let numberHeight: CGFloat = 0.115
  /** How far the strings' gap reaches beyond a number's ink, across and down. */
  static let numberGap = (across: CGFloat(0.022), down: CGFloat(0.02))
  static let cursorText = "5"
}

/** A soft shadow in plate units: how far it falls down and right, how blurred and how dark it is. */
struct ShadowStyle {
  let down: CGFloat
  let rightward: CGFloat
  let blur: CGFloat
  let alpha: CGFloat
}

/** The light, from above left: each part's shadow, the board's glow, the plate's rim, the cursor's shine. */
enum Light {
  static let string = ShadowStyle(down: 0.006, rightward: 0, blur: 0.012, alpha: 0.55)
  static let nut = ShadowStyle(down: 0.006, rightward: 0.006, blur: 0.016, alpha: 0.55)
  static let fret = ShadowStyle(down: 0.005, rightward: 0.005, blur: 0.012, alpha: 0.6)
  static let number = ShadowStyle(down: 0.004, rightward: 0, blur: 0.006, alpha: 0.3)
  static let cursor = ShadowStyle(down: 0.012, rightward: 0, blur: 0.03, alpha: 0.5)
  static let cursorNumber = ShadowStyle(down: 0.004, rightward: 0, blur: 0.006, alpha: 0.35)
  /** The board's glow: its centre, how far it reaches, how white it starts. */
  static let glow = (u: CGFloat(0.28), v: CGFloat(0.02), radius: CGFloat(0.85), alpha: CGFloat(0.09))
  /** The light edge inside the plate: its width (at least a pixel) and whiteness. */
  static let rim = (width: CGFloat(0.005), alpha: CGFloat(0.12))
  /** The white over the cursor's top half, and its darker edge. */
  static let cursorShine: CGFloat = 0.28
  static let cursorEdge = (width: CGFloat(0.004), alpha: CGFloat(0.55))
  /** How dark a wound string's grooves are. */
  static let windingAlpha: CGFloat = 0.16
}

/** What the icon shows at a plate's side in pixels: the smaller, the fewer and plainer its parts. */
struct Features {
  let layout: TabLayout
  let hasNutAndFret: Bool
  let hasOtherNumbers: Bool
  let hasWinding: Bool
  let snapsToPixels: Bool

  init(side: CGFloat) {
    layout = side < 20 ? Layout.tiny : side < 44 ? Layout.small : Layout.full
    hasNutAndFret = side >= 44
    hasOtherNumbers = side >= 90
    hasWinding = side >= 300
    snapsToPixels = side < 64
  }
}

/** The icon on a plate, drawn into a context whose space is pixels, y down. */
struct IconArt {
  let plate: Plate
  let features: Features
  let font: CTFont

  init(plate: Plate) {
    self.plate = plate
    self.features = Features(side: plate.side)
    self.font = NUMBER_FONT
  }

  var strings: [StringLine] { features.layout.strings }

  /** The fret numbers left of the cursor, as outlines in pixels. */
  var numberOutlines: [CGPath] {
    guard features.hasOtherNumbers else {
      return []
    }
    return Layout.numbers.map { index, u, text in
      centeredText(text, font: font, center: plate.point(u, strings[index].v), height: plate.length(Layout.numberHeight))
    }
  }

  func draw(in context: CGContext) {
    if plate.platform == .mac {
      drawDropShadow(in: context)
    }
    context.saveGState()
    context.addPath(plate.outline)
    context.clip()
    drawBoard(in: context)
    if features.hasNutAndFret {
      drawNut(in: context)
      drawFret(in: context)
    }
    let numbers = numberOutlines
    drawStrings(cutAround: numbers, in: context)
    numbers.forEach { drawNumber($0, in: context) }
    drawCursor(in: context)
    drawRim(in: context)
    context.restoreGState()
  }
}
