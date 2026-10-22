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
