// The app icon's files: each size rendered on its own (small sizes are simplified, not shrunk), the macOS asset
// catalog's AppIcon set, the Windows bundle's PNGs and its .ico.
import AppKit
import CoreGraphics
import ImageIO
import UniformTypeIdentifiers

/** The macOS AppIcon set: each point size at 1x and 2x, named as iconutil names them. */
let MAC_POINT_SIZES = [16, 32, 128, 256, 512]
/** The .ico's images, as `tauri icon` writes them: Microsoft's minimum (16, 24, 32, 48, 256) and 64. */
let ICO_SIZES = [16, 24, 32, 48, 64, 256]
/** The Windows bundle's PNGs (tauri.conf.json's bundle.icon): file name → pixels. */
let WINDOWS_PNGS: [(String, Int)] = [("32x32.png", 32), ("128x128.png", 128), ("128x128@2x.png", 256), ("icon.png", 1024)]

struct IconFileError: Error, CustomStringConvertible {
  let description: String
}

func renderIcon(platform: Platform, pixels: Int) throws -> CGImage {
  guard
    let space = CGColorSpace(name: CGColorSpace.sRGB),
    let context = CGContext(
      data: nil, width: pixels, height: pixels, bitsPerComponent: 8, bytesPerRow: 0, space: space,
      bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue)
  else {
    throw IconFileError(description: "cannot make a \(pixels) × \(pixels) bitmap")
  }
  context.translateBy(x: 0, y: CGFloat(pixels))
  context.scaleBy(x: 1, y: -1)
  context.interpolationQuality = .high
  IconArt(plate: Plate(platform: platform, pixels: pixels)).draw(in: context)
  guard let image = context.makeImage() else {
    throw IconFileError(description: "cannot read back the \(pixels) × \(pixels) bitmap")
  }
  return image
}

func pngData(_ image: CGImage) throws -> Data {
  let data = NSMutableData()
  guard let destination = CGImageDestinationCreateWithData(data, UTType.png.identifier as CFString, 1, nil) else {
    throw IconFileError(description: "cannot make a PNG writer")
  }
  CGImageDestinationAddImage(destination, image, nil)
  guard CGImageDestinationFinalize(destination) else {
    throw IconFileError(description: "cannot write a PNG")
  }
  return data as Data
}

private func littleEndian<T: FixedWidthInteger>(_ value: T) -> Data {
  withUnsafeBytes(of: value.littleEndian) { Data($0) }
}

/** An .ico holding PNG images (Windows Vista and later read them; `tauri icon` writes them so). */
func icoData(_ images: [(pixels: Int, png: Data)]) -> Data {
  precondition(images.allSatisfy { $0.pixels <= 256 }, "an .ico image is at most 256 pixels")
  let header = littleEndian(UInt16(0)) + littleEndian(UInt16(1)) + littleEndian(UInt16(images.count))
  let firstOffset = 6 + 16 * images.count
  let offsets = images.reduce(into: [firstOffset]) { offsets, image in offsets.append(offsets.last! + image.png.count) }
  let directory = zip(images, offsets).map { image, offset -> Data in
    let side = UInt8(image.pixels >= 256 ? 0 : image.pixels)
    return Data([side, side, 0, 0]) + littleEndian(UInt16(1)) + littleEndian(UInt16(32))
      + littleEndian(UInt32(image.png.count)) + littleEndian(UInt32(offset))
  }
  return directory.reduce(header, +) + images.map(\.png).reduce(Data(), +)
}

func macIconName(points: Int, scale: Int) -> String {
  "icon_\(points)x\(points)\(scale == 2 ? "@2x" : "").png"
}

/** The AppIcon set's Contents.json, as Xcode writes it. */
func appIconContents() -> String {
  let entries = MAC_POINT_SIZES.flatMap { points in
    [1, 2].map { scale in
      """
          {
            "filename" : "\(macIconName(points: points, scale: scale))",
            "idiom" : "mac",
            "scale" : "\(scale)x",
            "size" : "\(points)x\(points)"
          }
      """
    }
  }
  return "{\n  \"images\" : [\n\(entries.joined(separator: ",\n"))\n  ],\n  \"info\" : {\n    \"author\" : \"xcode\",\n"
    + "    \"version\" : 1\n  }\n}\n"
}

func write(_ data: Data, to path: String) throws {
  try data.write(to: URL(fileURLWithPath: path), options: .atomic)
}

/** Every file of the icon, under apps/desktop. */
func writeIconFiles(appDir: String) throws {
  let iconSet = "\(appDir)/macos/GPEditor-macOS/Assets.xcassets/AppIcon.appiconset"
  for points in MAC_POINT_SIZES {
    for scale in [1, 2] {
      let image = try renderIcon(platform: .mac, pixels: points * scale)
      try write(pngData(image), to: "\(iconSet)/\(macIconName(points: points, scale: scale))")
    }
  }
  try write(Data(appIconContents().utf8), to: "\(iconSet)/Contents.json")
  let windows = "\(appDir)/src-tauri/icons"
  for (name, pixels) in WINDOWS_PNGS {
    try write(pngData(renderIcon(platform: .windows, pixels: pixels)), to: "\(windows)/\(name)")
  }
  let icoImages = try ICO_SIZES.map { pixels in (pixels: pixels, png: try pngData(renderIcon(platform: .windows, pixels: pixels))) }
  try write(icoData(icoImages), to: "\(windows)/icon.ico")
}
