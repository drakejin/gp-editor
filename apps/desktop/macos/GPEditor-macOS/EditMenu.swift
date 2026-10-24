// Edit ▸ Undo / Redo (⌘Z / ⇧⌘Z) for the score: SwiftUI's own items act on the window's undo manager, which the editor
// does not use (its history is the JS reducer's), so they stayed disabled and swallowed ⌘Z before the score saw it.
// These post GPEditorUndoCommand / GPEditorRedoCommand (GPFiles.m forwards them to JS) and are enabled from JS's undo
// state (GPFiles' setUndoState). While a text field edits, they are its own undo and redo, as AppKit's items are.
// SwiftUI refreshes a menu item's enabled state when its menu opens, not when a key equivalent is looked up, so ⌘Z and
// ⇧⌘Z for the score are taken by a local key monitor (from JS's undo state, which is current) before the menu sees them.

import AppKit
import SwiftUI

final class EditMenuModel: ObservableObject {
  @Published private(set) var canUndo = false
  @Published private(set) var canRedo = false
  /// A text field or text view is being edited (its field editor has the keys).
  @Published private(set) var isEditingText = false
  private var observers: [NSObjectProtocol] = []
  private var keyMonitor: Any?

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
    ]
    keyMonitor = NSEvent.addLocalMonitorForEvents(matching: .keyDown) { [weak self] event in
      self?.takeScoreHistoryKey(event) == true ? nil : event
    }
  }

  deinit {
    observers.forEach(NotificationCenter.default.removeObserver)
    keyMonitor.map(NSEvent.removeMonitor)
  }

  /// ⌘Z / ⇧⌘Z in the main window, outside a text field, with something to undo / redo: posted for the score. Else the
  /// key goes on (a text field's own undo, the menu's beep).
  private func takeScoreHistoryKey(_ event: NSEvent) -> Bool {
    guard let window = event.window, window == NSApp.mainWindow, !(window.firstResponder is NSText),
          event.charactersIgnoringModifiers?.lowercased() == "z" else {
      return false
    }
    switch event.modifierFlags.intersection([.command, .shift, .option, .control]) {
    case [.command] where canUndo:
      NotificationCenter.default.post(name: .GPEditorUndoCommand, object: nil)
      return true
    case [.command, .shift] where canRedo:
      NotificationCenter.default.post(name: .GPEditorRedoCommand, object: nil)
      return true
    default:
      return false
    }
  }

  /// The text being edited takes the undo or redo itself; else the score's goes to JS.
  static func perform(_ textAction: Selector, score: Notification.Name) {
    if NSApp.keyWindow?.firstResponder is NSText {
      NSApp.sendAction(textAction, to: nil, from: nil)
    } else {
      NotificationCenter.default.post(name: score, object: nil)
    }
  }
}

/// Edit ▸ Undo and Redo, in place of SwiftUI's (CommandGroup(replacing: .undoRedo)).
struct UndoRedoCommands: View {
  @ObservedObject var model: EditMenuModel

  var body: some View {
    Button("Undo") {
      EditMenuModel.perform(Selector(("undo:")), score: .GPEditorUndoCommand)
    }
    .keyboardShortcut("z")
    .disabled(!model.canUndo && !model.isEditingText)
    Button("Redo") {
      EditMenuModel.perform(Selector(("redo:")), score: .GPEditorRedoCommand)
    }
    .keyboardShortcut("z", modifiers: [.command, .shift])
    .disabled(!model.canRedo && !model.isEditingText)
  }
}
