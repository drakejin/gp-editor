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
        Button("Open…") {
          NotificationCenter.default.post(name: GPEditorNotification.openCommand, object: nil)
        }
        .keyboardShortcut("o")
      }
    }
  }
}

// Names shared with GPFiles.m, which forwards them to JS.
enum GPEditorNotification {
  static let openCommand = Notification.Name("GPEditorOpenCommand")
  static let openURLs = Notification.Name("GPEditorOpenURLs")
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
    NotificationCenter.default.post(name: GPEditorNotification.openURLs, object: urls)
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
