import SwiftUI
import React
import React_RCTAppDelegate
import ReactAppDependencyProvider

@main
struct GPEditorApp: App {
  @NSApplicationDelegateAdaptor(AppDelegate.self) var appDelegate
  /// File ▸ Open Recent's files (RecentFilesMenu.swift).
  @StateObject private var recentFiles = RecentFilesModel()
  /// Edit ▸ Undo / Redo's state from JS (EditMenu.swift).
  @StateObject private var editMenu = EditMenuModel()
  /// The menus' language, GP Editor ▸ Settings… ▸ Language (AppLanguage.swift): titles change as soon as JS applies it.
  @StateObject private var strings = AppLanguageModel()

  var body: some Scene {
    Window("GP Editor", id: "main") {
      ReactNativeView(factory: appDelegate.reactNativeFactory)
    }
    .defaultSize(width: 1280, height: 800)
    .commands {
      CommandGroup(replacing: .newItem) {
        // Notification names: GPEditorNotifications.h (bridging header), shared with GPFiles.m.
        Button(strings("New Score + Tab")) {
          NotificationCenter.default.post(name: .GPEditorNewCommand, object: "notationAndTab" as NSString)
        }
        .keyboardShortcut("n")
        Button(strings("New Score")) {
          NotificationCenter.default.post(name: .GPEditorNewCommand, object: "notation" as NSString)
        }
        Button(strings("New Tab")) {
          NotificationCenter.default.post(name: .GPEditorNewCommand, object: "tab" as NSString)
        }
        Divider()
        Button(strings("Open…")) {
          NotificationCenter.default.post(name: .GPEditorOpenCommand, object: nil)
        }
        .keyboardShortcut("o")
        RecentFilesCommands(model: recentFiles, strings: strings)
        Button(strings("Import PDF…")) {
          NotificationCenter.default.post(name: .GPEditorImportPdfCommand, object: nil)
        }
        .keyboardShortcut("i", modifiers: [.command, .shift])
      }
      CommandGroup(replacing: .saveItem) {
        // Each document is a tab of the window: ⌘W closes the shown one (asking first when it is edited).
        Button(strings("Close Tab")) {
          NotificationCenter.default.post(name: .GPEditorCloseTabCommand, object: nil)
        }
        .keyboardShortcut("w")
        Button(strings("Next Tab")) {
          NotificationCenter.default.post(name: .GPEditorNextTabCommand, object: nil)
        }
        .keyboardShortcut(.tab, modifiers: [.control])
        Button(strings("Previous Tab")) {
          NotificationCenter.default.post(name: .GPEditorPreviousTabCommand, object: nil)
        }
        .keyboardShortcut(.tab, modifiers: [.control, .shift])
        Divider()
        Button(strings("Save")) {
          NotificationCenter.default.post(name: .GPEditorSaveCommand, object: nil)
        }
        .keyboardShortcut("s")
        Button(strings("Save As…")) {
          NotificationCenter.default.post(name: .GPEditorSaveAsCommand, object: nil)
        }
        .keyboardShortcut("s", modifiers: [.command, .shift])
      }
      // Export PDF… saves the score (Score + Tab, Score or Tab) as a PDF; Print… (⌘P) prints it.
      CommandGroup(replacing: .printItem) {
        Button(strings("Export PDF…")) {
          NotificationCenter.default.post(name: .GPEditorExportCommand, object: nil)
        }
        .keyboardShortcut("e", modifiers: [.command, .shift])
        // The same pages as PNG images, one per page.
        Button(strings("Export PNG…")) {
          NotificationCenter.default.post(name: .GPEditorExportPngCommand, object: nil)
        }
        // The song as playback plays it (repeats unfolded, its own tempo, mute and solo as set), and its fretted tracks as text.
        Button(strings("Export MIDI…")) {
          NotificationCenter.default.post(name: .GPEditorExportMidiCommand, object: nil)
        }
        Button(strings("Export ASCII Tab…")) {
          NotificationCenter.default.post(name: .GPEditorExportAsciiTabCommand, object: nil)
        }
        // MusicXML 4.0 for other notation programs, as text or zipped.
        Button(strings("Export MusicXML…")) {
          NotificationCenter.default.post(name: .GPEditorExportMusicXmlCommand, object: nil)
        }
        Button(strings("Export Compressed MusicXML…")) {
          NotificationCenter.default.post(name: .GPEditorExportCompressedMusicXmlCommand, object: nil)
        }
        // The song (or the loop's bars) rendered with its sounds and effects: WAV, AIFF, FLAC, MP3 or Ogg Vorbis.
        Button(strings("Export Audio…")) {
          NotificationCenter.default.post(name: .GPEditorExportAudioCommand, object: nil)
        }
        Divider()
        // Guitar Pro 8's Stylesheet (F7): page, systems and staves, header, texts and notation of the score.
        Button(strings("Stylesheet…")) {
          NotificationCenter.default.post(name: .GPEditorLayoutCommand, object: "stylesheet" as NSString)
        }
        .keyboardShortcut(KeyEquivalent(Character(Unicode.Scalar(UInt32(NSF7FunctionKey))!)), modifiers: [])
        Button(strings("Print…")) {
          NotificationCenter.default.post(name: .GPEditorPrintCommand, object: nil)
        }
        .keyboardShortcut("p")
      }
      // The Edit menu (one group: a commands builder takes at most ten).
      Group {
        // Edit ▸ Undo / Redo: the score's history (EditMenu.swift), not the window's undo manager.
        CommandGroup(replacing: .undoRedo) {
          UndoRedoCommands(model: editMenu, strings: strings)
        }
        // Edit ▸ AI Wizard: tools that ask Claude (the Anthropic key of the PDF import).
        CommandGroup(after: .pasteboard) {
          Divider()
          // The lyrics of a track, above the score (Guitar Pro's lyrics editor).
          Button(strings("Lyrics…")) {
            NotificationCenter.default.post(name: .GPEditorLyricsCommand, object: nil)
          }
          Menu(strings("AI Wizard")) {
            Button(strings("Song Writer…")) {
              NotificationCenter.default.post(name: .GPEditorSongWriterCommand, object: nil)
            }
          }
        }
      }
      // View ▸ Focus / Unfocus: only the score and the transport (the panels come back the second time).
      CommandGroup(before: .toolbar) {
        Button(strings("Focus / Unfocus")) {
          NotificationCenter.default.post(name: .GPEditorFocusCommand, object: nil)
        }
        .keyboardShortcut("f", modifiers: [.command, .shift])
        // Guitar Pro 8's Multitrack (F3): every track the tracks panel's eyes show, one staff group each. Previous / Next
        // Track move the cursor (⌘↑ / ⌘↓ on the score, kept off the menu so text fields keep those keys).
        Button(strings("Multitrack")) {
          NotificationCenter.default.post(name: .GPEditorMultitrackCommand, object: nil)
        }
        .keyboardShortcut(KeyEquivalent(Character(Unicode.Scalar(UInt32(NSF3FunctionKey))!)), modifiers: [])
        Button(strings("Previous Track")) {
          NotificationCenter.default.post(name: .GPEditorPreviousTrackCommand, object: nil)
        }
        Button(strings("Next Track")) {
          NotificationCenter.default.post(name: .GPEditorNextTrackCommand, object: nil)
        }
        // Guitar Pro 8's Design Mode: drag beats, bar lines and spaces; Reset Positions (its Spacing Tools) undoes them all.
        Button(strings("Design Mode")) {
          NotificationCenter.default.post(name: .GPEditorLayoutCommand, object: "designMode" as NSString)
        }
        Button(strings("Reset Positions")) {
          NotificationCenter.default.post(name: .GPEditorLayoutCommand, object: "resetPositions" as NSString)
        }
        Divider()
      }
      // Tools: the microphone tuner (GPAudioInput.m), the scale panel (scale finder, boxes; the scale is marked on the
      // keyboard and the fretboard), Transpose… (notes and chords by semitones or scale steps) and the command palette,
      // which finds any command.
      CommandMenu(strings("Tools")) {
        Button(strings("Tuner…")) {
          NotificationCenter.default.post(name: .GPEditorTunerCommand, object: nil)
        }
        Button(strings("Scales…")) {
          NotificationCenter.default.post(name: .GPEditorScalesCommand, object: nil)
        }
        Button(strings("Transpose…")) {
          NotificationCenter.default.post(name: .GPEditorTransposeCommand, object: nil)
        }
        // A real instrument played through a track's effects (GPLineIn.m).
        Button(strings("Line In…")) {
          NotificationCenter.default.post(name: .GPEditorLineInCommand, object: nil)
        }
        Divider()
        Button(strings("Command Palette…")) {
          NotificationCenter.default.post(name: .GPEditorCommandPaletteCommand, object: nil)
        }
        .keyboardShortcut("p", modifiers: [.command, .shift])
        // Guitar Pro 8's Expression Text: the palette with “>” typed — a chord, dynamic, key, octave sign, clef or
        // direction by name. (Guitar Pro's ⇧⌘E is Export PDF… here.)
        Button(strings("Expression Text…")) {
          NotificationCenter.default.post(name: .GPEditorCommandPaletteCommand, object: "expression" as NSString)
        }
        .keyboardShortcut("e", modifiers: [.command, .option])
      }
      // Track ▸ Add Audio Track…: a recording played in sync with the score (GPAudioTrack.m forwards it).
      CommandMenu(strings("Track")) {
        // Add, duplicate, delete and move the shown track (Guitar Pro 8's ⌥⌘N / ⌥⌘R); GPAudioTrack.m forwards them to JS.
        Button(strings("Add Track…")) {
          NotificationCenter.default.post(name: .GPEditorTrackCommand, object: "add" as NSString)
        }
        .keyboardShortcut("n", modifiers: [.command, .option])
        Button(strings("Duplicate Track")) {
          NotificationCenter.default.post(name: .GPEditorTrackCommand, object: "duplicate" as NSString)
        }
        Button(strings("Delete Track")) {
          NotificationCenter.default.post(name: .GPEditorTrackCommand, object: "delete" as NSString)
        }
        .keyboardShortcut("r", modifiers: [.command, .option])
        Divider()
        Button(strings("Move Track Up")) {
          NotificationCenter.default.post(name: .GPEditorTrackCommand, object: "moveUp" as NSString)
        }
        Button(strings("Move Track Down")) {
          NotificationCenter.default.post(name: .GPEditorTrackCommand, object: "moveDown" as NSString)
        }
        Divider()
        Button(strings("Add Audio Track…")) {
          NotificationCenter.default.post(name: .GPEditorAddAudioTrackCommand, object: nil)
        }
      }
      // View ▸ Mixer: the tracks' effects and the master strip (GPPlayer.m forwards it).
      CommandGroup(after: .toolbar) {
        Button(strings("Mixer")) {
          NotificationCenter.default.post(name: .GPEditorMixerCommand, object: nil)
        }
        // How the drum track at the cursor writes its drums: a key over the score (GPFiles.m forwards it).
        Button(strings("Drum Key")) {
          NotificationCenter.default.post(name: .GPEditorDrumKeyCommand, object: nil)
        }
      }
      // The GP Editor menu (one group: a commands builder takes at most ten).
      Group {
        // GP Editor ▸ Settings… (⌘,): the language, interface contrast and score paper (GPAppSettings.m forwards it to JS).
        CommandGroup(replacing: .appSettings) {
          Button(strings("Settings…")) {
            NotificationCenter.default.post(name: .GPEditorSettingsCommand, object: nil)
          }
          .keyboardShortcut(",")
        }
        // ⌘H shows the keyboard shortcuts (the user's choice), so Hide moves off it.
        CommandGroup(replacing: .appVisibility) {
          Button(strings("Hide GP Editor")) { NSApp.hide(nil) }
          Button(strings("Hide Others")) { NSApp.hideOtherApplications(nil) }
            .keyboardShortcut("h", modifiers: [.command, .option])
          Button(strings("Show All")) { NSApp.unhideAllApplications(nil) }
        }
      }
      CommandGroup(replacing: .help) {
        Button(strings("Keyboard Shortcuts")) {
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
