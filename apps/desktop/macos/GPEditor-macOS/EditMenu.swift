// The Edit menu's score commands. SwiftUI's own Undo / Redo act on the window's undo manager and its Cut / Copy / Paste
// on the responder chain's cut: / copy: / paste:, none of which the score (React Native views) has: they stayed disabled
// and swallowed ⌘Z, ⌘X, ⌘C and ⌘V before the score saw them. These items post GPEditorUndoCommand / GPEditorRedoCommand
// (GPFiles.m forwards them to JS; enabled from JS's undo state, GPFiles' setUndoState) and GPEditorClipboardCommand
// (GPClipboard.m forwards it). While a text field has the keyboard they are its own, as AppKit's items are; Delete and
// Select All stay the text's alone, as SwiftUI's were.
// SwiftUI refreshes a menu item's enabled state when its menu opens, not when a key equivalent is looked up, so the
// score's ⌘Z ⇧⌘Z ⌘X ⌘C ⌘V, and ⌘A in a text field, are taken by a local key monitor (from state that is current) before
// the menu sees them.

import AppKit
import SwiftUI

final class EditMenuModel: ObservableObject {
  @Published private(set) var canUndo = false
  @Published private(set) var canRedo = false
  /// A text field or text view is being edited (its field editor has the keys).
  @Published private(set) var isEditingText = false
  /// A text field or text view has the keyboard, edited yet or not.
  @Published private(set) var isTextFocused = false
  private var observers: [NSObjectProtocol] = []
  private var keyMonitor: Any?

  /// ⌘X / ⌘C / ⌘V → the score's command (GPEditorClipboardCommand's object).
  private static let clipboardKeys = ["x": "cut", "c": "copy", "v": "paste"]

  init() {
    let center = NotificationCenter.default
    observers = [
      center.addObserver(forName: .GPEditorUndoState, object: nil, queue: .main) { [weak self] note in
        self?.canUndo = (note.userInfo?["canUndo"] as? NSNumber)?.boolValue ?? false
        self?.canRedo = (note.userInfo?["canRedo"] as? NSNumber)?.boolValue ?? false
      },
      center.addObserver(forName: NSText.didBeginEditingNotification, object: nil, queue: .main) { [weak self] _ in
        self?.isEditingText = true
      },
      center.addObserver(forName: NSText.didEndEditingNotification, object: nil, queue: .main) { [weak self] _ in
        self?.isEditingText = false
      },
      // After each event: a click may have moved the keyboard into a text field or out of it.
      center.addObserver(forName: NSApplication.didUpdateNotification, object: nil, queue: .main) { [weak self] _ in
        let isFocused = EditMenuModel.isTextFocused
        if let self, self.isTextFocused != isFocused {
          self.isTextFocused = isFocused
        }
      },
    ]
    keyMonitor = NSEvent.addLocalMonitorForEvents(matching: .keyDown) { [weak self] event in
      guard let self else {
        return event
      }
      return self.takeScoreKey(event) || EditMenuModel.takeSelectAllKey(event) ? nil : event
    }
  }

  deinit {
    observers.forEach(NotificationCenter.default.removeObserver)
    keyMonitor.map(NSEvent.removeMonitor)
  }

  /// The editor's window: the main window, or while the app is not active the one that will be (the QA driver's keys
  /// come then when the screen is locked; keyWindow and mainWindow are nil until the app is active).
  static var editorWindow: NSWindow? {
    NSApp.mainWindow ?? NSApp.windows.first { $0.isVisible && $0.canBecomeMain }
  }

  /// The window with the keyboard: the key window, or while the app is not active the editor's.
  static var keyboardWindow: NSWindow? {
    NSApp.keyWindow ?? editorWindow
  }

  /// The text field's editor or the text view that has the keyboard, if one has it.
  static var focusedText: NSText? {
    keyboardWindow?.firstResponder as? NSText
  }

  static var isTextFocused: Bool {
    focusedText != nil
  }

  /// The score's keys in the editor's window, outside a text field: ⌘X / ⌘C / ⌘V, and ⌘Z / ⇧⌘Z with something to undo /
  /// redo, posted for the score. Else the key goes on (a text field's own, the menu's beep).
  private func takeScoreKey(_ event: NSEvent) -> Bool {
    guard let window = event.window, window == EditMenuModel.editorWindow, !(window.firstResponder is NSText),
          let key = event.charactersIgnoringModifiers?.lowercased() else {
      return false
    }
    let modifiers = event.modifierFlags.intersection([.command, .shift, .option, .control])
    if modifiers == [.command], let command = EditMenuModel.clipboardKeys[key] {
      NotificationCenter.default.post(name: .GPEditorClipboardCommand, object: command as NSString)
      return true
    }
    switch (key, modifiers) {
    case ("z", [.command]) where canUndo:
      NotificationCenter.default.post(name: .GPEditorUndoCommand, object: nil)
      return true
    case ("z", [.command, .shift]) where canRedo:
      NotificationCenter.default.post(name: .GPEditorRedoCommand, object: nil)
      return true
    default:
      return false
    }
  }

  /// ⌘A in a text field of the editor's window: its Select All, whichever state the menu item was last shown in (a field
  /// a panel focuses as it opens has the keyboard before any event has refreshed the item).
  private static func takeSelectAllKey(_ event: NSEvent) -> Bool {
    guard let window = event.window, window == editorWindow, let text = window.firstResponder as? NSText,
          event.charactersIgnoringModifiers?.lowercased() == "a",
          event.modifierFlags.intersection([.command, .shift, .option, .control]) == [.command] else {
      return false
    }
    NSApp.sendAction(#selector(NSText.selectAll(_:)), to: text, from: nil)
    return true
  }

  /// The text being edited takes the action itself; else the score's command goes to JS.
  static func perform(_ textAction: Selector, score: Notification.Name) {
    if isTextFocused {
      NSApp.sendAction(textAction, to: nil, from: nil)
    } else {
      NotificationCenter.default.post(name: score, object: nil)
    }
  }

  /// Cut / copy / paste: the text that has the keyboard does it itself (sent to it, as the key window's responder
  /// chain would); else, in the editor's window, the score's command goes to JS ("cut", "copy" or "paste"); another
  /// window (a panel) keeps AppKit's own handling.
  static func performClipboard(_ textAction: Selector, command: String) {
    if let text = focusedText {
      NSApp.sendAction(textAction, to: text, from: nil)
    } else if keyboardWindow == editorWindow {
      NotificationCenter.default.post(name: .GPEditorClipboardCommand, object: command as NSString)
    } else {
      NSApp.sendAction(textAction, to: nil, from: nil)
    }
  }

  /// Delete / Select All: the text's alone.
  static func performOnText(_ textAction: Selector) {
    if let text = focusedText {
      NSApp.sendAction(textAction, to: text, from: nil)
    }
  }
}

/// Edit ▸ Undo and Redo, in place of SwiftUI's (CommandGroup(replacing: .undoRedo)).
struct UndoRedoCommands: View {
  @ObservedObject var model: EditMenuModel
  @ObservedObject var strings: AppLanguageModel

  var body: some View {
    Button(strings("Undo")) {
      EditMenuModel.perform(Selector(("undo:")), score: .GPEditorUndoCommand)
    }
    .keyboardShortcut("z")
    .disabled(!model.canUndo && !model.isEditingText)
    Button(strings("Redo")) {
      EditMenuModel.perform(Selector(("redo:")), score: .GPEditorRedoCommand)
    }
    .keyboardShortcut("z", modifiers: [.command, .shift])
    .disabled(!model.canRedo && !model.isEditingText)
  }
}

/// Edit ▸ Cut / Copy / Paste (the score's beats, or the text being edited), Delete and Select All (the text's), in
/// place of SwiftUI's (CommandGroup(replacing: .pasteboard)).
struct PasteboardCommands: View {
  @ObservedObject var model: EditMenuModel
  @ObservedObject var strings: AppLanguageModel

  var body: some View {
    clipboardButton("Cut", key: "x", textAction: #selector(NSText.cut(_:)), command: "cut")
    clipboardButton("Copy", key: "c", textAction: #selector(NSText.copy(_:)), command: "copy")
    clipboardButton("Paste", key: "v", textAction: #selector(NSText.paste(_:)), command: "paste")
    Button(strings("Delete")) {
      EditMenuModel.performOnText(#selector(NSText.delete(_:)))
    }
    .disabled(!model.isTextFocused)
    Button(strings("Select All")) {
      EditMenuModel.performOnText(#selector(NSText.selectAll(_:)))
    }
    .keyboardShortcut("a")
    .disabled(!model.isTextFocused)
  }

  /// Always enabled: the score takes its command with or without a selection (a copy then takes the cursor's beat).
  private func clipboardButton(_ title: String, key: KeyEquivalent, textAction: Selector, command: String) -> some View {
    Button(strings(title)) {
      EditMenuModel.performClipboard(textAction, command: command)
    }
    .keyboardShortcut(key)
  }
}
