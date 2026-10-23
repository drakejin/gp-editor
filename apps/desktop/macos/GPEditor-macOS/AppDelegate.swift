import SwiftUI
import React
import React_RCTAppDelegate
import ReactAppDependencyProvider

@main
struct GPEditorApp: App {
  @NSApplicationDelegateAdaptor(AppDelegate.self) var appDelegate

  var body: some Scene {
    Window("GP Editor", id: "main") {
      ReactNativeView(factory: appDelegate.reactNativeFactory)
    }
    .defaultSize(width: 1280, height: 800)
    .commands {
      CommandGroup(replacing: .newItem) {
        // Notification names: GPEditorNotifications.h (bridging header), shared with GPFiles.m.
        Button("New Score + Tab") {
          NotificationCenter.default.post(name: .GPEditorNewCommand, object: "notationAndTab" as NSString)
        }
        .keyboardShortcut("n")
        Button("New Score") {
          NotificationCenter.default.post(name: .GPEditorNewCommand, object: "notation" as NSString)
        }
        Button("New Tab") {
          NotificationCenter.default.post(name: .GPEditorNewCommand, object: "tab" as NSString)
        }
        Divider()
        Button("Open…") {
          NotificationCenter.default.post(name: .GPEditorOpenCommand, object: nil)
        }
        .keyboardShortcut("o")
        Button("Import PDF…") {
          NotificationCenter.default.post(name: .GPEditorImportPdfCommand, object: nil)
        }
        .keyboardShortcut("i", modifiers: [.command, .shift])
      }
      CommandGroup(replacing: .saveItem) {
        Button("Save") {
          NotificationCenter.default.post(name: .GPEditorSaveCommand, object: nil)
        }
        .keyboardShortcut("s")
        Button("Save As…") {
          NotificationCenter.default.post(name: .GPEditorSaveAsCommand, object: nil)
        }
        .keyboardShortcut("s", modifiers: [.command, .shift])
      }
      // Export PDF… saves the score (Score + Tab, Score or Tab) as a PDF; Print… (⌘P) prints it.
      CommandGroup(replacing: .printItem) {
        Button("Export PDF…") {
          NotificationCenter.default.post(name: .GPEditorExportCommand, object: nil)
        }
        .keyboardShortcut("e", modifiers: [.command, .shift])
        Button("Print…") {
          NotificationCenter.default.post(name: .GPEditorPrintCommand, object: nil)
        }
        .keyboardShortcut("p")
      }
      // Edit ▸ AI Wizard: tools that ask Claude (the Anthropic key of the PDF import).
      CommandGroup(after: .pasteboard) {
        Divider()
        Menu("AI Wizard") {
          Button("Song Writer…") {
            NotificationCenter.default.post(name: .GPEditorSongWriterCommand, object: nil)
          }
        }
      }
      // ⌘H shows the keyboard shortcuts (the user's choice), so Hide moves off it.
      CommandGroup(replacing: .appVisibility) {
        Button("Hide GP Editor") { NSApp.hide(nil) }
        Button("Hide Others") { NSApp.hideOtherApplications(nil) }
          .keyboardShortcut("h", modifiers: [.command, .option])
        Button("Show All") { NSApp.unhideAllApplications(nil) }
      }
      CommandGroup(replacing: .help) {
        Button("Keyboard Shortcuts") {
          NotificationCenter.default.post(name: .GPEditorHelpCommand, object: nil)
        }
        .keyboardShortcut("h")
      }
    }
  }
}


// MARK: - App Delegate

class AppDelegate: NSObject, NSApplicationDelegate {
  private let reactNativeDelegate: ReactNativeDelegate
  let reactNativeFactory: RCTReactNativeFactory

  override init() {
    // Stored properties must be set before super.init() (Swift 6 rejects the template's order).
    let delegate = ReactNativeDelegate()
    let factory = RCTReactNativeFactory(delegate: delegate)
    delegate.dependencyProvider = RCTAppDependencyProvider()

    reactNativeDelegate = delegate
    reactNativeFactory = factory
    super.init()
  }

  // Finder "Open With", dropping a file on the dock icon, `open -a`.
  func application(_ application: NSApplication, open urls: [URL]) {
    NotificationCenter.default.post(name: .GPEditorOpenURLs, object: urls)
  }
}

// MARK: - React Native Delegate

class ReactNativeDelegate: RCTDefaultReactNativeFactoryDelegate {
  override func sourceURL(for bridge: RCTBridge) -> URL? {
    bundleURL()
  }

  override func bundleURL() -> URL? {
#if DEBUG
    RCTBundleURLProvider.sharedSettings().jsBundleURL(forBundleRoot: "index")
#else
    Bundle.main.url(forResource: "main", withExtension: "jsbundle")
#endif
  }
}

// MARK: - React Native SwiftUI View

struct ReactNativeView: NSViewRepresentable {
  let factory: RCTReactNativeFactory

  func makeNSView(context: Context) -> NSView {
    factory.rootViewFactory.view(withModuleName: "GPEditor")
  }

  func updateNSView(_ nsView: NSView, context: Context) {}
}
