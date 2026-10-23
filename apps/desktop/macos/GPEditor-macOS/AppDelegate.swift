import SwiftUI
import React
import React_RCTAppDelegate
import ReactAppDependencyProvider

@main
struct GPEditorApp: App {
  @NSApplicationDelegateAdaptor(AppDelegate.self) var appDelegate
  /// File ▸ Open Recent's files (RecentFilesMenu.swift).
  @StateObject private var recentFiles = RecentFilesModel()

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
        RecentFilesCommands(model: recentFiles)
        Button("Import PDF…") {
          NotificationCenter.default.post(name: .GPEditorImportPdfCommand, object: nil)
        }
        .keyboardShortcut("i", modifiers: [.command, .shift])
      }
      CommandGroup(replacing: .saveItem) {
        // Each document is a tab of the window: ⌘W closes the shown one (asking first when it is edited).
        Button("Close Tab") {
          NotificationCenter.default.post(name: .GPEditorCloseTabCommand, object: nil)
        }
        .keyboardShortcut("w")
        Button("Next Tab") {
          NotificationCenter.default.post(name: .GPEditorNextTabCommand, object: nil)
        }
        .keyboardShortcut(.tab, modifiers: [.control])
        Button("Previous Tab") {
          NotificationCenter.default.post(name: .GPEditorPreviousTabCommand, object: nil)
        }
        .keyboardShortcut(.tab, modifiers: [.control, .shift])
        Divider()
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
        // The same pages as PNG images, one per page.
        Button("Export PNG…") {
          NotificationCenter.default.post(name: .GPEditorExportPngCommand, object: nil)
        }
        // The song as playback plays it (repeats unfolded, its own tempo, mute and solo as set), and its fretted tracks as text.
        Button("Export MIDI…") {
          NotificationCenter.default.post(name: .GPEditorExportMidiCommand, object: nil)
        }
        Button("Export ASCII Tab…") {
          NotificationCenter.default.post(name: .GPEditorExportAsciiTabCommand, object: nil)
        }
        // MusicXML 4.0 for other notation programs, as text or zipped.
        Button("Export MusicXML…") {
          NotificationCenter.default.post(name: .GPEditorExportMusicXmlCommand, object: nil)
        }
        Button("Export Compressed MusicXML…") {
          NotificationCenter.default.post(name: .GPEditorExportCompressedMusicXmlCommand, object: nil)
        }
        Divider()
        Button("Print…") {
          NotificationCenter.default.post(name: .GPEditorPrintCommand, object: nil)
        }
        .keyboardShortcut("p")
      }
      // Edit ▸ AI Wizard: tools that ask Claude (the Anthropic key of the PDF import).
      CommandGroup(after: .pasteboard) {
        Divider()
        // The lyrics of a track, above the score (Guitar Pro's lyrics editor).
        Button("Lyrics…") {
          NotificationCenter.default.post(name: .GPEditorLyricsCommand, object: nil)
        }
        Menu("AI Wizard") {
          Button("Song Writer…") {
            NotificationCenter.default.post(name: .GPEditorSongWriterCommand, object: nil)
          }
        }
      }
      // Tools ▸ Tuner…: the microphone tuner (GPAudioInput.m). Tools ▸ Scales…: the scale panel (scale finder, boxes; the
      // scale is marked on the keyboard and the fretboard).
      CommandMenu("Tools") {
        Button("Tuner…") {
          NotificationCenter.default.post(name: .GPEditorTunerCommand, object: nil)
        }
        Button("Scales…") {
          NotificationCenter.default.post(name: .GPEditorScalesCommand, object: nil)
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

  // Quitting with the tuner listening: its microphone stops first, and JS gets a moment to draw the frames already
  // sent, since a render while the process exits aborts it (GPAudioInput.h).
  func applicationShouldTerminate(_ sender: NSApplication) -> NSApplication.TerminateReply {
    guard GPAudioInputStopForQuit() else {
      return .terminateNow
    }
    DispatchQueue.main.asyncAfter(deadline: .now() + 0.3) {
      sender.reply(toApplicationShouldTerminate: true)
    }
    return .terminateLater
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
