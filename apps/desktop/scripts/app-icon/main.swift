// Draws the app icon (scripts/app-icon/run.sh builds and runs this).
// Usage: app-icon write <apps/desktop>   every icon file of the macOS app and the Windows bundle
//        app-icon sheet <out.png>        a contact sheet of every size on light and dark backgrounds
import Foundation

let arguments = CommandLine.arguments
guard arguments.count == 3, ["write", "sheet"].contains(arguments[1]) else {
  FileHandle.standardError.write(Data("usage: app-icon write <apps/desktop> | app-icon sheet <out.png>\n".utf8))
  exit(2)
}
do {
  if arguments[1] == "write" {
    try writeIconFiles(appDir: arguments[2])
  } else {
    try writeContactSheet(to: arguments[2])
  }
} catch {
  FileHandle.standardError.write(Data("app-icon: \(error)\n".utf8))
  exit(1)
}
